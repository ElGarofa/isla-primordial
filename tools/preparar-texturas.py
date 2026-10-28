#!/usr/bin/env python3
"""Prepara las texturas del suelo para el juego (capas del terreno).

Entrada: una carpeta con <capa>.png (fotos generadas, p. ej. con Higgsfield, 1024×1024, tileables).
Salida (public/textures/suelo/):
  <capa>_a.jpg  albedo sRGB sin luz horneada (se aplana la iluminación de baja frecuencia respetando el mosaico)
  <capa>_n.jpg  R,G = normal XY (0..1), B = altura (0..1) para la mezcla por altura entre capas
  capas.json    tamaño, color medio lineal y métrica de costura de cada capa (para el informe y las pruebas)

Uso: python3 tools/preparar-texturas.py <carpeta_entrada> [carpeta_salida] [lado]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, sobel

CAPAS = ['hierba', 'hojarasca', 'arena', 'roca', 'nieve', 'barro', 'ceniza', 'desierto']
# inclinación típica del relieve de cada material (tangente del percentil 90 de la pendiente del mapa de normales)
RELIEVE = {'hierba': 0.55, 'hojarasca': 0.6, 'arena': 0.28, 'roca': 0.7, 'nieve': 0.22, 'barro': 0.4, 'ceniza': 0.6, 'desierto': 0.5}
APLANAR = 0.85  # cuánto se corrige la luz de baja frecuencia (1 = toda)


def srgb_a_lineal(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lineal_a_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def costura(img):
    """Salto en los bordes (izq.↔der. y arriba↔abajo) dividido por el salto medio entre píxeles vecinos. ≈1 = sin costura visible."""
    dx = np.abs(np.diff(img, axis=1)).mean()
    dy = np.abs(np.diff(img, axis=0)).mean()
    bx = np.abs(img[:, 0] - img[:, -1]).mean()
    by = np.abs(img[0, :] - img[-1, :]).mean()
    return float(max(bx / (dx + 1e-9), by / (dy + 1e-9)))


def quitar_costura(lin, ancho=0.12):
    """Mezcla la imagen con su copia desplazada media vuelta usando una máscara en cruz: la costura queda en el centro, difuminada."""
    n = lin.shape[0]
    des = np.roll(np.roll(lin, n // 2, axis=0), n // 2, axis=1)
    t = np.abs(np.arange(n) / (n - 1) * 2 - 1)  # 1 en los bordes, 0 en el centro
    w1 = np.clip((t - (1 - ancho * 2)) / (ancho * 2), 0, 1)
    m = np.maximum(w1[None, :], w1[:, None])[..., None]
    return lin * (1 - m) + des * m


def procesar(origen: Path, destino: Path, lado: int):
    destino.mkdir(parents=True, exist_ok=True)
    meta = {}
    for capa in CAPAS:
        f = origen / f'{capa}.png'
        if not f.exists():
            print(f'  falta {f}; se omite')
            continue
        im = Image.open(f).convert('RGB')
        if im.size != (lado, lado):
            im = im.resize((lado, lado), Image.LANCZOS)
        lin = srgb_a_lineal(np.asarray(im).astype(np.float32) / 255)
        c0 = costura(lin)
        if c0 > 1.6:  # costura evidente: se arregla
            lin = quitar_costura(lin)
        # luz horneada: la luminancia de baja frecuencia (con envoltura, para no romper el mosaico) se lleva hacia la media
        L = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        baja = gaussian_filter(L, sigma=lado / 20, mode='wrap')
        k = (L.mean() / np.maximum(baja, 1e-4)) ** APLANAR
        lin = np.clip(lin * k[..., None], 0, 1)
        c1 = costura(lin)
        Image.fromarray((lineal_a_srgb(lin) * 255 + 0.5).astype(np.uint8)).save(destino / f'{capa}_a.jpg', quality=90, optimize=True)
        # altura: luminancia de alta frecuencia (oscuro = hueco), normalizada por percentiles
        L2 = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        h = L2 - gaussian_filter(L2, sigma=lado / 40, mode='wrap')
        h = gaussian_filter(h, sigma=0.7, mode='wrap')
        lo, hi = np.percentile(h, 1), np.percentile(h, 99)
        h = np.clip((h - lo) / (hi - lo + 1e-9), 0, 1)
        gx = sobel(h, axis=1, mode='wrap')
        gy = sobel(h, axis=0, mode='wrap')
        g90 = np.percentile(np.hypot(gx, gy), 90) + 1e-9
        s = RELIEVE[capa] / g90
        nx, ny, nz = -gx * s, -gy * s, np.ones_like(h)
        ln = np.sqrt(nx * nx + ny * ny + nz * nz)
        nx, ny = nx / ln, ny / ln
        rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, h], axis=-1)
        Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(destino / f'{capa}_n.jpg', quality=92, optimize=True)
        meta[capa] = {'lado': lado, 'medio_lineal': [round(float(v), 4) for v in lin.reshape(-1, 3).mean(0)], 'costura_antes': round(c0, 2), 'costura_despues': round(c1, 2)}
        print(f'  {capa}: medio {meta[capa]["medio_lineal"]} costura {c0:.2f} → {c1:.2f}')
    (destino / 'capas.json').write_text(json.dumps({'capas': CAPAS, 'meta': meta}, indent=1, ensure_ascii=False))
    # manifiesto para el juego: solo se piden los archivos que existen (sin 404 en la consola)
    disp = [c for c in CAPAS if (destino / f'{c}_a.jpg').exists() and (destino / f'{c}_n.jpg').exists()]
    js = Path(__file__).resolve().parent.parent / 'src/world/suelos-disponibles.js'
    js.write_text('// Capas del suelo con archivo en public/textures/suelo/ (<capa>_a.jpg y <capa>_n.jpg). Lo reescribe tools/preparar-texturas.py al procesar las fotos.\n'
                  '// Las que no figuran aquí se generan por código sin intentar descargarlas (así no hay errores 404 en la consola).\n'
                  f'export const DISPONIBLES = {json.dumps(disp)};\n')
    print(f'  manifiesto: {disp}')
    return meta


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    o = Path(sys.argv[1])
    d = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / 'public/textures/suelo'
    lado = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    procesar(o, d, lado)
