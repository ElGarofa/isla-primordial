import { mkdir, writeFile } from 'node:fs/promises';

const pageUrl = process.argv[2] ?? 'http://127.0.0.1:5179/tools/export-viewmodel-hands.html';
const outputPath = process.argv[3] ?? 'assets/godot_models/player/original_hands.glb';
const targets = await fetch('http://127.0.0.1:9222/json').then((response) => response.json());
let target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No se encontró una pestaña Chromium de depuración.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.addEventListener('open', resolve, { once: true });
	socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
	const data = JSON.parse(event.data);
	if (!data.id || !pending.has(data.id)) return;
	const callbacks = pending.get(data.id);
	pending.delete(data.id);
	if (data.error) callbacks.reject(new Error(data.error.message));
	else callbacks.resolve(data.result);
});
function send(method, params = {}) {
	const id = ++nextId;
	socket.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: pageUrl });
let result;
for (let attempt = 0; attempt < 180; attempt++) {
	await new Promise((resolve) => setTimeout(resolve, 500));
	result = await send('Runtime.evaluate', { expression: 'window.__exportStatus ?? null', returnByValue: true });
	const status = result.result.value;
	if (status?.state === 'done') {
		await mkdir(outputPath.slice(0, outputPath.lastIndexOf('/')), { recursive: true });
		await writeFile(outputPath, Buffer.from(status.glb, 'base64'));
		console.log(`ORIGINAL_HANDS_EXPORTED: ${status.byteLength} bytes, ${status.nodes.join(', ')}`);
		socket.close();
		process.exit(0);
	}
	if (status?.state === 'error') throw new Error(status.message);
}
throw new Error('Timeout al exportar las mallas del original.');
