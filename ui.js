/* Every DOM read and write lives here. The module holds the state the
   enable/disable rules depend on: the link, the in-flight flag, and the
   last values saved to this board. */

export const KEYS = ["level", "time"];
export const CFG_IDS = ["svc", "chrW", "chrN", "eol", "cmdLevel", "cmdTime", "cmdWrite", "vmax"];

export const el = (id) => document.getElementById(id);
export const cap = (s) => s[0].toUpperCase() + s.slice(1);

const linkbar = el("linkbar"), who = el("who"), addr = el("addr"), prevScope = el("prevScope");
const linkBtn = el("link"), saveBtn = el("save"), hint = el("hint");
const tape = el("tape"), verdict = el("verdict");

let live = false;
let busy = false;
let prev = { level: null, time: null, at: null };

export const getPrev = () => prev;
export function setPrev(next) { prev = next; renderPrev(); }
export function setBusy(b) { busy = b; refresh(); }
export function setLive(l) { live = l; refresh(); }

/* ---- value helpers ----------------------------------------------------- */
export function vmax() {
  const n = parseInt(el("vmax").value, 10);
  return Number.isFinite(n) && n > 0 ? n : 255;
}

export function applyMax() {
  for (const k of KEYS) {
    el(k).max = vmax();
    el(`range${cap(k)}`).textContent = `0 – ${vmax()}`;
  }
}

export function field(id) {
  const n = parseInt(el(id).value, 10);
  return Number.isFinite(n) ? n : 0;
}

function ago(ts) {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
}

/* ---- rendering ---------------------------------------------------------- */
export function renderPrev() {
  for (const k of KEYS) {
    const box = el(`prev${cap(k)}`);
    const known = prev[k] !== null;
    box.querySelector(".val").textContent = known ? prev[k] : "—";
    box.querySelector(".when").textContent = known ? ago(prev.at) : "never saved";
    box.title = known ? `Put ${prev[k]} back in the field` : "";
  }
  refresh();
}

function dirty() {
  if (prev.level === null) return true;          // nothing saved yet — always offer the save
  return KEYS.some((k) => field(k) !== prev[k]);
}

/* One place decides what is enabled and what the hint says. */
export function refresh() {
  for (const k of KEYS) {
    el(`field${cap(k)}`).dataset.dirty =
      prev[k] !== null && field(k) !== prev[k] ? "yes" : "no";
  }

  const ready = live && !busy;
  const changed = dirty();

  // Nothing is editable until a board is linked.
  for (const k of KEYS) el(k).disabled = !ready;
  for (const b of document.querySelectorAll("[data-step]")) b.disabled = !ready;
  for (const b of document.querySelectorAll(".prev")) {
    b.disabled = !ready || prev[b.dataset.target] === null;
  }

  saveBtn.disabled = !ready || !changed;

  if (!live) hint.textContent = "Link the board to edit the values.";
  else if (busy) hint.textContent = "Talking to the board…";
  else if (!changed) hint.textContent = "Both values match the last save — nothing to write.";
  else if (prev.level === null) hint.textContent = "Nothing saved to this board from this phone yet.";
  else hint.textContent = "Saving writes both values, then commits them to EEPROM.";
}

/* ---- transcript ---------------------------------------------------------- */
export function log(dir, text, kind) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.dir = dir;
  if (kind) row.dataset.kind = kind;

  const d = document.createElement("span");
  d.className = "dir";
  d.textContent = dir === "note" ? "" : dir.toUpperCase();

  const b = document.createElement("span");
  b.className = "body";
  b.textContent = text;

  row.append(d, b);
  tape.appendChild(row);
  tape.scrollTop = tape.scrollHeight;
}

export function say(kind, text) {
  verdict.dataset.kind = kind;
  verdict.textContent = text;
  verdict.hidden = false;
}

export const clearVerdict = () => { verdict.hidden = true; };

/* ---- link bar ------------------------------------------------------------ */
export function setState(s) {
  linkbar.dataset.state = s;
  linkBtn.textContent = s === "down" ? "Link" : "Drop";
  linkBtn.dataset.role = s === "down" ? "" : "drop";
  refresh();
}

export function showLinked(name, where) {
  who.textContent = name;
  addr.textContent = where;
  prevScope.textContent = "history for this board";
}

export function showUnlinked() {
  who.textContent = "No board linked";
  addr.textContent = "BLE";
}

export const setScope = (text) => { prevScope.textContent = text; };
export const disableLink = () => { linkBtn.disabled = true; };
