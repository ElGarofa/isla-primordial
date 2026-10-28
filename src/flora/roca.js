// Material de las rocas sueltas: usa la capa «roca» de las texturas del suelo (world/suelos.js) proyectada en tres planos en coordenadas de
// MUNDO, igual que los acantilados del terreno, así la base de cada roca y el suelo rocoso que la rodea comparten grano, color y relieve.
// El color final = tinte de la instancia (bioma, mineral) × color por vértice (AO, verdín) × textura ÷ su color medio.
import * as THREE from 'three';
import { CAPA } from '../world/suelos.js';

export function materialRoca(ctx) {
  const s = ctx.world?.terrain?.suelos;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, color: 0x9a9388 }); // gris pardo de la roca del terreno (VEG.roca), algo más claro por el AO del vértice
  if (!s) return m; // sin capas del suelo (no debería ocurrir): material liso
  const i = CAPA.roca, med = s.medios;
  const U = { tSueloA: { value: s.albedo }, tSueloN: { value: s.normal }, uMedioR: { value: new THREE.Vector3(med[i * 3], med[i * 3 + 1], med[i * 3 + 2]) }, uEscR: { value: 1 / 2.6 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRP;\nvarying vec3 vRN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 rp4 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vRN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vec4 rp4 = modelMatrix * vec4(transformed, 1.0);
          vRN = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vRP = rp4.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRP; varying vec3 vRN;
        uniform highp sampler2DArray tSueloA; uniform highp sampler2DArray tSueloN; uniform vec3 uMedioR; uniform float uEscR;
        vec3 nCompR(vec2 xy) { vec2 t = xy * 2.0 - 1.0; return vec3(t, sqrt(max(0.0, 1.0 - dot(t, t)))); }`)
      .replace('#include <map_fragment>', `
        vec3 nR = normalize(vRN); vec3 twR = pow(abs(nR), vec3(4.0)); twR /= (twR.x + twR.y + twR.z + 1e-5);
        float L = ${i}.0;
        vec3 aR = texture(tSueloA, vec3(vRP.zy * uEscR, L)).rgb * twR.x + texture(tSueloA, vec3(vRP.xz * uEscR, L)).rgb * twR.y + texture(tSueloA, vec3(vRP.xy * uEscR, L)).rgb * twR.z;
        diffuseColor.rgb *= aR / max(uMedioR, vec3(0.02));
        vec3 txR = nCompR(texture(tSueloN, vec3(vRP.zy * uEscR, L)).xy), tyR = nCompR(texture(tSueloN, vec3(vRP.xz * uEscR, L)).xy), tzR = nCompR(texture(tSueloN, vec3(vRP.xy * uEscR, L)).xy);
        txR = vec3(txR.xy + nR.zy, abs(txR.z) * nR.x); tyR = vec3(tyR.xy + nR.xz, abs(tyR.z) * nR.y); tzR = vec3(tzR.xy + nR.xy, abs(tzR.z) * nR.z);
        vec3 nRoca = normalize(txR.zyx * twR.x + tyR.xzy * twR.y + tzR.xyz * twR.z);`)
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(nRoca, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'roca-suelo-v1';
  return m;
}
