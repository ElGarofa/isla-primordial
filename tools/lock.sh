#!/bin/sh
# Serializa los trabajos pesados con navegador (Playwright + vite + render por software): el equipo tiene 2 CPU.
# Uso: tools/lock.sh node tools/glb-test.mjs   ·   tools/lock.sh node tools/shot.mjs --preset ...
#  -o: el candado lo retiene flock, no se hereda; así un Chromium huérfano de una prueba que falló no bloquea a las siguientes.
#  timeout: ninguna prueba puede quedarse colgada más de 25 min (variable LOCK_MAX en segundos para cambiarlo).
exec flock -o /tmp/isla-pw.lock timeout -k 15 "${LOCK_MAX:-1500}" "$@"
