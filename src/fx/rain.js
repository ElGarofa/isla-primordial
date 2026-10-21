// Lluvia: segmentos de línea animados íntegramente en el vertex shader (cero coste de CPU por gota).
import * as THREE from 'three';

export function createRain(ctx, N = 9000) {
  const geo = new THREE.BufferGeometry();
  const base = new Float32Array(N * 2 * 3);
  const end = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    for (let k = 0; k < 2; k++) { base[(i * 2 + k) * 3] = x; base[(i * 2 + k) * 3 + 1] = y; base[(i * 2 + k) * 3 + 2] = z; end[i * 2 + k] = k; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  geo.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const uniforms = {
    uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: new THREE.Vector3(46, 28, 46) },
    uVel: { value: new THREE.Vector3(0, -17, 0) }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.78, 0.84, 0.92) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `
      attribute vec3 aBase; attribute float aEnd;
      uniform vec3 uCam; uniform float uTime; uniform vec3 uBox; uniform vec3 uVel;
      varying float vA;
      void main() {
        vec3 q = aBase * uBox + uVel * uTime;
        vec3 rel = mod(q - uCam + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 w = uCam + rel;
        vec3 dir = normalize(uVel);
        w -= dir * aEnd * 0.55;
        vA = mix(0.9, 0.05, aEnd) * smoothstep(23.0, 8.0, length(rel));
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAlpha; varying float vA;
      void main() { gl_FragColor = vec4(uColor, vA * uAlpha); }`,
  });
  const mesh = new THREE.LineSegments(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.visible = false;
  ctx.scene.add(mesh);
  let t = 0;
  return {
    mesh,
    update(dt, W, state) {
      t += dt;
      const on = W.rain > 0.02 && state !== 'menu' && state !== 'loading';
      mesh.visible = on;
      if (!on) return;
      geo.setDrawRange(0, Math.floor(N * Math.min(1, W.rain)) * 2);
      uniforms.uTime.value = t;
      uniforms.uCam.value.copy(ctx.camera.position);
      const wind = (W.windStrength ?? 0.3) * 6;
      uniforms.uVel.value.set(W.wind.x * wind, -17 - W.rain * 4, W.wind.y * wind);
      uniforms.uAlpha.value = 0.12 + 0.28 * W.rain;
      const day = 1 - (ctx.time.nightFactor ?? 0) * 0.82;
      uniforms.uColor.value.setRGB(0.78 * day + 0.05, 0.84 * day + 0.06, 0.92 * day + 0.1);
    },
  };
}
