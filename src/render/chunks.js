// Parches globales de ShaderChunk / ShaderLib. Se instalan UNA vez, al crear el módulo render (el primero en arrancar),
// por lo que todo material de three que cree cualquier módulo los hereda sin hacer nada (setupMaterial es opcional).
//
// 1) NIEBLA ATMOSFÉRICA (reemplaza fog_*):  extinción uniforme + niebla de altura exponencial (integral analítica a lo
//    largo del rayo cámara->fragmento) + color que cambia hacia el sol (lóbulo de Mie) + fundido total hacia el cielo en
//    el horizonte. Usa scene.fog (color) y los uniforms COMPARTIDOS uFogA/uFogB/uFogC/uFogSun (ver `shared`).
// 2) SOMBRAS EN CASCADA: cuatro cascadas (SUN_LIGHT_CASCADES) con sesgo escalado por texel de cada cascada.
// 3) AMBIENTE: la luz hemisférica se ignora en materiales PBR que ya reciben IBL (scene.environment).
//
// Los uniforms compartidos son Float32Array: UniformsUtils.clone no los copia (solo clona objetos THREE), así que
// todos los materiales apuntan al mismo array y basta con escribirlo en sitio una vez por frame.
import * as THREE from 'three';
import { CASCADE_COUNT } from './cascades.js';

export const shared = {
  // x: extinción uniforme (1/m); y: densidad de niebla de altura a la altura base (1/m); z: caída exponencial (1/m); w: altura base (m)
  fogA: new Float32Array([2.2e-5, 3.0e-4, 0.006, 0]),
  // xyz: dirección hacia el sol (mundo); w: fuerza del lóbulo solar 0..1
  fogB: new Float32Array([0, 1, 0, 0.5]),
  // x,y: distancias (m) entre las que el horizonte se funde 100% con el cielo; z: viento/tiempo; w: reservado
  fogC: new Float32Array([6500, 8600, 0, 0]),
  // color de la niebla mirando hacia el sol (lineal, HDR)
  fogSun: new Float32Array([1, 1, 1]),
  // parámetros de sombras de nubes: x: escala (1/m), y: cobertura 0..1, z: oscurecimiento máx, w: altura de nubes (m)
  cloudA: new Float32Array([1 / 2600, 0.4, 0.55, 2500]),
  // xy: desplazamiento del viento acumulado (m); zw: libre
  cloudB: new Float32Array([0, 0, 0, 0]),
};

export const sharedUniforms = {
  uFogA: { value: shared.fogA },
  uFogB: { value: shared.fogB },
  uFogC: { value: shared.fogC },
  uFogSun: { value: shared.fogSun },
  uCloudA: { value: shared.cloudA },
  uCloudB: { value: shared.cloudB },
};

function replaceOnce(src, from, to, label) {
  if (typeof from === 'string') {
    if (!src.includes(from)) { console.warn(`[render] parche no aplicado (${label}): texto no encontrado`); return src; }
    return src.replace(from, to);
  }
  if (!from.test(src)) { console.warn(`[render] parche no aplicado (${label}): patrón no encontrado`); return src; }
  return src.replace(from, to);
}

let installed = false;

export function installShaderPatches() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk;

  // --- uniforms compartidos en UniformsLib y en cada ShaderLib que ya tiene niebla ---
  Object.assign(THREE.UniformsLib.fog, sharedUniforms);
  for (const key of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[key].uniforms;
    if (u && 'fogColor' in u) Object.assign(u, sharedUniforms);
  }

  // --- niebla ---
  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vFogRay;
#endif
`;
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  // vector cámara -> vértice en ejes de mundo (la longitud es la distancia real)
  vFogRay = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec4 uFogA;
  uniform vec4 uFogB;
  uniform vec4 uFogC;
  uniform vec3 uFogSun;
#endif
`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  {
    float fogDist = length( vFogRay );
    vec3 fogDir = vFogRay / max( fogDist, 1e-3 );
    float fogTau = uFogA.x * fogDist;
    float fogB = uFogA.z;
    float fogK = fogB * fogDir.y;
    float fogH0 = cameraPosition.y - uFogA.w;
    float fogBase = uFogA.y * exp( clamp( - fogB * fogH0, - 30.0, 30.0 ) );
    float fogInt = abs( fogK ) > 1e-5 ? ( 1.0 - exp( clamp( - fogK * fogDist, - 30.0, 30.0 ) ) ) / fogK : fogDist;
    fogTau += fogBase * fogInt;
    float fogF = 1.0 - exp( - fogTau );
    if ( uFogC.y > 0.0 ) {
      float hz = clamp( ( fogDist - uFogC.x ) / max( uFogC.y - uFogC.x, 1.0 ), 0.0, 1.0 );
      fogF = max( fogF, hz * hz * ( 3.0 - 2.0 * hz ) );
    }
    vec2 fogHz = fogDir.xz;
    float fogHl = length( fogHz );
    vec2 fogSh = normalize( uFogB.xz + vec2( 1e-5 ) );
    float fogAz = fogHl > 1e-3 ? dot( fogHz / fogHl, fogSh ) : 0.0;
    float fogLobe = clamp( pow( max( fogAz, 0.0 ), 4.0 ) * uFogB.w * ( 1.0 - smoothstep( 0.15, 0.6, fogDir.y ) ), 0.0, 1.0 );
    vec3 fogCol = mix( fogColor, uFogSun, fogLobe );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, clamp( fogF, 0.0, 1.0 ) );
  }
#endif
`;

  // --- sombras en cascada ---
  let sp = C.shadowmap_pars_fragment;
  sp = replaceOnce(sp, '#define SUN_LIGHT_CASCADES 2', `#define SUN_LIGHT_CASCADES ${CASCADE_COUNT}`, 'cascadas');
  sp = replaceOnce(
    sp,
    /vec4 shadowWorldPosition = vec4\(\s*vSunShadowWorldPosition\.xyz \+ vSunShadowWorldNormal \* sunLightShadow\.shadowNormalBias,\s*1\.0\s*\);/,
    'vec3 sunWP = vSunShadowWorldPosition.xyz;',
    'sun wp',
  );
  sp = replaceOnce(
    sp,
    /sunLightShadow\.shadowBias,\s*sunLightShadow\.shadowRadius,\s*sunShadowMatrix\[ cascadeOffset \+ i \] \* shadowWorldPosition/,
    'sunLightShadow.shadowBias * cascade.w,\n\t\t\t\t\t\tsunLightShadow.shadowRadius,\n\t\t\t\t\t\tsunShadowMatrix[ cascadeOffset + i ] * vec4( sunWP + vSunShadowWorldNormal * ( sunLightShadow.shadowNormalBias * cascade.w ), 1.0 )',
    'sesgo por cascada',
  );
  C.shadowmap_pars_fragment = sp;

  // --- ambiente: sin luz hemisférica donde ya hay IBL ---
  C.lights_fragment_begin = replaceOnce(
    C.lights_fragment_begin,
    'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
    `#ifndef ENVMAP_TYPE_CUBE_UV
\t\t\tirradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
\t\t\t#endif`,
    'hemisferica',
  );
}
