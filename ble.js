/* The Bluetooth link: device selection, chunked writes, and reply parsing.
   Nothing here touches the DOM — callers receive traffic through setHooks. */

export const VERDICT_TIMEOUT_MS = 3000;
const CHUNK = 20;                   // default ATT MTU of 23, less 3 bytes of header

let dev = null, writeChr = null, notifyChr = null;
let rxBuf = "";
let pendingVerdict = null;

const hooks = {
  onTx: () => {},                   // a line was written
  onRx: () => {},                   // a line came back, with "ok"/"wrong"/null
  onNote: () => {},                 // a status message worth showing
  onDrop: () => {}                  // the module went away on its own
};

export function setHooks(h) { Object.assign(hooks, h); }

export const isConnected = () => !!(dev && dev.gatt.connected);
export const deviceId = () => (dev ? dev.id || dev.name || "unknown" : null);
export const deviceName = () => (dev ? dev.name || "Unnamed device" : null);

export function uuid(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  if (/^(0x)?[0-9a-f]{1,4}$/.test(s)) return parseInt(s, 16);   // 16-bit short form
  return s;
}

/* ---- receive --------------------------------------------------------------- */
function onNotify(ev) {
  rxBuf += new TextDecoder().decode(ev.target.value);
  const parts = rxBuf.split(/[\r\n]+/);
  rxBuf = parts.pop();
  for (const p of parts) if (p.trim()) deliver(p.trim());

  // Firmware that answers without a terminator still gets read.
  const bare = rxBuf.trim().toLowerCase();
  if (bare === "ok" || bare === "wrong") { rxBuf = ""; deliver(bare); }
}

function deliver(line) {
  const norm = line.toLowerCase();
  const kind = norm === "ok" ? "ok" : norm === "wrong" ? "wrong" : null;
  hooks.onRx(line, kind);
  if (kind && pendingVerdict) {
    const p = pendingVerdict;
    pendingVerdict = null;
    clearTimeout(p.timer);
    p.resolve(norm);
  }
}

/* ---- send ------------------------------------------------------------------- */
async function write(text, eol) {
  const bytes = new TextEncoder().encode(text + eol);
  hooks.onTx(text);
  const canAck = writeChr.properties.write;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    if (canAck && writeChr.writeValueWithResponse) {
      await writeChr.writeValueWithResponse(slice);
    } else if (writeChr.writeValueWithoutResponse) {
      await writeChr.writeValueWithoutResponse(slice);
    } else {
      await writeChr.writeValue(slice);
    }
  }
}

/* Writes one command and settles on the board's "ok"/"wrong", or rejects on timeout. */
export async function command(text, eol) {
  await write(text, eol);
  return new Promise((resolve, reject) => {
    pendingVerdict = {
      resolve,
      timer: setTimeout(() => {
        pendingVerdict = null;
        reject(new Error("timeout"));
      }, VERDICT_TIMEOUT_MS)
    };
  });
}

/* ---- link ---------------------------------------------------------------------- */
export async function connect(svc, wUuid, nUuid) {
  dev = await navigator.bluetooth.requestDevice({
    filters: [{ services: [svc] }],
    optionalServices: [svc]
  }).catch((e) => {
    // Not every module puts the service in its advertising packet.
    if (e && e.name === "NotFoundError") {
      return navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [svc] });
    }
    throw e;
  });

  dev.addEventListener("gattserverdisconnected", () => {
    hooks.onNote("Device disconnected");
    hooks.onDrop();
  });

  const server = await dev.gatt.connect();
  const service = await server.getPrimaryService(svc);
  writeChr = await service.getCharacteristic(wUuid);
  notifyChr = nUuid === wUuid ? writeChr : await service.getCharacteristic(nUuid);

  if (notifyChr.properties.notify || notifyChr.properties.indicate) {
    await notifyChr.startNotifications();
    notifyChr.addEventListener("characteristicvaluechanged", onNotify);
  } else {
    hooks.onNote("Characteristic cannot notify — replies will not be read");
  }
}

export function disconnect() {
  if (dev && dev.gatt.connected) dev.gatt.disconnect();
  dev = writeChr = notifyChr = null;
  rxBuf = "";
}
