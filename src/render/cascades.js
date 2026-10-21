// Sombras en cascada: derivado de three/addons/lights/SunLight(.Shadow).js (r186), con cambios propios:
//  - 4 cascadas en lugar de 2 (el chunk de shader se parchea en chunks.js: SUN_LIGHT_CASCADES).
//  - Distancias de corte explícitas (shadow.splitDistances) en vez del esquema "práctico" automático.
//  - Rango de profundidad idéntico en todas las cascadas, con "techo" configurable (shadow.casterExtent, en metros hacia
//    el sol) para que montañas lejanas proyecten sombras largas con el sol bajo.
//  - El componente .w de los datos de cascada guarda el tamaño de texel en metros: el shader lo usa para escalar el
//    sesgo normal y el sesgo de profundidad de cada cascada (evita acné en las cercanas y despegue en las lejanas).
// Estabilidad: cada cascada es una esfera envolvente de su porción del frustum (invariante a la rotación de la cámara)
// y el centro se ajusta a la rejilla de texels (sin parpadeo al moverse).
import {
  Frustum, Light, LightShadow, Matrix4, Object3D, OrthographicCamera, Vector3, Vector4, WebGPUCoordinateSystem,
} from 'three';

export const CASCADE_COUNT = 4;
const FADE = 0.12; // fracción final de cada cascada que se mezcla con la siguiente

const _orient = new Matrix4();
const _viewToLight = new Matrix4();
const _lightDir = new Vector3();
const _up = new Vector3();
const _center = new Vector3();
const _nearC = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _farC = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const _casc = Array.from({ length: 8 }, () => new Vector3());

export class CascadedSunShadow extends LightShadow {
  constructor() {
    super(new OrthographicCamera(-5, 5, 5, -5, 0.5, 500));
    this.isSunLightShadow = true;
    this.mapSize.set(2048, 2048);
    /** Distancias (m) donde terminan las cascadas 0..N-2; la última termina en shadowDistance. */
    this.splitDistances = [10, 32, 90];
    /** Distancia máxima de sombras (m). */
    this.shadowDistance = 240;
    /** Extensión hacia el sol del volumen de sombras (m) para incluir casters lejanos (montañas). */
    this.casterExtent = 400;
    this._cameras = [];
    this._matrices = [];
    this._frustums = [];
    this._cascadeData = [];
    this._viewportCount = CASCADE_COUNT;
    this._frameExtents.set(CASCADE_COUNT, 1);
    this._splits = new Array(CASCADE_COUNT + 1).fill(0);
    for (let i = 0; i < CASCADE_COUNT; i++) {
      this._cameras.push(new OrthographicCamera());
      this._matrices.push(new Matrix4());
      this._frustums.push(new Frustum());
      this._cascadeData.push(new Vector4());
    }
    while (this._viewports.length < CASCADE_COUNT) this._viewports.push(new Vector4());
  }

  getCamera(i = 0) { return this._cameras[i]; }
  getMatrix(i = 0) { return this._matrices[i]; }
  getFrustum(i = 0) { return this._frustums[i]; }

  updateMatrices(light, viewCamera) {
    if (viewCamera === undefined) return;
    const N = CASCADE_COUNT;
    const insetX = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.x);
    const insetY = Math.min(0.25, (Math.ceil(this.radius) + 1) / this.mapSize.y);
    for (let i = 0; i < N; i++) this._viewports[i].set(i + insetX, insetY, 1 - 2 * insetX, 1 - 2 * insetY);
    const resX = this.mapSize.x * (1 - 2 * insetX);
    const resY = this.mapSize.y * (1 - 2 * insetY);
    const resolution = Math.min(resX, resY);

    const camNear = viewCamera.near;
    const camFar = Math.max(camNear + 1e-3, Math.min(this.shadowDistance, viewCamera.far));
    const splits = this._splits;
    splits[0] = camNear;
    for (let i = 1; i < N; i++) splits[i] = Math.min(camFar - 1e-3, this.splitDistances[i - 1]);
    splits[N] = camFar;

