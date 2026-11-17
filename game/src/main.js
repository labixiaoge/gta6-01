// Sunhaven Bay — main entry. Boots three.js, builds the city, runs the game
// loop and wires every system together: on-foot and driving controls, traffic,
// pedestrians, police, missions, combat, HUD, saving and the start screen.
import * as THREE from 'three';
import { buildCity, hitsCollider, nearestRoadCoord } from './city.js';
import { Car, spawnTrafficCar } from './vehicles.js';
import { Person, makePersonMesh, spawnCrowd } from './people.js';
import { Combat, Wanted } from './combat.js';
import { MissionRunner, MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { loadSave, writeSave, defaultSave, clearSave, loadSettings, writeSettings } from './save.js';
import { clamp, dist2d, rand, angleLerp, fmtTime, smoothstep } from './util.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const sound = new SoundBank();
sound.muted = loadSettings().muted;
const hud = new Hud();
const city = buildCity(scene);
const combat = new Combat(scene, sound);
const wanted = new Wanted();

// Mission marker beacon: a pulsing yellow column over the objective.
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(2.2, 2.2, 30, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
beacon.position.y = 15;
scene.add(beacon);
const beaconRing = new THREE.Mesh(
  new THREE.RingGeometry(2.5, 4, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.y = 0.15;
scene.add(beaconRing);

// ---- Game state ----
const save = loadSave() || defaultSave();
const game = {
  mode: 'menu',           // menu | playing | paused | wasted
  money: save.money,
  health: 100, armor: 50,
  playSeconds: save.playSeconds || 0,
  kills: save.kills || 0, carsStolen: save.carsStolen || 0,
  bestWanted: save.bestWanted || 0,
  day: 1, minutes: 8 * 60,
  wanted, combat, sound,
  player: null, car: null, // current player car
};
const missions = new MissionRunner(city.landmarks, {
  say: (who, line) => hud.say(who, line),
  toast: (t) => hud.toast(t),
  soundPickup: () => sound.pickup(),
  setWanted: (n) => { wanted.heat = n * 16; wanted.stars = n; },
  spawnGuards: (place, n) => spawnGuardsAt(place, n),
  passed: (m, bonus) => {
    game.money += m.reward + (bonus || 0);
    missions.index++;
    sound.missionPass();
    hud.showMissionCard('MISSION PASSED', m.name + ' — ' + m.outro, m.reward + (bonus || 0));
    hud.say('LENA', m.outro, 8000);
    saveNow();
    if (missions.done) hud.toast('🏆 ALL MISSIONS COMPLETE — you own Sunhaven Bay!', 6000);
  },
  failed: (reason) => hud.toast('MISSION FAILED: ' + reason, 4000),
});
missions.index = save.missionIndex || 0;

// ---- Player ----
const player = {
  mesh: makePersonMesh(0x2e6fd2, 0xc98a5a),
  x: -128, z: 0, heading: Math.PI / 2, speed: 0,
  inCar: false, car: null, carSpeed: 0,
  interactHeld: false, bustedTimer: 0, hurtTimer: 0,
};
player.mesh.position.set(player.x, 0, player.z);
scene.add(player.mesh);
game.player = player;
let camYaw = player.heading;
let camPitch = 0.32;
let camDist = 9;

// ---- World population ----
const traffic = [];
for (let i = 0; i < 14; i++) {
  traffic.push(spawnTrafficCar(scene, rand(-140, 140), rand(-140, 140)));
}
// A few parked cars the player can steal right away.
const parked = [];
for (const [px, pz, h] of [[-124, 8, 0], [-112, -8, Math.PI], [8, -124, Math.PI / 2], [60, 8, 0], [-8, 60, -Math.PI / 2]]) {
  const c = new Car(scene, px, pz, h);
  c.targetSpeed = 0; c.maxSpeed = 26;
  parked.push(c);
}
const crowd = spawnCrowd(scene, 26);
const policeCars = [];
const footCops = [];
const guards = [];

function spawnGuardsAt(place, n) {
  const lm = city.landmarks[place];
  if (!lm) return;
  // Guards stand outside the building, on the street around it — spawning
  // them at the landmark's centre used to bury them inside the walls.
  const hw = (lm.w || 20) / 2, hd = (lm.d || 20) / 2;
  for (let i = 0; i < n; i++) {
    const side = i % 4;
    let gx, gz;
    if (side === 0) { gx = lm.x - hw - 3; gz = lm.z + rand(-hd, hd); }
    else if (side === 1) { gx = lm.x + hw + 3; gz = lm.z + rand(-hd, hd); }
    else if (side === 2) { gx = lm.x + rand(-hw, hw); gz = lm.z - hd - 3; }
    else { gx = lm.x + rand(-hw, hw); gz = lm.z + hd + 3; }
    const g = new Person(scene, gx, gz, { guard: true, shirt: 0x222222 });
    guards.push(g);
  }
  hud.toast('⚠ Armed guards ahead!');
}

// ---- Input ----
const keys = {};
let mouseDown = false;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyR') { if (combat.reload()) hud.toast('Reloaded'); }
  if (e.code === 'KeyH') { sound.ensure(); sound.horn(); }
  if (e.code === 'KeyN') {
    const muted = sound.toggleMute();
    writeSettings({ muted });
    hud.toast(muted ? '🔇 Sound off' : '🔊 Sound on');
  }
  if (e.code === 'KeyM') showMissionList();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousedown', (e) => {
  if (game.mode !== 'playing') return;
  mouseDown = true;
  sound.ensure();
  canvas.requestPointerLock?.();
  tryShoot();
});
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas) {
    camYaw -= e.movementX * 0.0032;
    camPitch = clamp(camPitch + e.movementY * 0.002, 0.08, 0.9);
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function tryInteract() {
  if (game.mode !== 'playing') return;
  sound.ensure();
  if (player.inCar) { exitCar(); return; }
  // Near a car? Steal it.
  const allCars = [...traffic, ...parked, ...policeCars];
  let best = null, bestD = 5;
  for (const c of allCars) {
    if (c.dead) continue;
    const d = dist2d(player.x, player.z, c.x, c.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) { enterCar(best); return; }
  // Near a mission interact point?
  const s = missions.currentStep();
  if (missions.active && s && s.type === 'interact') {
    const lm = city.landmarks[s.place];
    if (lm && dist2d(player.x, player.z, lm.x, lm.z) < s.radius) {
      missions.onInteract();
      sound.pickup();
      return;
    }
  }
  hud.toast('Nothing to interact with here');
}

function enterCar(car) {
  player.inCar = true;
  player.car = car;
  car.isPlayer = true;
  game.car = car;
  game.carsStolen++;
  player.mesh.visible = false;
  wanted.crime(8);
  hud.toast('🚗 Stole a ' + car.name + ' — the cops noticed!');
  sound.crash();
  missions.onStealCar();
  saveNow();
}
function exitCar() {
  const car = player.car;
  if (!car) return;
  car.isPlayer = false;
  player.inCar = false;
  player.car = null;
  game.car = null;
  const f = car.forward();
  player.x = car.x - f.x * 3;
  player.z = car.z - f.z * 3;
  player.heading = car.heading;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
}

function tryShoot() {
  if (player.inCar && !player.car) return;
  const origin = new THREE.Vector3(player.x, 1.5, player.z);
  if (player.inCar) { origin.set(player.car.x, 1.4, player.car.z); }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const target = origin.clone().addScaledVector(dir, 55);
  const hit = combat.shoot(origin, target, [...crowd, ...guards, ...footCops], [...traffic, ...parked, ...policeCars]);
  if (hit) {
    if (hit.kind === 'person') {
      const died = hit.obj.damage(34);
      if (hit.obj.police || hit.obj.guard) wanted.crime(6);
      else wanted.crime(12);
      if (died) {
        game.kills++;
        if (hit.obj.guard) missions.onKill();
        hud.toast(hit.obj.police ? 'Cop down!' : 'Target down');
      }
    } else {
      const died = hit.obj.damage(20);
      if (died) { hud.toast('Car destroyed!'); wanted.crime(10); }
    }
  } else if (combat.ammo === 0) {
    hud.toast('Out of ammo — press R to reload');
  }
  // Nearby pedestrians panic at gunfire.
  for (const p of crowd) if (dist2d(p.x, p.z, player.x, player.z) < 25) p.scare();
}

function showMissionList() {
  if (missions.done) { hud.toast('All missions complete — free roam!'); return; }
  const m = missions.current();
  hud.say('MISSIONS', (missions.index + 1) + '/5 — ' + m.name + ': ' + m.steps.map((s) => s.text).join(' → '));
}

function togglePause() {
  if (game.mode === 'playing') {
    game.mode = 'paused';
    document.getElementById('pausemenu').classList.remove('hidden');
    document.getElementById('pause-stats').innerHTML =
      'Cash ' + game.money + ' · Missions ' + missions.index + '/5 · Kills ' + game.kills +
      ' · Cars stolen ' + game.carsStolen + ' · Best wanted ' + game.bestWanted + '★' +
      ' · Played ' + fmtTime(game.playSeconds);
    document.exitPointerLock?.();
  } else if (game.mode === 'paused') {
    game.mode = 'playing';
    document.getElementById('pausemenu').classList.add('hidden');
  }
}

// ---- Menu wiring ----
const menuEl = document.getElementById('menu');
const saved = loadSave();
if (saved && saved.missionIndex > 0) {
  const btn = document.getElementById('btn-continue');
  btn.classList.remove('hidden');
  document.getElementById('cont-label').textContent =
    'Mission ' + (saved.missionIndex + 1) + '/5 · $' + saved.money;
}
document.getElementById('btn-how').onclick = () => {
  document.getElementById('howto').classList.toggle('hidden');
};
document.getElementById('btn-start').onclick = () => startGame(true);
document.getElementById('btn-continue').onclick = () => startGame(false);
document.getElementById('btn-resume').onclick = () => togglePause();
document.getElementById('btn-restart').onclick = () => {
  document.getElementById('pausemenu').classList.add('hidden');
  missions.start();
  game.mode = 'playing';
};
document.getElementById('btn-quit').onclick = () => location.reload();

function startGame(fresh) {
  if (fresh) {
    clearSave();
    Object.assign(save, defaultSave());
    game.money = 250; missions.index = 0; game.kills = 0; game.carsStolen = 0;
    game.health = 100; game.armor = 50;
  } else {
    game.money = save.money; missions.index = save.missionIndex || 0;
    game.kills = save.kills || 0; game.carsStolen = save.carsStolen || 0;
  }
  sound.ensure();
  menuEl.classList.add('hidden');
  hud.show();
  game.mode = 'playing';
  hud.toast('Welcome to Sunhaven Bay, Marco.');
  hud.say('LENA', 'Marco! You made it. Come see me at the garage on Harbor Row — press M for your jobs.', 9000);
  if (!missions.done) missions.start();
}

function saveNow() {
  writeSave({
    money: Math.floor(game.money), missionIndex: missions.index,
    kills: game.kills, carsStolen: game.carsStolen, bestWanted: game.bestWanted,
    playSeconds: Math.floor(game.playSeconds), createdAt: save.createdAt || Date.now(),
  });
}

// ---- Police response ----
function maintainPolice(dt) {
  const want = wanted.policeCount();
  // Spawn patrol cars until the heat is answered.
  while (policeCars.length < want) {
    const a = rand(0, Math.PI * 2);
    const px = clamp(player.x + Math.sin(a) * 70, -148, 148);
    const pz = clamp(player.z + Math.cos(a) * 70, -148, 148);
    const c = new Car(scene, nearestRoadCoord(px), nearestRoadCoord(pz), rand(0, Math.PI * 2), { police: true });
    policeCars.push(c);
  }
  while (policeCars.length > want) {
    const c = policeCars.pop();
    c.remove(scene);
  }
  // Foot cops join the chase at 3+ stars.
  const wantCops = wanted.stars >= 3 ? 2 : 0;
  while (footCops.length < wantCops) {
    const a = rand(0, Math.PI * 2);
    footCops.push(new Person(scene, player.x + Math.sin(a) * 30, player.z + Math.cos(a) * 30, { police: true }));
  }
  while (footCops.length > wantCops) footCops.pop().remove(scene);
  // Busted: a patrol car sits on the player on foot.
  if (!player.inCar && wanted.stars > 0) {
    let near = false;
    for (const c of policeCars) if (dist2d(c.x, c.z, player.x, player.z) < 3) near = true;
    player.bustedTimer = near ? player.bustedTimer + dt : 0;
    if (player.bustedTimer > 1.5) {
      player.bustedTimer = 0;
      const fine = Math.min(100, game.money);
      game.money -= fine;
      wanted.clear();
      sound.busted();
      hud.toast('BUSTED! Fine $' + fine + ' — the PD let you off at the garage.');
      respawnAtGarage();
    }
  }
}

function respawnAtGarage() {
  if (player.inCar) exitCar();
  player.x = -128; player.z = 12;
  player.heading = Math.PI / 2;
  player.mesh.position.set(player.x, 0, player.z);
  game.health = 100; game.armor = 50;
  hud.showWasted(false);
  game.mode = 'playing';
}

function wasted() {
  game.mode = 'wasted';
  hud.showWasted(true);
  sound.busted();
  hud.toast('WASTED — you wake up at the garage, lighter by half your cash.');
  setTimeout(() => {
    game.money = Math.floor(game.money / 2);
    wanted.clear();
    respawnAtGarage();
    saveNow();
  }, 2600);
}

// ---- Per-frame update ----
const clock = new THREE.Clock();
let saveTimer = 0;
let skidTimer = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (game.mode === 'playing') {
    game.playSeconds += dt;
    game.minutes += dt * 0.5;
    if (game.minutes >= 1440) { game.minutes -= 1440; game.day++; }
    player.hurtTimer = Math.max(0, player.hurtTimer - dt);
    wanted.update(dt);
    game.bestWanted = Math.max(game.bestWanted, wanted.stars);
    combat.update(dt);
    missions.update(dt, player, game);
    player.interactHeld = !!keys['KeyE'];

    // --- Player movement ---
    if (player.inCar && player.car) {
      const input = {
        forward: keys['KeyW'] || keys['ArrowUp'],
        back: keys['KeyS'] || keys['ArrowDown'],
        left: keys['KeyA'] || keys['ArrowLeft'],
        right: keys['KeyD'] || keys['ArrowRight'],
        brake: keys['Space'],
      };
      const speedBefore = Math.abs(player.car.speed);
      player.car.drive(dt, input);
      skidTimer -= dt;
      if (input.brake && speedBefore > 14 && skidTimer <= 0) { sound.skid(); skidTimer = 0.5; }
      player.carSpeed = player.car.speed;
      player.x = player.car.x; player.z = player.car.z;
      player.heading = player.car.heading;
      camYaw = angleLerp(camYaw, player.car.heading + Math.PI, dt * 2.5);
      sound.setEngine(Math.abs(player.car.speed) / player.car.maxSpeed, true);
      if (mouseDown) tryShoot();
      // Ramming pedestrians is a crime, and it hurts.
      for (const p of crowd) {
        if (!p.dead && dist2d(p.x, p.z, player.x, player.z) < 2.2 && Math.abs(player.car.speed) > 6) {
          p.damage(100); wanted.crime(10); game.kills++;
          hud.toast('Pedestrian hit! Wanted up.');
        }
      }
      // Crash into buildings slows the car hard.
      if (hitsCollider(city.colliders, player.car.x, player.car.z, 2)) {
        if (Math.abs(player.car.speed) > 12) { sound.crash(); player.car.speed *= -0.25; }
        player.car.speed *= 0.9;
      }
    } else {
      sound.setEngine(0, false);
      const run = keys['ShiftLeft'] || keys['ShiftRight'];
      const sp = run ? 9 : 5;
      let mx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
      let mz = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len; mz /= len;
        // Move relative to the camera yaw.
        const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
        const wx = (mx * cos - mz * sin) * sp;
        const wz = (mx * sin + mz * cos) * sp;
        const nx = player.x + wx * dt, nz = player.z + wz * dt;
        if (!hitsCollider(city.colliders, nx, player.z, 0.6)) player.x = nx;
        if (!hitsCollider(city.colliders, player.x, nz, 0.6)) player.z = nz;
        player.heading = angleLerp(player.heading, Math.atan2(wx, wz), dt * 10);
        player.speed = sp;
        player.mesh.userData.legs[0].rotation.x = Math.sin(t * (run ? 13 : 9)) * 0.6;
        player.mesh.userData.legs[1].rotation.x = -Math.sin(t * (run ? 13 : 9)) * 0.6;
      } else {
        player.speed = 0;
        player.mesh.userData.legs[0].rotation.x = 0;
        player.mesh.userData.legs[1].rotation.x = 0;
      }
      player.mesh.position.set(player.x, 0, player.z);
      player.mesh.rotation.y = player.heading;
      // Slow health regen when the heat is off.
      if (wanted.stars === 0 && game.health < 100) game.health = Math.min(100, game.health + dt * 1.5);
      if (mouseDown) tryShoot();
    }

    // --- World life ---
    for (const c of traffic) { c.cruise(dt, city.colliders, [...traffic, ...parked, ...policeCars]); c.updateLights(t); }
    for (const c of parked) c.updateLights(t);
    for (const p of crowd) p.update(dt, player, city.colliders);
    for (const g of guards) {
      g.update(dt, player, city.colliders, (shooter) => {
        if (dist2d(shooter.x, shooter.z, player.x, player.z) < 26) {
          hurtPlayer(8);
          hud.toast('Taking fire!');
        }
      });
    }
    for (const c of footCops) {
      c.update(dt, player, city.colliders, (shooter) => {
        if (dist2d(shooter.x, shooter.z, player.x, player.z) < 22) hurtPlayer(6);
      });
    }
    maintainPolice(dt);
    for (const c of policeCars) {
      const d = c.chase(dt, player.x, player.z, city.colliders);
      c.updateLights(t);
      if (d < 3.2 && !player.inCar) hurtPlayer(12 * dt * 10);
      else if (d < 3.5 && player.inCar && Math.abs(c.speed) > 5) {
        player.car.speed *= 0.85;
        if (Math.random() < dt * 2) { sound.crash(); hud.toast('The PD is ramming you!'); }
      }
    }
    // Traffic bumps the player on foot.
    for (const c of traffic) {
      if (!player.inCar && dist2d(c.x, c.z, player.x, player.z) < 2 && Math.abs(c.speed) > 4) {
        hurtPlayer(15);
        player.x += Math.sin(c.heading) * 2;
        player.z += Math.cos(c.heading) * 2;
      }
    }
    sound.setSiren(wanted.stars > 0, t);
    if (game.health <= 0) wasted();

    // --- Mission beacon ---
    const mp = missions.markerPos();
    if (missions.active && mp) {
      beacon.visible = true; beaconRing.visible = true;
      beacon.position.set(mp.x, 15, mp.z);
      beaconRing.position.set(mp.x, 0.15, mp.z);
      beacon.material.opacity = 0.22 + Math.sin(t * 3) * 0.1;
      const s = 1 + smoothstep(0, 1, (Math.sin(t * 3) + 1) / 2) * 0.24;
      beaconRing.scale.set(s, s, 1);
    } else {
      beacon.visible = false; beaconRing.visible = false;
    }
    // Hold-to-grab progress shows in the objective line.
    const step = missions.currentStep();
    if (missions.active && step && step.type === 'hold') {
      hud.el.mtext.textContent = step.text + ' — ' + Math.round((missions.holdProgress / step.holdTime) * 100) + '%';
    }

    // --- Camera: chase cam behind the player/car ---
    const targetX = player.x, targetZ = player.z;
    const cy = player.inCar ? camYaw : camYaw;
    const cx = targetX + Math.sin(cy) * camDist;
    const cz = targetZ + Math.cos(cy) * camDist;
    const cyy = (player.inCar ? 4.2 : 3.4) + Math.sin(camPitch) * 3;
    camera.position.lerp(new THREE.Vector3(cx, cyy, cz), 1 - Math.pow(0.001, dt));
    camera.lookAt(targetX, player.inCar ? 1.6 : 1.4, targetZ);

    // --- HUD ---
    hud.update({
      health: game.health, armor: game.armor, ammo: combat.ammo,
      money: game.money, wanted: wanted.stars,
      inCar: player.inCar, carName: player.car ? player.car.name : '',
      speed: player.inCar && player.car ? player.car.speed : 0,
      missionName: missions.active ? missions.current().name : (missions.done ? 'ALL MISSIONS DONE' : 'FREE ROAM'),
      missionText: missions.active && missions.currentStep() ? missions.currentStep().text : undefined,
      missionIndex: missions.index, missionTotal: MISSIONS.length,
      day: game.day, minutes: game.minutes,
    });
    hud.drawMinimap(player, missions.active ? missions.markerPos() : null, policeCars, traffic, crowd);

    saveTimer += dt;
    if (saveTimer > 15) { saveTimer = 0; saveNow(); }
  }

  renderer.render(scene, camera);
}

function hurtPlayer(amount) {
  if (game.mode !== 'playing') return;
  // Invulnerability window: one hit cannot hurt twice in the same half-second
  // (guards, foot cops and ramming police all call this every frame).
  if (player.hurtTimer > 0) return;
  player.hurtTimer = 0.5;
  const absorbed = Math.min(game.armor, amount * 0.5);
  game.armor -= absorbed;
  game.health -= (amount - absorbed);
  if (game.health <= 0) game.health = 0;
  hud.flashDamage();
  sound.blip(180, 0.12, 'sawtooth', 0.12);
}

// Screenshot / demo modes: ?shot=chase|street|mission — jump straight into a
// live scene so screenshots show the real game, not the menu.
function applyShotMode() {
  if (!SHOT || SHOT === 'menu' || SHOT === 'start') return;
  startGame(true);
  if (SHOT === 'chase') {
    const car = parked[3];
    player.x = car.x; player.z = car.z;
    enterCar(car);
    car.speed = 18;
    wanted.crime(40); // 2 stars, police on the way
    missions.index = 1;
    missions.start();
    hud.toast('🚨 2★ WANTED — lose the Sunhaven PD!');
    // Put two patrol cars right in front of the chase camera so the shot
    // shows the pursuit, not empty road: one ahead-left closing in, one
    // alongside on the right. The chase AI takes over from here.
    const f = car.forward();
    const left = { x: -f.z, z: f.x };
    const p1 = new Car(scene, car.x + f.x * 24 + left.x * 7, car.z + f.z * 24 + left.z * 7,
      car.heading + Math.PI, { police: true });
    const p2 = new Car(scene, car.x + f.x * 16 - left.x * 8, car.z + f.z * 16 - left.z * 8,
      car.heading, { police: true });
    policeCars.push(p1, p2);
  } else if (SHOT === 'street') {
    // On the road itself (x = 60 is a grid line), facing south down Harbor Row
    // toward the parked car at (60, 8) — not on the grass inside a block.
    player.x = 60; player.z = -44;
    player.heading = 0;
    player.mesh.position.set(player.x, 0, player.z);
    missions.start();
  } else if (SHOT === 'mission') {
    // Just west of Sunhaven Bank, facing north-east at it: the guards on its
    // west face, the mission beacon and the bank facade share the frame.
    player.x = 2; player.z = -40;
    player.heading = Math.PI * 0.75;
    player.mesh.position.set(player.x, 0, player.z);
    missions.index = 3;
    missions.start();
    wanted.crime(30);
  }
  camYaw = player.heading + Math.PI;
}

// Expose a small handle for the screenshot harness to verify the game state.
window.__game = { game, missions, wanted, combat, player, traffic, crowd, SHOT };
animate();
applyShotMode();
