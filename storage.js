/* localStorage, wrapped so a private window or blocked site data cannot throw. */

const NS = "ble-light-sensor-configurator";

export const CFG_KEY = `${NS}.cfg`;
export const VALS_KEY = `${NS}.vals`;
export const LAST_BOARD_KEY = `${NS}.lastBoard`;

export const historyKey = (id) => `${NS}.saved.${id}`;

export function get(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

export function set(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

export function drop(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}
