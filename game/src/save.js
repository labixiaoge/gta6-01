// Save / load: money, missions finished, kills, cars stolen and best wanted
// level live in localStorage under one key. Loading a save restores the
// campaign state; the world itself is rebuilt fresh each session.
const KEY = 'sunhaven-bay-save-v1';
const SETTINGS_KEY = 'sunhaven-bay-settings-v1';

export function defaultSave() {
  return {
    money: 250, missionIndex: 0, kills: 0, carsStolen: 0, bestWanted: 0,
    playSeconds: 0, createdAt: Date.now(),
  };
}
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number' || typeof data.missionIndex !== 'number') return null;
    const merged = { ...defaultSave(), ...data };
    // A save from an older build (or a tampered one) must never point past
    // the last mission: clamp the index into the campaign's range.
    merged.missionIndex = Math.max(0, Math.min(5, Math.floor(merged.missionIndex)));
    merged.money = Math.max(0, Math.floor(merged.money));
    return merged;
  } catch (e) {
    return null;
  }
}
export function writeSave(save) {
  try {
    save.playSeconds = Math.floor(save.playSeconds || 0);
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch (e) {
    return false;
  }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}

// Player settings (currently just mute) live under their own key so a
// campaign reset never wipes them.
export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { muted: false };
    const data = JSON.parse(raw);
    return { muted: !!data.muted };
  } catch (e) {
    return { muted: false };
  }
}
export function writeSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: !!settings.muted }));
    return true;
  } catch (e) {
    return false;
  }
}
