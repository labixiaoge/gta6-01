// Combat: the player's pistol, tracer shots, muzzle flash and the wanted
// system that answers crime. Shooting, stealing a car or hitting a pedestrian
// raises the heat; the Sunhaven PD answers with patrol cars and foot cops.
import * as THREE from 'three';
import { clamp, dist2d } from './util.js';

export class Combat {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.ammo = 24;
    this.reserve = 96;
    this.cooldown = 0;
    this.tracers = [];
    this.impacts = [];   // fading spark puffs where shots land
    this.flash = new THREE.PointLight(0xffcc66, 0, 18);
    this.scene.add(this.flash);
  }
  // A small orange puff that blooms and fades where a shot lands.
  spawnImpact(point) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }));
    mesh.position.copy(point);
    this.scene.add(mesh);
    this.impacts.push({ mesh, life: 0.28 });
  }
  // Fire from the player toward a world point. Returns the hit person/car or null.
  shoot(origin, target, people, cars) {
    if (this.cooldown > 0 || this.ammo <= 0) return null;
    this.cooldown = 0.22;
    this.ammo--;
    this.sound.gunshot();
    this.flash.position.copy(origin);
    this.flash.intensity = 60;
    setTimeout(() => { this.flash.intensity = 0; }, 60);
    // A pistol is not a laser: the shot wanders a little, more at long range.
    const range = origin.distanceTo(target);
    const spread = Math.min(0.9, 0.15 + range * 0.012);
    target = target.clone();
    target.x += (Math.random() - 0.5) * spread;
    target.y += (Math.random() - 0.5) * spread * 0.6;
    target.z += (Math.random() - 0.5) * spread;
    // Tracer line that fades fast.
    const geo = new THREE.BufferGeometry().setFromPoints([origin, target]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
    // Hit test: nearest person or car within a small cone of the shot line.
    let best = null, bestD = 1e9;
    const dir = target.clone().sub(origin).normalize();
    for (const p of people) {
      if (p.dead) continue;
      const to = new THREE.Vector3(p.x - origin.x, 1.2 - origin.y, p.z - origin.z);
      const along = to.dot(dir);
      if (along < 0 || along > 60) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.1 && along < bestD) { bestD = along; best = { kind: 'person', obj: p }; }
    }
    for (const c of cars) {
      if (c.dead) continue;
      const to = new THREE.Vector3(c.x - origin.x, 0.8 - origin.y, c.z - origin.z);
      const along = to.dot(dir);
      if (along < 0 || along > 60) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 2.4 && along < bestD) { bestD = along; best = { kind: 'car', obj: c }; }
    }
    if (best) {
      const hitPoint = origin.clone().addScaledVector(dir, bestD);
      this.spawnImpact(hitPoint);
    } else {
      // A miss still kicks up a spark where the round hits the ground or a wall.
      this.spawnImpact(target.clone());
    }
    return best;
  }
  reload() {
    if (this.ammo >= 12 || this.reserve <= 0) return false;
    const need = 12 - this.ammo;
    const take = Math.min(need, this.reserve);
    this.ammo += take; this.reserve -= take;
    this.sound.blip(440, 0.08, 'square', 0.12);
    return true;
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const t of this.tracers) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12);
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); }
    }
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const s of this.impacts) {
      s.life -= dt;
      const k = Math.max(0, s.life / 0.28);
      s.mesh.material.opacity = k * 0.9;
      s.mesh.scale.setScalar(1 + (1 - k) * 2.2);
      if (s.life <= 0) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    }
    this.impacts = this.impacts.filter((s) => s.life > 0);
  }
}

// Heat 0..100 maps to 0..5 wanted stars; one place owns the thresholds so
// crime() and the cooldown in update() can never drift apart.
export function starsForHeat(heat) {
  return heat < 12 ? 0 : heat < 28 ? 1 : heat < 48 ? 2 : heat < 68 ? 3 : heat < 88 ? 4 : 5;
}

export class Wanted {
  constructor() {
    this.stars = 0;
    this.heat = 0;          // 0..100, stars follow heat
    this.quietTimer = 0;    // seconds since last crime
    this.busted = false;
  }
  crime(amount) {
    this.heat = clamp(this.heat + amount, 0, 100);
    this.quietTimer = 0;
    this.stars = starsForHeat(this.heat);
  }
  update(dt) {
    this.quietTimer += dt;
    if (this.quietTimer > 18 && this.stars > 0) {
      this.heat = Math.max(0, this.heat - dt * 2.5);
      this.stars = starsForHeat(this.heat);
    }
  }
  clear() { this.heat = 0; this.stars = 0; this.quietTimer = 0; }
  // How many police units the current heat calls for.
  policeCount() { return this.stars === 0 ? 0 : this.stars <= 1 ? 1 : this.stars <= 2 ? 2 : this.stars <= 3 ? 3 : 4; }
}
