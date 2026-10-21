import { CONFIG } from './core/config.js';
import { createContext } from './core/context.js';
import { updateTimeOfDay } from './core/timeofday.js';
import { MODULES } from './modules.js';
import { initLoading } from './ui/loading.js';
import { installDebug } from './debug/index.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const FIXED = CONFIG.physics.fixedDt;

async function boot() {
  const ctx = createContext(document.getElementById('app'));
  ctx.debug.enabled = DEBUG;
  ctx.debug.hideUI = params.get('ui') === '0';
  if (params.has('quality')) ctx.settings.quality = params.get('quality');
  initLoading(ctx);

  const modules = [];
  for (let i = 0; i < MODULES.length; i++) {
    const def = MODULES[i];
    ctx.events.emit('loading', { name: def.name, label: def.label, progress: i / MODULES.length });
    await new Promise((r) => setTimeout(r, 16)); // deja pintar la pantalla de carga
    try {
      const mod = await (await def.load()).create(ctx);
      modules.push({ name: def.name, mod: mod ?? {}, err: {} });
    } catch (e) {
      console.error(`[${def.name}.create] fallo al iniciar el módulo`, e);
    }
  }

  // Un fallo en un módulo no tumba al resto (clave para desarrollar en paralelo); se informa una vez por fase.
  const call = (m, phase, dt) => {
    const fn = m.mod[phase];
    if (!fn) return;
    try { fn.call(m.mod, dt); } catch (e) {
      if (!m.err[phase]) { m.err[phase] = true; console.error(`[${m.name}.${phase}]`, e); }
    }
  };

  let acc = 0;
  /** Un paso de simulación. `doRender=false` salta el render (usado por advance() en depuración). */
  function step(realDt, doRender = true) {
    const dt = ctx.state === 'paused' ? 0 : realDt;
    ctx.time.realDt = realDt;
    ctx.time.dt = dt;
    ctx.time.elapsed += dt;
    if (!ctx.time.locked) ctx.time.hour = (ctx.time.hour + (dt * 24) / CONFIG.time.dayLengthSec) % 24;
    updateTimeOfDay(ctx.time);

    acc += dt;
    let sub = 0;
    while (acc >= FIXED && sub < 5) {
      for (const m of modules) call(m, 'fixedUpdate', FIXED);
      acc -= FIXED;
      sub++;
    }
    if (sub === 5) acc = 0;
    for (const m of modules) call(m, 'update', dt);
    for (const m of modules) call(m, 'lateUpdate', dt);
    if (doRender) {
      try { ctx.render(dt); } catch (e) {
        if (!step._renderErr) { step._renderErr = true; console.error('[render]', e); }
      }
    }
  }

  window.addEventListener('resize', () => {
    ctx.events.emit('resize', { width: window.innerWidth, height: window.innerHeight });
  });
  ctx.events.emit('resize', { width: window.innerWidth, height: window.innerHeight });

  if (DEBUG) await installDebug(ctx, { step, modules });

  ctx.events.emit('loading', { name: 'listo', label: 'Listo', progress: 1 });
  ctx.setState(DEBUG ? 'playing' : 'menu');

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (DEBUG && window.__game?.manual) { last = now; return; } // en modo captura el avance es manual
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(dt);
  }
  requestAnimationFrame(frame);

  window.__ctx = ctx; // útil para inspeccionar desde la consola
}

boot().catch((e) => console.error('[boot]', e));
