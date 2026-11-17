// Cars: the player's ride, city traffic and the Sunhaven PD.
// A car is a low-poly box body with a cabin, four wheel boxes and headlights;
// traffic follows the road grid, police chase the player when wanted.
import * as THREE from 'three';
import { CITY, hitsCollider, nearestRoadCoord } from './city.js';
import { angleDiff, angleLerp, clamp, dist2d, lerp, pick, rand } from './util.js';

const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xe8c832, 0x38b24a, 0xe8e8e8, 0x222226,
  0xd2691e, 0x7a4fd2, 0x3aa8a8, 0xc0c0c8];
const CAR_NAMES = ['Comet GT', 'Sunrise Sedan', 'Bay Cruiser', 'Harbor Van',
  'Palm Coupe', 'Dune Buggy', 'Metro Taxi', 'Coast Pickup'];

export function makeCarMesh(color, isPolice, name = '') {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a1a22 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xe8e8e8 : 0x1a2a3a });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), cabinMat);
  cabin.position.set(0, 1.15, -0.2); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheelGeo = new THREE.BoxGeometry(0.35, 0.7, 0.7);
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.35, wz); g.add(w);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xaa9922 });
  for (const lx of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), lightMat);
    l.position.set(lx, 0.6, 2.22); g.add(l);
  }
  // Brake lights at the rear: they glow when the car brakes.
  const brakeMat = new THREE.MeshLambertMaterial({ color: 0x880000, emissive: 0x220000 });
  const brakeL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), brakeMat);
  brakeL.position.set(-0.7, 0.62, -2.22); g.add(brakeL);
  const brakeR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), brakeMat);
  brakeR.position.set(0.7, 0.62, -2.22); g.add(brakeR);
  g.userData.brakeMat = brakeMat;
  if (isPolice) {
    const barMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x1133ff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5), barMat);
    bar.position.set(0, 1.55, -0.2); g.add(bar);
    g.userData.lightBarMat = barMat;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.25, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.75; g.add(stripe);
  }
  if (!isPolice && name === 'Metro Taxi') {
    // A lit roof sign so the city's cabs read as cabs at a glance.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xaa7711 }));
    sign.position.set(0, 1.58, -0.2); g.add(sign);
  }
  return g;
}

export class Car {
  constructor(scene, x, z, heading, opts = {}) {
    this.isPolice = !!opts.police;
    this.isPlayer = !!opts.player;
    this.name = opts.name || pick(CAR_NAMES);
    this.color = opts.color ?? pick(CAR_COLORS);
    this.mesh = makeCarMesh(this.color, this.isPolice, this.name);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;
    this.maxSpeed = this.isPolice ? 34 : rand(16, 24);
    this.steer = 0;
    this.health = 100;
    this.stuckTimer = 0;
    // Traffic AI state: which road and direction it follows.
    this.axis = Math.random() < 0.5 ? 'x' : 'z';
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.lane = (Math.random() < 0.5 ? -1 : 1) * 3.2;
    this.targetSpeed = rand(10, 16);
    this.dead = false;
  }
  get x() { return this.mesh.position.x; }
  get z() { return this.mesh.position.z; }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // Arcade driving for the player car: throttle, brake, steering.
  drive(dt, input) {
    const accel = 22, brake = 34, drag = 0.6;
    this.braking = !!input.brake;
    if (input.forward) this.speed += accel * dt;
    if (input.back) this.speed -= accel * 0.8 * dt;
    if (input.brake) this.speed -= Math.sign(this.speed) * brake * dt;
    this.speed -= this.speed * drag * dt;
    this.speed = clamp(this.speed, -10, this.maxSpeed);
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer = lerp(this.steer, steerTarget, dt * 6);
    const turnRate = 1.9 * Math.min(1, Math.abs(this.speed) / 8);
    this.heading += this.steer * turnRate * dt * Math.sign(this.speed || 1);
    const f = this.forward();
    this.mesh.position.x += f.x * this.speed * dt;
    this.mesh.position.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    // Tilt the body a little into corners and under braking: cheap juice.
    this.mesh.rotation.z = lerp(this.mesh.rotation.z, -this.steer * 0.05 * Math.sign(this.speed || 1), dt * 8);
    this.mesh.rotation.x = lerp(this.mesh.rotation.x, clamp(-this.speed * 0.002, -0.04, 0.04), dt * 8);
    // Keep inside the city; bounce off the invisible edge.
    if (Math.abs(this.mesh.position.x) > 158 || Math.abs(this.mesh.position.z) > 158) {
      this.speed *= -0.4;
      this.mesh.position.x = clamp(this.mesh.position.x, -158, 158);
      this.mesh.position.z = clamp(this.mesh.position.z, -158, 158);
    }
  }

