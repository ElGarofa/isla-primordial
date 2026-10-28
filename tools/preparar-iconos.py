#!/usr/bin/env python3
"""Prepara los iconos de inventario (fotos generadas con Higgsfield) para el juego.

Entrada: carpeta con <id_objeto>.png (RGBA, fondo transparente, 256–1024 px).
Salida:  public/icons/<id>.webp (128 px, alfa) y src/ui/iconos-disponibles.js con la lista (el juego no pide lo que falta: sin 404).
         Los objetos sin foto siguen usando el icono dibujado por código (ui/icons.js).

Uso: python3 tools/preparar-iconos.py <carpeta_iconos> [lado=128]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent


def preparar(ruta: Path, lado: int) -> Image.Image:
    im = Image.open(ruta).convert('RGBA')
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs):  # recorte al contenido + margen del 6 % para que todos ocupen lo mismo en la casilla
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        L = max(x1 - x0, y1 - y0) * 1.12
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        caja = (int(cx - L / 2), int(cy - L / 2), int(cx + L / 2), int(cy + L / 2))
        lienzo = Image.new('RGBA', (caja[2] - caja[0], caja[3] - caja[1]), (0, 0, 0, 0))
        lienzo.paste(im.crop((max(0, caja[0]), max(0, caja[1]), min(im.width, caja[2]), min(im.height, caja[3]))), (max(0, -caja[0]), max(0, -caja[1])))
        im = lienzo
    # premultiplicado al reducir (sin halos claros/oscuros en el borde)
    arr = np.asarray(im).astype(np.float32) / 255
    pm = np.dstack([arr[:, :, :3] * arr[:, :, 3:4], arr[:, :, 3:4]])
    chicas = [Image.fromarray((pm[:, :, c] * 255).astype(np.uint8)).resize((lado, lado), Image.LANCZOS) for c in range(4)]
    r = np.dstack([np.asarray(c).astype(np.float32) / 255 for c in chicas])
    al = np.clip(r[:, :, 3:4], 1e-4, 1)
    rgb = np.where(r[:, :, 3:4] > 0.003, r[:, :, :3] / al, 0)
    return Image.fromarray((np.dstack([rgb, r[:, :, 3:4]]).clip(0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def main(origen: Path, lado: int = 128, destino: Path | None = None, manifiesto: Path | None = None):
    destino = destino or RAIZ / 'public/icons'
    destino.mkdir(parents=True, exist_ok=True)
    hechos = []
    for p in sorted(origen.glob('*.png')):
        preparar(p, lado).save(destino / f'{p.stem}.webp', 'WEBP', quality=90, alpha_quality=95, method=6)
        hechos.append(p.stem)
    (manifiesto or RAIZ / 'src/ui/iconos-disponibles.js').write_text(
        '// Iconos de inventario con foto en public/icons/<id>.webp (los escribe tools/preparar-iconos.py). Los demás se dibujan por código (ui/icons.js).\n'
        f'export const ICONOS = {json.dumps(hechos)};\n')
    print(len(hechos), 'iconos →', destino)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 128,
         Path(sys.argv[3]) if len(sys.argv) > 3 else None, Path(sys.argv[4]) if len(sys.argv) > 4 else None)
