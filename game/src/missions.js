// Missions and story: five jobs for the Harbor Crew, from stealing your first
// car to the big marina score. Each mission is a chain of steps with a map
// marker, a dialogue line and a cash reward. Progress is saved between sessions.
import { dist2d, fmtTime } from './util.js';

export const MISSIONS = [
  {
    id: 'm1', name: 'First Wheels', reward: 500, par: 120,
    intro: 'LENA: Marco! You need wheels before anything else. Jack a car on the street and bring it to my garage on Harbor Row.',
    steps: [
      { text: 'Steal any car (walk up and press E)', type: 'stealCar' },
      { text: 'Drive the car to Lena\'s Garage (yellow marker)', type: 'goto', place: 'garage', radius: 10 },
    ],
    outro: 'LENA: Not bad for a fresh face. The crew could use a driver like you.',
  },
  {
    id: 'm2', name: 'The Pickup', reward: 900, par: 180,
    intro: 'LENA: A package is waiting at the Harbor Docks. Pick it up and bring it back to the garage. Keep it clean — no cops.',
    steps: [
      { text: 'Drive to the Harbor Docks (yellow marker)', type: 'goto', place: 'dock', radius: 10 },
      { text: 'Grab the package (press E at the marker)', type: 'interact', place: 'dock', radius: 8 },
      { text: 'Return the package to Lena\'s Garage', type: 'goto', place: 'garage', radius: 10 },
    ],
    outro: 'LENA: Package delivered. The crew is talking about you, Marco.',
  },
  {
    id: 'm3', name: 'Hot Pursuit', reward: 1200, par: 240,
    intro: 'LENA: The PD impounded a crew car near the bank. "Borrow" it and lose the heat — get to the hideout alley up north without getting busted.',
    steps: [
      { text: 'Steal the crew car parked by Sunhaven Bank', type: 'goto', place: 'bank', radius: 12 },
      { text: 'Lose the cops — reach the Hideout Alley with no wanted stars', type: 'escape', place: 'hideout', radius: 12 },
    ],
    outro: 'LENA: Clean getaway. You drive like you were born behind the wheel.',
  },
  {
    id: 'm4', name: 'Bank Job', reward: 2500, par: 240,
    intro: 'LENA: Big one. Sunhaven Bank, downtown. Walk in, grab the cash, and get out. The guards will not just watch — shoot if you have to.',
    steps: [
      { text: 'Reach Sunhaven Bank', type: 'goto', place: 'bank', radius: 10 },
      { text: 'Hold E at the vault to grab the cash', type: 'hold', place: 'bank', radius: 8, holdTime: 4 },
      { text: 'Escape to the Marina Club — the crew is waiting', type: 'goto', place: 'marina', radius: 10 },
    ],
    outro: 'LENA: Two and a half grand, and the whole city is talking. One more job, Marco. The big one.',
  },
  {
    id: 'm5', name: 'The Big Score', reward: 5000, par: 300,
    intro: 'LENA: The marina yacht is carrying the Harbor Crew\'s future. Fight through the guards, grab the strongbox, and bring it home to the garage.',
    steps: [
      { text: 'Reach the Marina Club', type: 'goto', place: 'marina', radius: 10 },
      { text: 'Take down 3 guards', type: 'kill', count: 3 },
      { text: 'Grab the strongbox (press E at the marker)', type: 'interact', place: 'marina', radius: 8 },
      { text: 'Bring the strongbox home to Lena\'s Garage', type: 'goto', place: 'garage', radius: 10 },
    ],
    outro: 'LENA: That\'s the whole bay, Marco. You\'re not a wheelman anymore — you\'re family. Sunhaven Bay is yours.',
  },
];

