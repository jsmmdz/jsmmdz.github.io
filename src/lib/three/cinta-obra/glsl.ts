/**
 * Shaders de la cinta de obra. El vidrio es el del sitio (los cristales del N4 y el canto de las tarjetas
 * del N2): el ámbar es vidrio teñido y la tinta, vidrio ahumado; encima, el velo claro, el tornasol donde la
 * cinta se inclina, el bisel de los bordes, el canto tornasolado, el filo del estampado, el fresnel, un brillo
 * angosto y un reflejo fijo en pantalla. Se calcula en el color ya codificado (sRGB), como el N3 y el N4, y se
 * mezcla con lo de detrás por transparencia.
 *
 * Cada nivel pone su vertex: la cinta vive en las coordenadas planas de su tarjeta y se deforma igual que ella.
 */
import { CINTA_CONST, CINTA_FUNC } from '../n3/glsl';

const VARYINGS = /* glsl */ `
varying vec2 vUv;
varying vec3 vNv;
varying vec3 vVista;
varying vec2 vCanto;
varying float vDetras;
`;

/**
 * N3: la tarjeta es un plano centrado en u_centro, de u_size, que se ahueca con el hover (K11) y se dobla
 * con la cinta de Landberg (K3). La cinta toma el mismo hueco y la misma deformación.
 */
export const CINTA_N3_VERTEX = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform float u_W;
uniform float u_V;
uniform float u_sheetP;
uniform float u_hover;
uniform float u_dent;
uniform float u_escala;
uniform vec2 u_centro;
uniform vec2 u_size;

attribute vec3 aCanto;
attribute float aDetras;
${VARYINGS}

