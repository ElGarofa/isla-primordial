// Fotos de follaje y corteza (generadas con Higgsfield y preparadas con tools/preparar-follaje.py). Solo se piden las que figuran en
// fotos-disponibles.js; las que falten se siguen dibujando por código (flora/textures.js), así el juego nunca depende de ellas.
import * as THREE from 'three';
import { FOTOS } from './fotos-disponibles.js';

const base = () => (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';

function preparar(t, { srgb = true, repetir = false } = {}) {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  return t;
}

/** Devuelve { [nombre]: Texture } para el follaje y { corteza_x: { albedo, normal } } para las cortezas. Nunca falla: lo que no carga no aparece. */
export async function cargarFotos() {
  const loader = new THREE.TextureLoader(), out = {}, errores = {};
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('fotos') === '0') return { fotos: out, errores }; // ?fotos=0: solo texturas por código (comparar)
  const cargar = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  await Promise.all(FOTOS.map(async (n) => {
    try {
      if (n.startsWith('corteza_')) {
        const [a, nm] = await Promise.all([cargar(`${base()}textures/flora/${n}_a.jpg`), cargar(`${base()}textures/flora/${n}_n.jpg`)]);
        out[n] = { albedo: preparar(a, { repetir: true }), normal: preparar(nm, { srgb: false, repetir: true }) };
      } else out[n] = preparar(await cargar(`${base()}textures/flora/${n}.webp`));
    } catch (e) { errores[n] = String(e?.message ?? e); }
  }));
  return { fotos: out, errores };
}