  // Traffic AI: cruise along its road, slow for cars ahead, turn at intersections.
  cruise(dt, colliders, cars) {
    const f = this.forward();
    let want = this.targetSpeed;
    for (const o of cars) {
      if (o === this || o.dead) continue;
      const dx = o.x - this.x, dz = o.z - this.z;
      const ahead = dx * f.x + dz * f.z;
      if (ahead > 0 && ahead < 9 && Math.abs(dx * f.z - dz * f.x) < 2.2) { want = 0; break; }
    }
    this.speed = lerp(this.speed, want, dt * 1.5);
    this.mesh.position.x += f.x * this.speed * dt;
    this.mesh.position.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    // At an intersection, sometimes turn onto the crossing road.
    const nearX = nearestRoadCoord(this.x), nearZ = nearestRoadCoord(this.z);
    if (Math.abs(this.x - nearX) < 1.2 && Math.abs(this.z - nearZ) < 1.2 && Math.random() < dt * 0.5) {
      if (this.axis === 'x') {
        this.axis = 'z'; this.dir = Math.random() < 0.5 ? 1 : -1;
        this.heading = this.dir > 0 ? 0 : Math.PI;
      } else {
        this.axis = 'x'; this.dir = Math.random() < 0.5 ? 1 : -1;
        this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      this.mesh.position.x = nearX + (this.axis === 'x' ? 0 : this.lane);
      this.mesh.position.z = nearZ + (this.axis === 'z' ? 0 : this.lane);
    }
    // Off the grid? Snap back to the nearest road.
    if (Math.abs(this.x) > 150 || Math.abs(this.z) > 150) {
      this.heading += Math.PI;
      this.mesh.position.x = clamp(this.x, -148, 148);
      this.mesh.position.z = clamp(this.z, -148, 148);
    }
    if (hitsCollider(colliders, this.x, this.z, 2)) {
      this.heading += Math.PI / 2;
      this.speed = 4;
    }
  }

  // Police AI: chase the player, ram them, back off and re-approach.
  chase(dt, px, pz, colliders) {
    const d = dist2d(this.x, this.z, px, pz);
    const wantHeading = Math.atan2(px - this.x, pz - this.z);
    this.heading = angleLerp(this.heading, wantHeading, dt * 2.2);
    const want = d > 6 ? this.maxSpeed : this.maxSpeed * 0.4;
    this.speed = lerp(this.speed, want, dt * 1.2);
    const f = this.forward();
    this.mesh.position.x += f.x * this.speed * dt;
    this.mesh.position.z += f.z * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    if (hitsCollider(colliders, this.x, this.z, 2)) {
      this.heading += Math.PI * 0.6;
      this.speed = 6;
    }
    return d;
  }

  // Lights, called once a frame: a police light bar strobes red/blue, and the
  // brake lights glow whenever this car is braking or reversing hard.
  updateLights(t) {
    const barMat = this.mesh.userData.lightBarMat;
    if (barMat) {
      const red = Math.sin(t * 9) > 0;
      barMat.color.setHex(red ? 0xff2222 : 0x2244ff);
      barMat.emissive.setHex(red ? 0xff1111 : 0x1133ff);
    }
    const brakeMat = this.mesh.userData.brakeMat;
    if (brakeMat) {
      const braking = !!this.braking || this.speed < -1;
      brakeMat.emissive.setHex(braking ? 0xff2222 : 0x220000);
    }
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.z = 0.12;
      return true;
    }
    return false;
  }
  remove(scene) { scene.remove(this.mesh); }
}

// Spawn a parked or cruising car on a road near a point.
export function spawnTrafficCar(scene, x, z) {
  const road = pick(CITY.roadLines);
  const horizontal = Math.random() < 0.5;
  const cx = horizontal ? x : road + (Math.random() < 0.5 ? -3.2 : 3.2);
  const cz = horizontal ? road + (Math.random() < 0.5 ? -3.2 : 3.2) : z;
  const heading = horizontal ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2)
                             : (Math.random() < 0.5 ? 0 : Math.PI);
  const car = new Car(scene, cx, cz, heading);
  car.axis = horizontal ? 'x' : 'z';
  return car;
}