void main() {
  vUv = uv;
  vDetras = aDetras;
  vec3 local = position * u_escala;
  vec2 qd = (local.xy / u_size) * 2.0;
  float hueco = u_hover * u_dent * max(0.0, 1.0 - qd.x * qd.x) * max(0.0, 1.0 - qd.y * qd.y);
  vec3 wp = vec3(u_centro + local.xy, local.z - hueco);
  float ola;
  vec3 p = cinta(wp, u_W, u_V, u_sheetP, ola);
  // La normal gira el mismo ángulo de reposo que la tarjeta
  float q = wp.x / u_W * CINTA_T + CINTA_SHIFT;
  float aRep = CINTA_BANK * cintaPendiente(q) / PI_ * u_sheetP;
  float ca = cos(aRep);
  float sa = sin(aRep);
  vec3 nl = vec3(normal.x, normal.y * ca - normal.z * sa, normal.y * sa + normal.z * ca);
  vNv = normalize(mat3(viewMatrix) * nl);
  vCanto = (mat3(viewMatrix) * aCanto).xy;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vVista = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

/** N2: la tarjeta se enrolla en el cilindro con uCurva y uR, como su cara (theta = x / uR, r = uR + z). */
export const CINTA_N2_VERTEX = /* glsl */ `
uniform float uCurva;
uniform float uR;
uniform float u_escala;
uniform float u_zCara;

attribute vec3 aCanto;
attribute float aDetras;
${VARYINGS}

vec3 girarY(vec3 v, float ca, float sa) {
  return vec3(v.x * ca + v.z * sa, v.y, -v.x * sa + v.z * ca);
}

void main() {
  vUv = uv;
  vDetras = aDetras;
  vec3 local = position * u_escala + vec3(0.0, 0.0, u_zCara);
  float theta = local.x / uR;
  float r = uR + local.z;
  vec3 plano = vec3(local.x, local.y, local.z + uR);
  vec3 curvo = vec3(r * sin(theta), local.y, r * cos(theta));
  vec3 p = mix(plano, curvo, uCurva);
  float ca = cos(theta * uCurva);
  float sa = sin(theta * uCurva);
  vNv = normalize(normalMatrix * girarY(normal, ca, sa));
  vCanto = (normalMatrix * girarY(aCanto, ca, sa)).xy;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vVista = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

export const CINTA_FRAGMENT = /* glsl */ `
uniform sampler2D tImpresion;
uniform float u_repeat;
uniform vec3 u_ambar;
uniform vec3 u_humo;
uniform float u_alpha;
// Cuánto mira la tarjeta a la cámara (N2): de espaldas, la cinta se apaga como su tarjeta
uniform float u_frente;
// Se apaga antes de tender la cinta nueva, después de romperse
uniform float u_opacidad;
uniform float u_ocultarDetras;
uniform vec2 u_res;
${VARYINGS}

const float TINTE_A = 0.8;
const float HUMO_A = 0.72;
const float VELO = 0.09;
const vec3 VELO_COLOR = vec3(1.0, 0.93, 0.94);
const float TORNASOL = 0.12;
const float REFLEJO = 0.08;
const vec3 FRESNEL_COLOR = vec3(0.92, 0.95, 1.0);
const vec3 LUZ = vec3(-0.4, 0.5, 1.0);

vec3 tornasol(vec2 nxy) {
  float t = dot(nxy, vec2(1.7, 2.3));
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}

vec3 aLineal(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void main() {
  // Lo que da la vuelta por detrás de la tarjeta no se ve donde no hay profundidad (N3)
  if (u_ocultarDetras > 0.5 && vDetras > 0.5) discard;
  vec3 n = normalize(vNv);
  if (!gl_FrontFacing) n = -n;
  float m = texture2D(tImpresion, vec2(vUv.x * u_repeat, vUv.y)).r;
  vec2 gm = vec2(dFdx(m), dFdy(m));
  float filo = clamp(length(gm), 0.0, 1.0);
  // El bisel: el vidrio tiene grosor y sus bordes se redondean hacia afuera
  float bisel = smoothstep(0.55, 1.0, abs(vUv.y * 2.0 - 1.0));
  vec2 nxy = n.xy + gm * 2.5 + vCanto * bisel * 0.35;

  vec3 base = mix(u_humo, u_ambar * 0.95, m);
  float a = mix(HUMO_A, TINTE_A, m);
  base = mix(base, VELO_COLOR, VELO);
  a += (1.0 - a) * VELO;

  vec3 extra = tornasol(nxy) * TORNASOL * smoothstep(0.08, 0.45, length(nxy));
  extra += vec3(bisel * bisel * 0.12);
  float diag = dot(gl_FragCoord.xy / u_res.y, vec2(0.6, 0.8));
  extra += vec3(exp(-pow((fract(diag * 0.9 + 0.2) - 0.5) * 7.0, 2.0)) * REFLEJO);
  float canto = 1.0 - smoothstep(0.0, 0.05, min(vUv.y, 1.0 - vUv.y));
  extra += mix(vec3(0.62, 0.86, 1.0), vec3(0.86, 0.72, 1.0), vUv.y) * canto * 0.22;
  extra += vec3(0.35, 0.45, 0.55) * filo * 0.3;
  vec3 V = normalize(vVista);
  extra += (0.04 + 0.96 * pow(1.0 - abs(dot(n, V)), 5.0)) * FRESNEL_COLOR * 0.6;
  vec3 H = normalize(normalize(LUZ) + V);
  extra += vec3(pow(max(dot(n, H), 0.0), 120.0) * 0.5);

  // Premultiplicado: la base pesa su opacidad y los brillos se suman encima
  vec3 pre = base * a + extra;
  float alfa = clamp(a + max(extra.r, max(extra.g, extra.b)) * 0.5, 0.0, 1.0);
  vec3 col = pre / max(alfa, 1e-4);
#ifdef SALIDA_LINEAL
  col = aLineal(col);
#endif
  gl_FragColor = vec4(col, alfa * u_alpha * u_frente * u_opacidad);
#ifdef SALIDA_LINEAL
  #include <colorspace_fragment>
#endif
}
`;
