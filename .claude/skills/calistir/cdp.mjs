// N-Terminal (WebView2) uzaktan surucu - Chrome DevTools Protocol.
// Kullanim: node cdp.mjs <komut> [arg]
//   type <metin>        kutuya odaklan ve metni gir (gercek input olayi)
//   selectall           kutudaki metnin tumunu sec
//   key <key> <mods>    keydown+keyup gonder (mods: Alt=1 Ctrl=2 Meta=4 Shift=8)
//   value               kutunun degeri ve secim araligi
//   shot <ad>           ekran goruntusu -> %TEMP%\nt-cdp\<ad>.png
//   newgroup            Ctrl+Shift+N (yeni grup)
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [cmd, ...args] = process.argv.slice(2);
const targets = await (await fetch("http://localhost:9222/json")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("sayfa hedefi yok");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + JSON.stringify(r.exceptionDetails.exception?.description));
  return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Runtime.enable");
await send("Page.enable");
await send("Page.bringToFront").catch(() => {});
await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});

const BOX = `document.querySelector(".command-input-field")`;
const readBox = () => evaluate(`(() => { const el = ${BOX}; return el ? { value: el.value, selStart: el.selectionStart, selEnd: el.selectionEnd, focused: document.activeElement === el } : null; })()`);

const key = async (k, mods, code) => {
  const vk = k.length === 1 ? k.toUpperCase().charCodeAt(0) : undefined;
  const base = { key: k, code: code ?? (k.length === 1 ? "Key" + k.toUpperCase() : k), modifiers: mods, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
};

const shot = async (name) => {
  const dir = join(process.env.TEMP, "nt-cdp");
  mkdirSync(dir, { recursive: true });
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(dir, name + ".png"), Buffer.from(r.data, "base64"));
  return join(dir, name + ".png");
};

switch (cmd) {
  case "type": {
    // Kutu acilana kadar bekle (kabuk istemi gelmis olmali)
    for (let i = 0; i < 40 && !(await readBox()); i++) await sleep(250);
    await evaluate(`${BOX}.focus()`);
    await send("Input.insertText", { text: args.join(" ") });
    await sleep(300);
    console.log(JSON.stringify(await readBox()));
    break;
  }
  case "selectall":
    await evaluate(`${BOX}.focus(); ${BOX}.select(); true`);
    console.log(JSON.stringify(await readBox()));
    break;
  case "key":
    await key(args[0], Number(args[1] ?? 0), args[2]);
    await sleep(600);
    console.log(JSON.stringify(await readBox()));
    break;
  case "value":
    console.log(JSON.stringify(await readBox()));
    break;
  case "shot":
    console.log(await shot(args[0] ?? "shot"));
    break;
  case "newgroup":
    await key("N", 2 | 8, "KeyN");
    await sleep(3500);
    console.log(JSON.stringify(await readBox()));
    break;
  default:
    throw new Error("bilinmeyen komut: " + cmd);
}
ws.close();
