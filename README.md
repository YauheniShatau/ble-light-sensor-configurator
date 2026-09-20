# ble-light-sensor-configurator
Configurator for custom light sensor with BT

A web app that sets the sensor's `level` and `time` parameters over Bluetooth
Low Energy and commits them to the board's EEPROM. Plain ES modules and CSS —
no build step and no dependencies, so the files deploy exactly as they are.

| File | |
|---|---|
| `index.html` | markup only |
| `styles.css` | all styling, light and dark |
| `ble.js` | device selection, chunked writes, reply parsing |
| `storage.js` | `localStorage`, wrapped so blocked site data cannot throw |
| `ui.js` | every DOM read and write, and the enable/disable rules |
| `main.js` | settings, saved-value history, the save sequence, wiring |

## Requirements

Chrome or Edge on Android. The app uses [Web Bluetooth], which Firefox and iOS
do not implement. The page must be served over HTTPS (or `localhost`); Web
Bluetooth is unavailable on `file://`.

The board's Bluetooth module acts as a transparent UART bridge — bytes written
to its characteristic come out of the board's serial port unchanged.

[Web Bluetooth]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API

## Protocol

The app writes newline-terminated ASCII and expects `ok` or `wrong` back after
each command:

```
level=50    ->  ok
time=40     ->  ok
write       ->  ok
```

`write` is what commits the two values to non-volatile memory. Saving sends all
three in order and stops at the first reply that is not `ok`.

Service `0xffe0` and characteristic `0xffe1` are the defaults. Modules vary —
some split writes onto `0xffe2` — so confirm both against the board in nRF
Connect. The UUIDs, the line ending, the command strings and the value
ceiling are all editable under **Device settings** in the app and persist in
`localStorage`.

## Deploying to GitHub Pages

1. Commit and push the files to `main`.
2. In the repo on GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*,
   then pick branch `main` and folder `/ (root)`.
4. Save. The first build takes a minute or two.

The app is then at `https://yauhenishatau.github.io/ble-light-sensor-configurator/`.
Open that in Chrome on the phone — as a normal tab, not inside another page's
frame, since Web Bluetooth is blocked by permissions policy in embedded frames.

Pages on a **private** repo requires a paid GitHub plan. If this repo is private
and Pages is unavailable, make it public or host the file anywhere else that
serves HTTPS.

## Local development

Web Bluetooth treats `localhost` as a secure context, so a plain static server
is enough to work on the page from the same machine:

```
python3 -m http.server 8000
```

That only helps on the machine running it — a phone hitting the laptop's LAN
address gets a plain-HTTP origin and no Bluetooth. To test on the phone, push to
Pages, or put an HTTPS tunnel in front of the local server.

## Stored values

The board's firmware cannot currently be read back, so the app cannot show what
is actually on the device. Instead it records the values it last saved
successfully, per board, keyed by the browser's device ID, and shows them in
grey beside each field. **Save to board** stays disabled while both fields match
that record.

This record is a log of what this phone sent, not a reading of the hardware. It
will disagree with the board after a reflash, after another phone or a serial
terminal writes to it, or if the firmware clamps a value and still answers `ok`.
**Forget this board's history** under Device settings clears it. Adding a `read`
command to the firmware that prints `level=N` and `time=N` would let the app
show real values instead.
