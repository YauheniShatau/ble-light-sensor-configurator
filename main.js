/* Wiring: settings, the saved-value history, and the save sequence. */

import * as store from "./storage.js";
import * as ble from "./ble.js";
import * as ui from "./ui.js";

const EOL = { lf: "\n", crlf: "\r\n", cr: "\r", none: "" };
const { KEYS, CFG_IDS, el } = ui;

let boardId = null;

const lineEnding = () => EOL[el("eol").value] || "";

/* ---- settings ---------------------------------------------------------- */
function loadCfg() {
  const saved = store.get(store.CFG_KEY, {});
  for (const id of CFG_IDS) {
    if (typeof saved[id] === "string") el(id).value = saved[id];
  }
  const v = store.get(store.VALS_KEY, {});
  for (const k of KEYS) if (Number.isFinite(v[k])) el(k).value = v[k];
}

function saveCfg() {
  const out = {};
  for (const id of CFG_IDS) out[id] = el(id).value;
  store.set(store.CFG_KEY, out);
  ui.applyMax();
  ui.refresh();
}

function saveVals() {
  store.set(store.VALS_KEY, { level: ui.field("level"), time: ui.field("time") });
}

/* ---- saved-value history ------------------------------------------------- */
function loadHistory(id) {
  boardId = id || null;
  const rec = id ? store.get(store.historyKey(id), null) : null;
  ui.setPrev(rec && Number.isFinite(rec.level) && Number.isFinite(rec.time)
    ? rec
    : { level: null, time: null, at: null });
}

function recordSave() {
  const prev = { level: ui.field("level"), time: ui.field("time"), at: Date.now() };
  if (boardId) {
    store.set(store.historyKey(boardId), prev);
    store.set(store.LAST_BOARD_KEY, boardId);
  }
  ui.setPrev(prev);
}

/* ---- the save sequence ----------------------------------------------------- */
async function run(commands, doneMsg, onOk) {
  ui.setBusy(true);
  ui.clearVerdict();
  try {
    for (const cmd of commands) {
      const reply = await ble.command(cmd, lineEnding());
      if (reply !== "ok") {
        ui.say("wrong", `The board rejected “${cmd}”. Check the value is in range.`);
        return;
      }
    }
    if (onOk) onOk();
    ui.say("ok", doneMsg);
  } catch (err) {
    if (err && err.message === "timeout") {
      ui.say("wrong", `No reply within ${ble.VERDICT_TIMEOUT_MS} ms. ` +
        "Check the notify characteristic and the board's UART baud rate.");
    } else {
      ui.say("wrong", `Send failed: ${(err && err.message) || err}`);
    }
  } finally {
    ui.setBusy(false);
    ui.setState(ble.isConnected() ? "live" : "down");
  }
}

el("save").addEventListener("click", () => {
  saveVals();
  run([
    el("cmdLevel").value.replace("{v}", ui.field("level")),
    el("cmdTime").value.replace("{v}", ui.field("time")),
    el("cmdWrite").value
  ], "Saved to the board.", recordSave);
});

/* ---- field interaction --------------------------------------------------------- */
for (const b of document.querySelectorAll("[data-step]")) {
  b.addEventListener("click", () => {
    const input = el(b.dataset.target);
    input.value = Math.max(0, Math.min(ui.vmax(),
      ui.field(b.dataset.target) + parseInt(b.dataset.step, 10)));
    saveVals();
    ui.refresh();
  });
}

for (const k of KEYS) {
  el(k).addEventListener("input", () => { saveVals(); ui.refresh(); });
}

for (const b of document.querySelectorAll(".prev")) {
  b.addEventListener("click", () => {
    const v = ui.getPrev()[b.dataset.target];
    if (v === null) return;
    el(b.dataset.target).value = v;
    saveVals();
    ui.refresh();
  });
}

el("forget").addEventListener("click", () => {
  if (boardId) store.drop(store.historyKey(boardId));
  ui.setPrev({ level: null, time: null, at: null });
});

for (const id of CFG_IDS) el(id).addEventListener("change", saveCfg);

/* ---- link / drop ----------------------------------------------------------------- */
ble.setHooks({
  onTx: (text) => ui.log("tx", text),
  onRx: (line, kind) => ui.log("rx", line, kind),
  onNote: (text) => ui.log("note", text),
  onDrop: teardown
});

function teardown() {
  ble.disconnect();
  ui.setBusy(false);
  ui.setLive(false);
  ui.showUnlinked();
  ui.setState("down");
}

async function link() {
  const svc = ble.uuid(el("svc").value);
  const wUuid = ble.uuid(el("chrW").value);
  const nUuid = ble.uuid(el("chrN").value) || wUuid;

  if (!svc || !wUuid) {
    ui.say("wrong", "Fill in the service and write characteristic UUIDs under Device settings.");
    return;
  }

  try {
    ui.setBusy(true);
    ui.setState("busy");
    await ble.connect(svc, wUuid, nUuid);

    ui.showLinked(ble.deviceName(), `service ${el("svc").value} · char ${el("chrW").value}`);
    ui.clearVerdict();
    ui.log("note", "Linked");

    loadHistory(ble.deviceId());
    ui.setBusy(false);
    ui.setLive(true);
    ui.setState("live");
  } catch (err) {
    const name = err && err.name;
    if (name === "NotFoundError") {
      ui.say("info", "No board picked.");
    } else if (name === "SecurityError") {
      ui.say("wrong", "Bluetooth is blocked inside an embedded frame. Open this page in its own Chrome tab.");
    } else {
      ui.say("wrong", `Link failed: ${(err && err.message) || err}`);
    }
    teardown();
  }
}

el("link").addEventListener("click", () => {
  if (ble.isConnected()) teardown(); else link();
});

/* ---- boot ------------------------------------------------------------------------- */
loadCfg();
ui.applyMax();

// Show the last board's history straight away, before anything is linked.
const last = store.get(store.LAST_BOARD_KEY, null);
if (last) {
  loadHistory(last);
  if (ui.getPrev().level !== null) ui.setScope("last board, not linked");
} else {
  ui.renderPrev();
}

if (!navigator.bluetooth) {
  ui.disableLink();
  ui.say("wrong", "This browser has no Web Bluetooth. Use Chrome or Edge on Android.");
}
ui.setState("down");