    _lightDir.setFromMatrixPosition(light.matrixWorld).negate().normalize();
    _up.set(0, 1, 0);
    if (Math.abs(_up.dot(_lightDir)) > 0.99) _up.set(0, 0, 1);
    _orient.lookAt(_center.set(0, 0, 0), _lightDir, _up);
    _viewToLight.copy(_orient).transpose().multiply(viewCamera.matrixWorld);

    const zNearNdc = viewCamera.reversedDepth ? 1 : (viewCamera.coordinateSystem === WebGPUCoordinateSystem ? 0 : -1);
    const invProj = viewCamera.projectionMatrixInverse;
    let maxZ = -Infinity, minZ = Infinity;
    for (let i = 0; i < 4; i++) {
      const x = i === 0 || i === 1 ? 1 : -1;
      const y = i === 0 || i === 3 ? 1 : -1;
      const nc = _nearC[i].set(x, y, zNearNdc).applyMatrix4(invProj);
      const fc = _farC[i].copy(nc).multiplyScalar(camFar / camNear);
      nc.applyMatrix4(_viewToLight);
      fc.applyMatrix4(_viewToLight);
      maxZ = Math.max(maxZ, nc.z, fc.z);
      minZ = Math.min(minZ, nc.z, fc.z);
    }
    const zTop = maxZ + this.casterExtent;
    const shadowNear = this.camera.near;
    const depthRange = zTop - minZ + 2 * shadowNear;

    for (let i = 0; i < N; i++) {
      const cNear = i === 0 ? splits[0] : this._cascadeData[i - 1].z; // arranca en el inicio del fundido anterior
      const cFar = splits[i + 1];
      const fadeStart = cFar - FADE * (cFar - splits[i]);
      const nA = (cNear - camNear) / (camFar - camNear);
      const fA = (cFar - camNear) / (camFar - camNear);
      _center.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        _casc[j * 2].lerpVectors(_nearC[j], _farC[j], nA);
        _casc[j * 2 + 1].lerpVectors(_nearC[j], _farC[j], fA);
        _center.add(_casc[j * 2]).add(_casc[j * 2 + 1]);
      }
      _center.multiplyScalar(1 / 8);
      let r2 = 0;
      for (let j = 0; j < 8; j++) r2 = Math.max(r2, _casc[j].distanceToSquared(_center));
      let radius = Math.sqrt(r2);
      radius = Math.ceil(radius * 4) / 4; // radio cuantizado: tamaño de texel constante entre frames
      let texel = (2 * radius) / resolution;
      if (resolution > 1) {
        radius /= 1 - 1 / resolution;
        const tx = (2 * radius) / resX, ty = (2 * radius) / resY;
        _center.x = Math.round(_center.x / tx) * tx;
        _center.y = Math.round(_center.y / ty) * ty;
        texel = Math.max(tx, ty);
      }
      this._cascadeData[i].set(i === 0 ? -1e10 : cNear, cFar, fadeStart, texel);

      _center.z = zTop + shadowNear;
      _center.applyMatrix4(_orient);
      const cam = this._cameras[i];
      cam.position.copy(_center);
      cam.quaternion.setFromRotationMatrix(_orient);
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
      cam.near = shadowNear;
      cam.far = depthRange;
      cam.coordinateSystem = this.camera.coordinateSystem;
      cam._reversedDepth = this.camera.reversedDepth;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this._updateMatrix(cam, this._matrices[i], this._frustums[i], this._viewports[i]);
    }
    this.depthRange = depthRange;
  }
}

/** Luz solar con sombras en cascada. La dirección la define la posición (como HemisphereLight): luz hacia el origen. */
export class CascadedSunLight extends Light {
  constructor(color, intensity) {
    super(color, intensity);
    this.isSunLight = true;
    this.type = 'SunLight';
    this.position.copy(Object3D.DEFAULT_UP);
    this.updateMatrix();
    this.shadow = new CascadedSunShadow();
  }
  dispose() { super.dispose(); this.shadow.dispose(); }
}
