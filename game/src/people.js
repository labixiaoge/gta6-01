// The people of Sunhaven Bay: pedestrians strolling the sidewalks, cops on foot
// and armed guards who defend mission targets. Simple box people with a walk
// cycle, panic when shots are fired, and a habit of fleeing from the player.
import * as THREE from 'three';
import { CITY, hitsCollider, onRoad } from './city.js';
import { angleLerp, clamp, dist2d, pick, rand } from './util.js';

const SHIRT_COLORS = [0xe84a5f, 0x4a90e8, 0x50c878, 0xf2c14e, 0x9b59b6, 0xffffff, 0x333333, 0xff8c42];
const NAMES = ['Marta', 'Joe', 'Priya', 'Carlos', 'Ana', 'Tom', 'Sofia', 'Ben', 'Rosa', 'Ken'];

export function makePersonMesh(shirt, skin = 0xd9a066, police = false) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: police ? 0x1a2a55 : 0x2a3a55 });
  const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.22);
  const legL = new THREE.Mesh(legGeo, legMat); legL.position.set(-0.14, 0.4, 0); g.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat); legR.position.set(0.14, 0.4, 0); g.add(legR);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34),
    new THREE.MeshLambertMaterial({ color: police ? 0x1a2a55 : shirt }));
  body.position.y = 1.18; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.78; g.add(head);
  if (police) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46),
      new THREE.MeshLambertMaterial({ color: 0x0a0a14 }));
    cap.position.y = 2.02; g.add(cap);
  }
  g.userData.legs = [legL, legR];
  return g;
}

export class Person {
  constructor(scene, x, z, opts = {}) {
    this.name = opts.name || pick(NAMES);
    this.police = !!opts.police;
    this.guard = !!opts.guard;
    this.health = this.guard ? 60 : 30;
    this.mesh = makePersonMesh(opts.shirt ?? pick(SHIRT_COLORS), opts.skin, this.police);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.heading = rand(0, Math.PI * 2);
    this.speed = this.police ? 6.5 : rand(1.2, 2.4);
    this.walkPhase = rand(0, 6);
    this.state = 'walk';       // walk | flee | chase | look | dead
    this.panic = 0;
    this.target = null;        // {x, z} for chase
    this.shootTimer = rand(1, 2);
    this.lookTimer = 0;        // tourists pause and look around
    this.tourist = !this.police && !this.guard && Math.random() < 0.2;
    this.dead = false;
  }
  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }

  update(dt, player, colliders, onShot) {
    if (this.dead) return;
    const d = dist2d(this.x, this.z, player.x, player.z);
    // Panic: pedestrians flee when the player shoots or drives at them.
    if (!this.police && !this.guard) {
      if (this.panic > 0) this.state = 'flee';
      else if (d < 3 && player.inCar && Math.abs(player.carSpeed || 0) > 5) this.state = 'flee';
      else if (this.state === 'look') {
        // Tourists stand still and slowly turn to take in the city.
        this.lookTimer -= dt;
        this.heading += dt * 0.6;
        if (this.lookTimer <= 0) this.state = 'walk';
      } else if (this.tourist && Math.random() < dt * 0.08) {
        this.state = 'look';
        this.lookTimer = rand(2, 4);
      } else this.state = 'walk';
    }
    if (this.police || this.guard) this.state = 'chase';
    let moveSpeed = 0;
    if (this.state === 'walk') {
      moveSpeed = this.speed;
      this.walkPhase += dt * 5;
      // Wander: pick a new heading at intersections, stay off buildings.
      if (Math.random() < dt * 0.25) this.heading += rand(-1.2, 1.2);
      if (!onRoad(this.x, this.z) && Math.random() < dt * 2) {
        // Step back toward the nearest road.
        this.heading = Math.atan2(-this.x, -this.z) + rand(-0.5, 0.5);
      }
    } else if (this.state === 'flee') {
      moveSpeed = 5.5;
      this.walkPhase += dt * 9;
      this.heading = angleLerp(this.heading, Math.atan2(this.x - player.x, this.z - player.z), dt * 4);
      this.panic -= dt;
      if (this.panic <= 0 && d > 20) this.state = 'walk';
    } else if (this.state === 'chase') {
      moveSpeed = this.police ? 6.5 : 4.5;
      this.walkPhase += dt * 8;
      this.heading = angleLerp(this.heading, Math.atan2(player.x - this.x, player.z - this.z), dt * 3);
      // Guards shoot when close enough.
      if ((this.guard || this.police) && d < 26 && d > 2) {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.shootTimer = rand(0.9, 1.6);
          if (onShot) onShot(this);
        }
      }
    }
    const nx = this.x + Math.sin(this.heading) * moveSpeed * dt;
    const nz = this.z + Math.cos(this.heading) * moveSpeed * dt;
    if (!hitsCollider(colliders, nx, nz, 0.5) && Math.abs(nx) < 155 && Math.abs(nz) < 155) {
      this.mesh.position.x = nx;
      this.mesh.position.z = nz;
    } else {
      this.heading += Math.PI / 2;
    }
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkPhase) * 0.5 * (moveSpeed > 0.1 ? 1 : 0);
    this.mesh.userData.legs[0].rotation.x = swing;
    this.mesh.userData.legs[1].rotation.x = -swing;
  }
  scare() { this.panic = 4; }
  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
      return true;
    }
    return false;
  }
  remove(scene) { scene.remove(this.mesh); }
}

// Scatter pedestrians across the sidewalks: pick points on the road grid so
// nobody spawns inside a building or out on the grass in the middle of a block.
export function spawnCrowd(scene, count) {
  const crowd = [];
  let guard = 0;
  while (crowd.length < count && guard++ < count * 40) {
    const x = rand(-140, 140), z = rand(-140, 140);
    if (!onRoad(x, z)) continue;
    crowd.push(new Person(scene, x, z));
  }
  return crowd;
}
