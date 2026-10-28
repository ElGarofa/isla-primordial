#!/usr/bin/env python3
"""Prepara las fotos de follaje y corteza para la flora del juego.

Entrada: carpeta con follaje/*.png (fondo transparente) y corteza/*.jpg (tileables).
Salida: public/textures/flora/
  <nombre>.webp      follaje con alfa: recortado a su contorno, con el color «sangrado» bajo la parte transparente (sin halos al alejarse)
  <corteza>_a.jpg    corteza sin luz horneada (tileable)   ·   <corteza>_n.jpg  normal (RGB) desde la luminancia
  aguja_conifera.webp / aguja_araucaria.webp: abanicos de varias ramitas (una ramita sola en una tarjeta cuadrada queda esquelética)
Además reescribe src/flora/fotos-disponibles.js con la lista de archivos que existen (el juego no pide lo que falta: sin errores 404).

Uso: python3 tools/preparar-follaje.py <carpeta_texturas>
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, sobel

RAIZ = Path(__file__).resolve().parent.parent
DEST = RAIZ / 'public/textures/flora'


def recortar(im, margen=0.03):
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > 24)
    if not len(xs):
        return im
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    mx, my = int((x1 - x0) * margen) + 2, int((y1 - y0) * margen) + 2
    return im.crop((max(0, x0 - mx), max(0, y0 - my), min(im.width, x1 + mx), min(im.height, y1 + my)))


def sangrar(im):
    """Rellena el RGB de los píxeles transparentes con el del píxel opaco más cercano (los mipmaps dejan de mezclar con negro/blanco)."""
    a = np.asarray(im).astype(np.float32)
    opaco = a[:, :, 3] > 127
    if opaco.all() or not opaco.any():
        return im
    _, (iy, ix) = distance_transform_edt(~opaco, return_indices=True)
    rgb = a[:, :, :3][iy, ix]
    out = np.dstack([rgb, a[:, :, 3]])
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


def encajar(im, w, h, abajo=False):
    """Escala `im` para que quepa en w×h sin deformar y la centra (o la apoya abajo)."""
    k = min(w / im.width, h / im.height)
    r = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    lienzo = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    lienzo.alpha_composite(r, ((w - r.width) // 2, h - r.height if abajo else (h - r.height) // 2))
    return lienzo


def abanico(ramita, n=7, lado=512, apertura=110, seed=1):
    """Abanico de ramitas que nacen del centro inferior: forma de rama de conífera vista de lado."""
    rng = np.random.default_rng(seed)
    r = recortar(ramita)
    lienzo = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    for i in range(n):
        t = i / (n - 1) - 0.5
        ang = t * apertura + rng.uniform(-6, 6)
        esc = 0.95 - abs(t) * 0.35 + rng.uniform(-0.05, 0.05)
        h = int(lado * 0.98 * esc)
        w = max(1, int(r.width * h / r.height))
        pieza = r.resize((w, h), Image.LANCZOS)
        # se rota alrededor de su base (abajo-centro): se pega en un lienzo doble con la base en el centro y se gira
        tmp = Image.new('RGBA', (h * 2, h * 2), (0, 0, 0, 0))
        tmp.alpha_composite(pieza, (h - w // 2, 0))
        tmp = tmp.rotate(-ang, resample=Image.BICUBIC, center=(h, h))
        lienzo.alpha_composite(tmp, (lado // 2 - h, lado - h))
    return lienzo


def guardar_webp(im, nombre):
    im.save(DEST / f'{nombre}.webp', 'WEBP', quality=88, alpha_quality=95, method=6)


def corteza(ruta, nombre, lado=512):
    im = Image.open(ruta).convert('RGB').resize((lado, lado), Image.LANCZOS)
    lin = (np.asarray(im).astype(np.float32) / 255) ** 2.2
    L = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    baja = gaussian_filter(L, sigma=lado / 16, mode='wrap')
    lin = np.clip(lin * ((L.mean() / np.maximum(baja, 1e-4)) ** 0.8)[..., None], 0, 1)
    Image.fromarray((lin ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)).save(DEST / f'{nombre}_a.jpg', quality=90)
    L2 = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    h = L2 - gaussian_filter(L2, sigma=lado / 32, mode='wrap')
    h = (h - h.min()) / (h.max() - h.min() + 1e-9)
    gx, gy = sobel(gaussian_filter(h, 0.8, mode='wrap'), axis=1, mode='wrap'), sobel(gaussian_filter(h, 0.8, mode='wrap'), axis=0, mode='wrap')
    s = 0.7 / (np.percentile(np.hypot(gx, gy), 90) + 1e-9)
    nx, ny = -gx * s, -gy * s
    ln = np.sqrt(nx * nx + ny * ny + 1)
    rgb = np.stack([nx / ln * 0.5 + 0.5, ny / ln * 0.5 + 0.5, 1 / ln * 0.5 + 0.5], -1)
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(DEST / f'{nombre}_n.jpg', quality=92)


def main(origen: Path):
    DEST.mkdir(parents=True, exist_ok=True)
    f, c = origen / 'follaje', origen / 'corteza'
    hechos = []
    # frondas: recortadas al contorno y estiradas a 512×1024 (base abajo, como las procedurales). La geometría de las frondas mide
    # ≈ 1:2 (ancho:largo) y la tarjeta usa toda la textura: si la foto no llena el lienzo, la fronda sale corta y achaparrada.
    for n in ['fronda_palmera', 'fronda_helecho', 'fronda_cicada']:
        p = f / f'{n}.png'
        if p.exists():
            guardar_webp(sangrar(recortar(Image.open(p).convert('RGBA'), margen=0.01).resize((512, 1024), Image.LANCZOS)), n); hechos.append(n)
    # racimos de hojas (tarjetas cruzadas): 512×512 centrados
    for n in ['hoja_selva', 'hoja_arbusto']:
        p = f / f'{n}.png'
        if p.exists():
            guardar_webp(sangrar(encajar(recortar(Image.open(p).convert('RGBA')), 512, 512)), n); hechos.append(n)
    # mechón de hierba: apoyado abajo, 512×512
    p = f / 'hierba_mata.png'
    if p.exists():
        guardar_webp(sangrar(encajar(recortar(Image.open(p).convert('RGBA')), 512, 512, abajo=True)), 'hierba_mata'); hechos.append('hierba_mata')
    # agujas: abanicos de ramitas
    for n, src, seed in [('aguja_conifera', 'ramita_conifera', 3), ('aguja_araucaria', 'ramita_araucaria', 5)]:
        p = f / f'{src}.png'
        if p.exists():
            guardar_webp(sangrar(abanico(Image.open(p).convert('RGBA'), seed=seed)), n); hechos.append(n)
    for n in ['corteza_selva', 'corteza_palmera', 'corteza_conifera']:
        p = c / f'{n}.jpg'
        if p.exists():
            corteza(p, n); hechos.append(n)
    (RAIZ / 'src/flora/fotos-disponibles.js').write_text(
        '// Fotos de follaje y corteza presentes en public/textures/flora/ (las escribe tools/preparar-follaje.py). Las que falten se dibujan por código.\n'
        f'export const FOTOS = {json.dumps(hechos)};\n')
    print('hechos:', hechos)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(Path(sys.argv[1]))