export class MissionRunner {
  constructor(landmarks, callbacks) {
    this.landmarks = landmarks;
    this.cb = callbacks;   // {say, toast, passed, failed, spawnGuards, setWanted}
    this.index = 0;        // which mission
    this.step = 0;
    this.active = false;
    this.holdProgress = 0;
    this.killCount = 0;
    this.escapeArmed = false;
    this.startedAt = 0;    // performance.now() when the mission started
    this.escapeToastAt = 0;
  }
  current() { return MISSIONS[this.index] || null; }
  currentStep() {
    const m = this.current();
    return m ? m.steps[this.step] : null;
  }
  get done() { return this.index >= MISSIONS.length; }
  start() {
    if (this.done) return false;
    this.active = true;
    this.step = 0;
    this.holdProgress = 0;
    this.killCount = 0;
    this.startedAt = performance.now();
    const m = this.current();
    this.cb.say('LENA', m.intro);
    this.cb.toast('MISSION: ' + m.name + ' — beat ' + fmtTime(m.par) + ' for a speed bonus');
    if (m.id === 'm3') this.cb.setWanted(2);
    if (m.id === 'm5') this.cb.spawnGuards('marina', 3);
    if (m.id === 'm4') this.cb.spawnGuards('bank', 2);
    return true;
  }
  markerPos() {
    const s = this.currentStep();
    if (!s || !s.place) return null;
    const lm = this.landmarks[s.place];
    return lm ? { x: lm.x, z: lm.z } : null;
  }
  // Called every frame with the player's position and state; returns nothing,
  // but advances steps and fires callbacks when objectives complete.
  update(dt, player, game) {
    if (!this.active) return;
    const m = this.current();
    const s = this.currentStep();
    if (!s) return;
    if (s.type === 'goto' || s.type === 'escape') {
      const lm = this.landmarks[s.place];
      if (!lm) return;
      const d = dist2d(player.x, player.z, lm.x, lm.z);
      if (d < s.radius) {
        if (s.type === 'escape') {
          if (game.wanted.stars === 0) this.completeStep();
          // The "lose the cops" nag used to fire every frame while the player
          // sat at the hideout wanted; throttle it to once every 3 seconds.
          else if (performance.now() - this.escapeToastAt > 3000) {
            this.escapeToastAt = performance.now();
            this.cb.toast('Lose the cops first! Wanted: ' + game.wanted.stars + '★');
          }
        } else this.completeStep();
      }
    } else if (s.type === 'hold') {
      const lm = this.landmarks[s.place];
      const d = dist2d(player.x, player.z, lm.x, lm.z);
      if (d < s.radius && player.interactHeld) {
        this.holdProgress += dt;
        if (this.holdProgress >= s.holdTime) this.completeStep();
      } else {
        this.holdProgress = Math.max(0, this.holdProgress - dt * 2);
      }
    }
  }
  onStealCar() {
    const s = this.currentStep();
    if (this.active && s && s.type === 'stealCar') this.completeStep();
  }
  onInteract() {
    const s = this.currentStep();
    if (!this.active || !s || s.type !== 'interact') return;
    const lm = this.landmarks[s.place];
    if (!lm) return;
    // The caller already checked the player is near the marker.
    this.completeStep();
  }
  onKill() {
    const s = this.currentStep();
    if (!this.active || !s || s.type !== 'kill') return;
    this.killCount++;
    this.cb.toast('Guards down: ' + this.killCount + ' / ' + s.count);
    if (this.killCount >= s.count) this.completeStep();
  }
  completeStep() {
    this.step++;
    this.holdProgress = 0;
    this.cb.toast('✓ Objective complete');
    this.cb.soundPickup();
    if (this.step >= this.current().steps.length) this.completeMission();
  }
  completeMission() {
    const m = this.current();
    this.active = false;
    // Speed bonus: finish inside the par time and the crew pays 25% extra.
    const elapsed = (performance.now() - this.startedAt) / 1000;
    const bonus = elapsed <= (m.par || 1e9) ? Math.floor(m.reward * 0.25) : 0;
    if (bonus > 0) this.cb.toast('⚡ Speed bonus! Finished in ' + fmtTime(elapsed));
    this.cb.passed(m, bonus);
  }
  fail(reason) {
    this.active = false;
    this.cb.failed(reason);
  }
}
