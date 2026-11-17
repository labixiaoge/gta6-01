// Sunhaven Bay itself: a sun-soaked port city built from boxes, canvas textures
// and light. Grid streets, a beach on the south shore, a harbor on the east,
// a downtown of towers and a garage district. All geometry is generated here.
import * as THREE from 'three';
import { hash2, rand } from './util.js';

export const CITY = {
  half: 150,          // city extends -150..150 on x and z
  block: 60,          // block pitch
  road: 14,           // road width
  roadLines: [-120, -60, 0, 60, 120],
};

function facadeTexture(base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  for (let y = 22; y < 244; y += 26) {
    for (let x = 12; x < 116; x += 24) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? '#ffe9a0' : 'rgba(20,30,55,0.85)';
      g.fillRect(x, y, 15, 17);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2c2f36'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f7d54d';
  g.fillRect(62, 0, 4, 128);
  g.fillStyle = '#e8e8e8';
  g.fillRect(0, 0, 3, 128); g.fillRect(125, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const colliders = [];   // {x, z, hw, hd} axis-aligned boxes the player/cars hit
  const buildings = [];
  const palette = ['#c96f4a', '#d9a05b', '#7fa8c9', '#b7c4c9', '#e08e79', '#8fa98f', '#c9b458', '#9a7fb5'];
  const facadeMats = palette.map((col) => new THREE.MeshLambertMaterial({ map: facadeTexture(col, 0.35) }));

  // Sun, sky and haze.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 180, 420);
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cf, 1.9);
  sun.position.set(120, 180, 60);
  scene.add(sun);

  // Ground: grass-green city floor with a sand beach strip on the south edge.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x5d8a4a });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 26),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a }));
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.02, 163);
  scene.add(beach);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 60),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, 205);
  scene.add(sea);

  // Roads: dark strips along every grid line. Both orientations use the same
  // 14-wide, 320-long strip; the along-x road gets an in-plane 90-degree turn
  // (rotation.z is applied before rotation.x, so the strip stays flat and the
  // centre line runs along its length). Texture repeats along the long axis.
  const roadTex = roadTexture();
  for (const v of CITY.roadLines) {
    const texH = roadTex.clone(); texH.needsUpdate = true; texH.repeat.set(1, 20);
    const stripH = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, 320),
      new THREE.MeshLambertMaterial({ map: texH }));
    stripH.rotation.x = -Math.PI / 2;
    stripH.rotation.z = Math.PI / 2;
    stripH.position.set(0, 0.05, v);
    scene.add(stripH);
    const texV = roadTex.clone(); texV.needsUpdate = true; texV.repeat.set(1, 20);
    const stripV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, 320),
      new THREE.MeshLambertMaterial({ map: texV }));
    stripV.rotation.x = -Math.PI / 2;
    stripV.position.set(v, 0.05, 0);
    scene.add(stripV);
  }
  // Sidewalk slabs at intersections.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
  for (const x of CITY.roadLines) for (const z of CITY.roadLines) {
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), walkMat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(x, 0.04, z);
    scene.add(slab);
  }
  // Zebra crossings: white stripes across each road at every intersection,
  // so the grid reads as a city street and not a bare ribbon of asphalt.
  const zebraMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const stripeGeo = new THREE.PlaneGeometry(1.6, 5.5);
  for (const x of CITY.roadLines) for (const z of CITY.roadLines) {
    for (let k = -2; k <= 2; k++) {
      const s1 = new THREE.Mesh(stripeGeo, zebraMat);
      s1.rotation.x = -Math.PI / 2;
      s1.position.set(x + k * 2.6, 0.06, z - 9.5);
      scene.add(s1);
      const s2 = new THREE.Mesh(stripeGeo, zebraMat);
      s2.rotation.x = -Math.PI / 2;
      s2.rotation.z = Math.PI / 2;
      s2.position.set(x - 9.5, 0.06, z + k * 2.6);
      scene.add(s2);
    }
  }

  // Buildings fill each block between roads; downtown towers near the centre.
  const blockCenters = [];
  for (let i = 0; i < CITY.roadLines.length - 1; i++) {
    for (let j = 0; j < CITY.roadLines.length - 1; j++) {
      blockCenters.push([(CITY.roadLines[i] + CITY.roadLines[i + 1]) / 2,
                         (CITY.roadLines[j] + CITY.roadLines[j + 1]) / 2]);
    }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [bx, bz] of blockCenters) {
    const downtown = Math.abs(bx) <= 30 && Math.abs(bz) <= 30;
    const n = downtown ? 1 : rand(0, 1) < 0.7 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const w = downtown ? rand(26, 34) : rand(14, 22);
      const d = downtown ? rand(26, 34) : rand(14, 22);
      const h = downtown ? rand(38, 70) : rand(10, 26);
      const ox = n === 2 ? (k === 0 ? -11 : 11) : 0;
      const oz = n === 2 ? (k === 0 ? -11 : 11) : 0;
      const mat = facadeMats[Math.floor(hash2(bx + ox, bz + oz) * facadeMats.length)];
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(w, h, d);
      b.position.set(bx + ox, h / 2, bz + oz);
      scene.add(b);
      // Rooftop box so towers read as buildings, not slabs.
      const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x4a4a52 }));
      roof.scale.set(w * 0.4, 2.5, d * 0.4);
      roof.position.set(bx + ox, h + 1.2, bz + oz);
      scene.add(roof);
      colliders.push({ x: bx + ox, z: bz + oz, hw: w / 2, hd: d / 2 });
      buildings.push({ x: bx + ox, z: bz + oz, w, d, h });
    }
  }

  // Landmarks: Lena's garage (west), Sunhaven Bank (downtown), the docks (east),
  // the marina (south beach) and the hideout alley (north).
  const landmarks = {};
  function landmark(name, x, z, w, d, h, color, label) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    scene.add(m);
    colliders.push({ x, z, hw: w / 2, hd: d / 2 });
    landmarks[name] = { x, z, label, w, d };
    return m;
  }
  landmark('garage', -138, 0, 20, 26, 9, 0xd94f30, "Lena's Garage");
  landmark('bank', 30, -30, 30, 22, 24, 0xe8dcc0, 'Sunhaven Bank');
  landmark('dock', 138, 60, 24, 30, 12, 0x5a6a7a, 'Harbor Docks');
  landmark('marina', 60, 138, 26, 16, 8, 0x3a8a9a, 'Marina Club');
  landmark('hideout', -60, -138, 18, 18, 10, 0x7a5a8a, 'Hideout Alley');

  // Palm trees along the beach and the harbor road.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8a4a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const leafGeo = new THREE.ConeGeometry(3.2, 3.5, 6);
  for (let i = 0; i < 18; i++) {
    const x = -140 + i * 16 + rand(-3, 3);
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(x, 3.5, 148); scene.add(t);
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(x, 8, 148); scene.add(l);
  }
  for (let i = 0; i < 8; i++) {
    const z = -120 + i * 34 + rand(-3, 3);
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(148, 3.5, z); scene.add(t);
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.position.set(148, 8, z); scene.add(l);
  }
  // Beach umbrellas on the sand strip, so the south shore reads as a beach.
  const umbrellaColors = [0xff5a5a, 0xffd23e, 0x3a7bff, 0x50c878];
  const poleGeoU = new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6);
  const canopyGeo = new THREE.ConeGeometry(2.6, 1.2, 8);
  for (let i = 0; i < 9; i++) {
    const x = -130 + i * 32 + rand(-5, 5);
    const pole = new THREE.Mesh(poleGeoU, trunkMat);
    pole.position.set(x, 1.7, 160); scene.add(pole);
    const canopy = new THREE.Mesh(canopyGeo,
      new THREE.MeshLambertMaterial({ color: umbrellaColors[i % umbrellaColors.length] }));
    canopy.position.set(x, 3.9, 160); scene.add(canopy);
  }
  // Street lamps at intersections.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x887722 });
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 7, 6);
  const lampGeo = new THREE.SphereGeometry(0.7, 8, 6);
  for (const x of CITY.roadLines) for (const z of CITY.roadLines) {
    const p = new THREE.Mesh(poleGeo, poleMat);
    p.position.set(x + 9, 3.5, z + 9); scene.add(p);
    const l = new THREE.Mesh(lampGeo, lampMat);
    l.position.set(x + 9, 7.2, z + 9); scene.add(l);
  }
  return { colliders, buildings, landmarks, roads: CITY.roadLines };
}

// Point-in-collider test used by walking, driving and traffic.
export function hitsCollider(colliders, x, z, r) {
  for (const c of colliders) {
    if (Math.abs(x - c.x) < c.hw + r && Math.abs(z - c.z) < c.hd + r) return c;
  }
  return null;
}
// Is this point on a road (within half the road width of a grid line)?
export function onRoad(x, z) {
  const m = CITY.road;
  for (const v of CITY.roadLines) {
    if (Math.abs(z - v) < m / 2 || Math.abs(x - v) < m / 2) return true;
  }
  return false;
}
export function nearestRoadCoord(v) {
  let best = CITY.roadLines[0], bd = 1e9;
  for (const r of CITY.roadLines) { const d = Math.abs(v - r); if (d < bd) { bd = d; best = r; } }
  return best;
}
