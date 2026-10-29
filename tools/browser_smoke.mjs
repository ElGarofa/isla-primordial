import { writeFile } from 'node:fs/promises';

const address = process.argv[2] ?? 'http://127.0.0.1:8765/';
const output = process.argv[3] ?? '/tmp/isla-browser-smoke';
const targets = await fetch('http://127.0.0.1:9222/json').then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No se encontró la pestaña de Chromium.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.addEventListener('open', resolve, { once: true });
	socket.addEventListener('error', reject, { once: true });
});
let requestId = 0;
const pending = new Map();
const consoleLines = [];
socket.addEventListener('message', (event) => {
	const data = JSON.parse(event.data);
	if (data.id && pending.has(data.id)) {
		const callbacks = pending.get(data.id);
		pending.delete(data.id);
		if (data.error) callbacks.reject(new Error(data.error.message));
		else callbacks.resolve(data.result);
	} else if (data.method === 'Runtime.consoleAPICalled') {
		const message = data.params.args.map((argument) => argument.value ?? argument.description ?? '').join(' ');
		consoleLines.push(`console.${data.params.type}: ${message}`);
	} else if (data.method === 'Runtime.exceptionThrown') {
		consoleLines.push(`exception: ${data.params.exceptionDetails.text}`);
	}
});
function send(method, params = {}) {
	const id = ++requestId;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: address });
await sleep(15000);
await capture('menu');
const viewport = await send('Runtime.evaluate', { expression: '({w: innerWidth, h: innerHeight})', returnByValue: true });
const width = viewport.result.value.w;
const height = viewport.result.value.h;
const clickX = width * 0.5;
const clickY = height * 0.35;
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clickX, y: clickY });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickX, y: clickY, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickX, y: clickY, button: 'left', clickCount: 1 });
await sleep(10000);
await capture('partida');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
await sleep(1000);
await capture('mochila');
const failures = consoleLines.filter((line) => /SCRIPT ERROR|Parse Error|Failed loading|Invalid access|ERROR:/.test(line));
console.log(`BROWSER_SMOKE: ${failures.length ? 'FAIL' : 'PASS'} (HTML5/WebGL 2, menú, partida, Tab)`);
console.log(`Capturas: ${output}.{menu,partida,mochila}.png`);
for (const line of consoleLines) console.log(line);
socket.close();
if (failures.length) process.exitCode = 1;

async function capture(suffix) {
	const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
	await writeFile(`${output}.${suffix}.png`, Buffer.from(shot.data, 'base64'));
}
