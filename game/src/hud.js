// HUD: health bar, wanted stars, cash, clock, mission banner, speedometer and
// the round minimap drawn on a 2D canvas — roads, the player arrow, police
// blips and the yellow mission marker.
import { fmtMoney } from './util.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      stars: document.getElementById('stars'),
      money: document.getElementById('money'),
      clock: document.getElementById('clock'),
      health: document.getElementById('healthfill'),
      armor: document.getElementById('armorfill'),
      ammo: document.getElementById('ammocount'),
      carname: document.getElementById('carname'),
      mname: document.getElementById('mname'),
      mtext: document.getElementById('mtext'),
      speedo: document.getElementById('speedo'),
      speed: document.getElementById('speed'),
      toast: document.getElementById('toast'),
      hint: document.getElementById('hint'),
      wasted: document.getElementById('wasted'),
      crosshair: document.getElementById('crosshair'),
      dialog: document.getElementById('dialog'),
      dlgwho: document.getElementById('dlgwho'),
      dlgline: document.getElementById('dlgline'),
      card: document.getElementById('missioncard'),
      mcTitle: document.getElementById('mc-title'),
      mcSub: document.getElementById('mc-sub'),
      mcReward: document.getElementById('mc-reward'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = null;
    this.dialogTimer = null;
    this.day = 1;
    this.minutes = 8 * 60;
  }
  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  update(state) {
    // state: {health, armor, ammo, money, wanted, inCar, carName, speed,
    //         missionName, missionText, day, minutes, missionIndex, missionTotal}
    this.el.health.style.width = Math.max(0, state.health) + '%';
    this.el.health.classList.toggle('low', state.health < 30);
    this.el.armor.style.width = Math.max(0, state.armor) + '%';
    this.el.ammo.textContent = state.ammo;
    this.el.money.textContent = fmtMoney(state.money);
    this.el.carname.textContent = state.inCar ? state.carName : 'On foot';
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '<span class="off">★</span>';
    this.el.stars.innerHTML = stars;
    this.el.stars.classList.toggle('hot', state.wanted >= 3);
    const hh = Math.floor(state.minutes / 60) % 24;
    const mm = Math.floor(state.minutes % 60);
    this.el.clock.textContent = 'DAY ' + state.day + ' · ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    const counter = state.missionTotal
      ? (state.missionIndex + 1) + '/' + state.missionTotal + ' — ' : '';
    this.el.mname.textContent = counter + (state.missionName || 'FREE ROAM');
    this.el.mtext.textContent = state.missionText || 'Explore Sunhaven Bay. Find Lena at the garage.';
    if (state.inCar) {
      this.el.speedo.classList.remove('hidden');
      this.el.speed.textContent = Math.round(Math.abs(state.speed) * 2.2);
      this.el.crosshair.classList.add('hidden');
    } else {
      this.el.speedo.classList.add('hidden');
      this.el.crosshair.classList.remove('hidden');
    }
  }
  toast(text, ms) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms || 2600);
  }
  say(who, line, ms) {
    this.el.dlgwho.textContent = who;
    this.el.dlgline.textContent = line;
    this.el.dialog.classList.remove('hidden');
    clearTimeout(this.dialogTimer);
    this.dialogTimer = setTimeout(() => this.el.dialog.classList.add('hidden'), ms || 7000);
  }
  showWasted(show) { this.el.wasted.classList.toggle('hidden', !show); }
  // Flash the red damage vignette at the screen edges, then fade it out.
  flashDamage() {
    const dmg = document.getElementById('dmg');
    if (!dmg) return;
    dmg.style.opacity = '1';
    clearTimeout(this.dmgTimer);
    this.dmgTimer = setTimeout(() => { dmg.style.opacity = '0'; }, 260);
  }
  showMissionCard(title, sub, reward) {
    this.el.mcTitle.textContent = title;
    this.el.mcSub.textContent = sub || '';
    this.el.mcReward.textContent = reward ? '+ ' + fmtMoney(reward) : '';
    this.el.card.classList.remove('hidden');
    setTimeout(() => this.el.card.classList.add('hidden'), 3200);
  }
  // Minimap: world coords (-160..160) map into the 210px circle.
  drawMinimap(player, marker, police, traffic, pedestrians) {
    const ctx = this.mapCtx;
    const S = 210, C = S / 2;
    const toMap = (x, z) => [C + (x / 165) * C, C + (z / 165) * C];
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#12303f'; ctx.fillRect(0, 0, S, S);
    // Beach + sea on the south edge.
    ctx.fillStyle = '#c9b078'; ctx.fillRect(0, S - 16, S, 16);
    ctx.fillStyle = '#2a7fa8'; ctx.fillRect(0, S - 6, S, 6);
    // Roads.
    ctx.strokeStyle = '#3a3f47'; ctx.lineWidth = 7;
    for (const v of [-120, -60, 0, 60, 120]) {
      const [px] = toMap(v, 0); const [, pz] = toMap(0, v);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pz); ctx.lineTo(S, pz); ctx.stroke();
    }
    // Buildings as pale blocks.
    ctx.fillStyle = '#5a6a7a';
    for (let bx = -90; bx <= 90; bx += 60) for (let bz = -90; bz <= 90; bz += 60) {
      const [x, y] = toMap(bx, bz);
      ctx.fillRect(x - 13, y - 13, 26, 26);
    }
    // Traffic dots, pedestrians as faint dots.
    ctx.fillStyle = '#c8c8d8';
    for (const c of traffic) { const [x, y] = toMap(c.x, c.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    ctx.fillStyle = '#e8a0a0';
    for (const p of pedestrians) { const [x, y] = toMap(p.x, p.z); ctx.fillRect(x - 1, y - 1, 2, 2); }
    // Police: flashing blue/red blips.
    const flash = (Date.now() / 300) % 2 < 1;
    ctx.fillStyle = flash ? '#3a7bff' : '#ff3a3a';
    for (const p of police) {
      const [x, y] = toMap(p.x, p.z);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Mission marker: pulsing yellow diamond.
    if (marker) {
      const [x, y] = toMap(marker.x, marker.z);
      const r = 7 + Math.sin(Date.now() / 200) * 2;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath(); ctx.fill();
    }
    // Player arrow, rotated by heading.
    const [px, py] = toMap(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.restore();
    // North tick.
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('N', C - 4, 14);
  }
}
