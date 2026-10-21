// Capas de partículas con billboards instanciados (sin límite de tamaño de punto). Simulación en CPU, dibujo en una sola llamada por capa.
import * as THREE from 'three';

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}
function rnd(a, b) { return a + Math.random() * (b - a); }

export const SPRITES = {
  /** Bocanada suave con textura de humo (varias manchas). */
  humo() {
    return canvasTex(128, (g, S) => {
      g.clearRect(0, 0, S, S);
      for (let i = 0; i < 14; i++) {
        const x = S / 2 + (Math.random() - 0.5) * S * 0.4, y = S / 2 + (Math.random() - 0.5) * S * 0.4, r = S * (0.14 + Math.random() * 0.2);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255,255,255,${0.16 + Math.random() * 0.16})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
      }
      const edge = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5);
      edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = edge; g.fillRect(0, 0, S, S);
    });
  },
  /** Resplandor circular (llamas, chispas, luciérnagas). */
  brillo() {
    return canvasTex(64, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    });
  },
  /** Lengua de fuego: gota estirada. */
  llama() {
    return canvasTex(64, (g, S) => {
      g.clearRect(0, 0, S, S);
      const gr = g.createRadialGradient(S / 2, S * 0.62, 0, S / 2, S * 0.62, S * 0.5);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.translate(S / 2, S / 2); g.scale(0.62, 1); g.translate(-S / 2, -S / 2);
      g.fillStyle = gr; g.fillRect(0, 0, S, S); g.restore();
    });
  },
  /** Disco duro pequeño (astillas, gotas). */
  duro() {
    return canvasTex(32, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    });
  },
  hoja() {
    return canvasTex(64, (g, S) => {
      g.clearRect(0, 0, S, S);
      g.translate(S / 2, S / 2); g.rotate(-0.6);
      const gr = g.createLinearGradient(-S * 0.4, 0, S * 0.4, 0);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#bcbcbc');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-S * 0.42, 0); g.bezierCurveTo(-S * 0.1, -S * 0.34, S * 0.2, -S * 0.3, S * 0.44, 0); g.bezierCurveTo(S * 0.2, S * 0.3, -S * 0.1, S * 0.34, -S * 0.42, 0); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-S * 0.42, 0); g.lineTo(S * 0.4, 0); g.stroke();
    });
  },
};

const VERT = /* glsl */ `
  attribute vec3 aOffset; attribute float aSize; attribute vec4 aColor; attribute float aRot;
  varying vec2 vUv; varying vec4 vColor;
  void main() {
    vUv = uv; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
    float c = cos(aRot), s = sin(aRot);
    vec2 q = (position.xy) * aSize;
    q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uTint;
  varying vec2 vUv; varying vec4 vColor;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float a = t.a * vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb * uTint * (t.rgb * 0.5 + 0.5), a);
  }`;

/** Una capa: mismo material, mismo mezclado. */
export class ParticleLayer {
  constructor(scene, { max = 800, map, additive = false, tintByLight = true, renderOrder = 5 }) {
    this.max = max; this.n = 0; this.additive = additive; this.tintByLight = tintByLight;
    // estado de simulación
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.col = new Float32Array(max * 4); this.rot = new Float32Array(max); this.spin = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.turb = new Float32Array(max);
    this.fadeIn = new Float32Array(max); this.fade = new Float32Array(max); // fundido (fracción de vida)
    // atributos de dibujo
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.aOffset = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOffset', this.aOffset); g.setAttribute('aSize', this.aSize); g.setAttribute('aColor', this.aColor); g.setAttribute('aRot', this.aRot);
    g.instanceCount = 0;
    this.geo = g;
    this.uniforms = { uMap: { value: map }, uTint: { value: new THREE.Vector3(1, 1, 1) } };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: true,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder; this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
  }

