#!/usr/bin/env node
// Converts original GLB assets into a Godot-friendly glTF subset without touching originals.
// Requires @gltf-transform/{core,extensions,functions}, meshoptimizer, and sharp.
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputRoot = path.join(projectRoot, 'assets/models');
const outputRoot = path.join(projectRoot, 'assets/godot_models');

const io = new NodeIO()
	.registerExtensions([EXTMeshoptCompression, EXTTextureWebP, KHRMeshQuantization])
	.registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

await MeshoptDecoder.ready;
await mkdir(outputRoot, { recursive: true });
const allFiles = (await walk(inputRoot)).filter((item) => item.toLowerCase().endsWith('.glb'));
const only = process.argv[2] ?? '';
const files = allFiles.filter((item) => !only || path.relative(inputRoot, item).includes(only));
let converted = 0;
let failed = 0;
for (const file of files) {
	const relative = path.relative(inputRoot, file);
	const output = path.join(outputRoot, relative);
	await mkdir(path.dirname(output), { recursive: true });
	try {
		const document = await io.read(file);
		await document.transform(dequantize());
		for (const texture of document.getRoot().listTextures()) {
			const image = texture.getImage();
			if (!image) continue;
			const metadata = await sharp(image).metadata();
			if (metadata.format === 'webp' || texture.getMimeType() === 'image/webp') {
				const sharpImage = sharp(image);
				if (metadata.hasAlpha) {
					texture.setImage(await sharpImage.png().toBuffer()).setMimeType('image/png');
				} else {
					texture.setImage(await sharpImage.jpeg({ quality: 92, mozjpeg: true }).toBuffer()).setMimeType('image/jpeg');
				}
			}
		}
		for (const extension of document.getRoot().listExtensionsUsed()) {
			if ([
				'EXT_meshopt_compression',
				'EXT_texture_webp',
				'KHR_mesh_quantization',
			].includes(extension.extensionName)) extension.dispose();
		}
		await io.write(output, document);
		converted++;
		console.log(`OK ${relative} (${(await stat(output)).size} bytes)`);
	} catch (error) {
		failed++;
		console.error(`FAIL ${relative}: ${error?.stack ?? error}`);
	}
}
console.log(`GLTF_CONVERSION: ${converted} convertidos, ${failed} fallidos, ${files.length} seleccionados de ${allFiles.length} originales preservados.`);
process.exitCode = failed > 0 ? 1 : 0;

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map((entry) => {
		const full = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(full) : [full];
	}));
	return nested.flat();
}
