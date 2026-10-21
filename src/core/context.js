import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Events } from './events.js';
import { createTimeState } from './timeofday.js';

/**
 * Contexto compartido. Cada módulo asigna su API en ctx.<nombre> dentro de create(ctx).
 * Contrato completo en docs/ARQUITECTURA.md.
 */
export function createContext(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CONFIG.render.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.render.near,
    CONFIG.render.far,
  );
  camera.position.set(0, 80, 0);
  scene.add(camera);

  const ctx = {
    config: CONFIG,
    container,
    events: new Events(),
    scene,
    camera,
    settings: { quality: CONFIG.quality },
    // 'loading' | 'menu' | 'playing' | 'paused' | 'dead'
    state: 'loading',
    debug: { enabled: false, freeCamera: false, hideUI: false },
    time: createTimeState(CONFIG.time.startHour),

    // Los asigna el módulo render:
    renderer: null,
    composer: null,
    render: () => {},
    lighting: null,

    // Los asigna cada módulo en su create():
    world: null,
    flora: null,
    player: null,
    input: null,
    physics: null,
    fauna: null,
    survival: null,
    fx: null,
    audio: null,
    ui: null,

    setState(next) {
      const prev = ctx.state;
      if (prev === next) return;
      ctx.state = next;
      ctx.events.emit('state', { state: next, prev });
    },
  };
  return ctx;
}