  emit(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p[i * 3] = o.x; this.p[i * 3 + 1] = o.y; this.p[i * 3 + 2] = o.z;
    this.v[i * 3] = o.vx ?? 0; this.v[i * 3 + 1] = o.vy ?? 0; this.v[i * 3 + 2] = o.vz ?? 0;
    this.age[i] = 0; this.life[i] = o.life ?? 1;
    this.s0[i] = o.s0 ?? 0.2; this.s1[i] = o.s1 ?? o.s0 ?? 0.2;
    this.col[i * 4] = o.r ?? 1; this.col[i * 4 + 1] = o.g ?? 1; this.col[i * 4 + 2] = o.b ?? 1; this.col[i * 4 + 3] = o.a ?? 1;
    this.rot[i] = o.rot ?? Math.random() * 6.283; this.spin[i] = o.spin ?? 0;
    this.drag[i] = o.drag ?? 0; this.grav[i] = o.grav ?? 0; this.turb[i] = o.turb ?? 0;
    this.fadeIn[i] = o.fadeIn ?? 0.12; this.fade[i] = o.fade ?? 0.55;
  }

  update(dt, camera, wind) {
    const { p, v, age, life, n } = this;
    // simular y compactar
    let w = 0;
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      if (age[i] >= life[i]) continue;
      if (w !== i) this.copy(i, w);
      const dr = Math.max(0, 1 - this.drag[w] * dt);
      v[w * 3] = v[w * 3] * dr; v[w * 3 + 1] = v[w * 3 + 1] * dr - this.grav[w] * dt; v[w * 3 + 2] = v[w * 3 + 2] * dr;
      if (this.turb[w] > 0) {
        const t = this.turb[w] * dt;
        v[w * 3] += (Math.random() - 0.5) * t; v[w * 3 + 1] += (Math.random() - 0.5) * t * 0.5; v[w * 3 + 2] += (Math.random() - 0.5) * t;
      }
      if (wind) { v[w * 3] += wind.x * dt * 0.6; v[w * 3 + 2] += wind.z * dt * 0.6; }
      p[w * 3] += v[w * 3] * dt; p[w * 3 + 1] += v[w * 3 + 1] * dt; p[w * 3 + 2] += v[w * 3 + 2] * dt;
      this.rot[w] += this.spin[w] * dt;
      w++;
    }
    this.n = w;
    // volcar a los atributos
    const ao = this.aOffset.array, as = this.aSize.array, ac = this.aColor.array, ar = this.aRot.array;
    for (let i = 0; i < w; i++) {
      const t = age[i] / life[i];
      ao[i * 3] = p[i * 3]; ao[i * 3 + 1] = p[i * 3 + 1]; ao[i * 3 + 2] = p[i * 3 + 2];
      as[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const fin = this.fadeIn[i] > 0 ? Math.min(1, t / this.fadeIn[i]) : 1;
      const fout = t > this.fade[i] ? 1 - (t - this.fade[i]) / (1 - this.fade[i]) : 1;
      ac[i * 4] = this.col[i * 4]; ac[i * 4 + 1] = this.col[i * 4 + 1]; ac[i * 4 + 2] = this.col[i * 4 + 2]; ac[i * 4 + 3] = this.col[i * 4 + 3] * fin * fout;
      ar[i] = this.rot[i];
    }
    this.geo.instanceCount = w;
    this.aOffset.needsUpdate = this.aSize.needsUpdate = this.aColor.needsUpdate = this.aRot.needsUpdate = w > 0;
    this.mesh.visible = w > 0;
    void camera;
  }

  copy(a, b) {
    const t3 = (arr) => { arr[b * 3] = arr[a * 3]; arr[b * 3 + 1] = arr[a * 3 + 1]; arr[b * 3 + 2] = arr[a * 3 + 2]; };
    t3(this.p); t3(this.v);
    for (const k of ['age', 'life', 's0', 's1', 'rot', 'spin', 'drag', 'grav', 'turb', 'fadeIn', 'fade']) this[k][b] = this[k][a];
    for (let c = 0; c < 4; c++) this.col[b * 4 + c] = this.col[a * 4 + c];
  }

  setTint(r, g, b) { this.uniforms.uTint.value.set(r, g, b); }
}

export { rnd };
