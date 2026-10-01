/**
 * Shaders del medio del N4: un plano que mezcla dos medios (fundido ligado al scroll, ZK5) y se abomba
 * con la velocidad del scroll (K7 de Landberg).
 *
 * Para el regreso del caso a la cinta, el mismo plano toma poco a poco la forma de la tarjeta del N3:
 * usa la misma deformación (`cinta`) y la misma luz que ella, con `u_sheetP` de 0 (plano) a 1 (la forma
 * de la tarjeta en la cinta quieta). Todo se calcula en el color ya codificado, como el N3 (ver
 * `lib/three/n3/glsl.ts`): así el último cuadro del vuelo de ida y el primero del caso coinciden.
 */
import { CINTA_CONST, CINTA_FUNC } from '../n3/glsl';

export const MEDIO_VERTEX = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform float u_W;
uniform float u_H;
uniform float u_sheetP;
uniform float u_bulge;

varying vec2 vUv;
varying vec3 vMundo;
varying float vOla;
varying float vX;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float ola;
  // Sin velocidad en la cinta (V = 0): solo la forma de reposo, multiplicada por u_sheetP
  vec3 p = cinta(wp.xyz, u_W, 0.0, u_sheetP, ola);
  // K7: el medio se abomba hacia la cámara, más en el centro (t = 0) que arriba y abajo (|t| = 1)
  float t = clamp(p.y / u_H, -1.0, 1.0);
  p.z += u_bulge * (1.0 - t * t);
  vMundo = p;
  vOla = ola;
  vX = wp.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const MEDIO_FRAGMENT = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform sampler2D u_map0;
uniform sampler2D u_map1;
uniform float u_aspect0;
uniform float u_aspect1;
uniform float u_planeAspect;
uniform float u_mezcla;
uniform float u_corner;
uniform float u_W;
uniform float u_sheetP;
uniform float u_shade;
uniform float u_scrim;

varying vec2 vUv;
varying vec3 vMundo;
varying float vOla;
varying float vX;

// Luz y bruma de la tarjeta (K10 y K11): solo se notan al volar de regreso (u_shade > 0)
const vec3 LUZ = vec3(-0.4, 0.5, 1.0);
const float LUZ_BRILLO = 48.0;
const float LUZ_ESPEC = 0.35;
const float LUZ_DIFUSO = 0.12;
const float BRUMA_FUERZA = 0.8;
const vec3 BRUMA_COLOR = vec3(0.0588235);

vec2 uvCover(float planoA, float imgA, vec2 uv) {
  vec2 s = vec2(1.0);
  if (planoA > imgA) s.y = imgA / planoA;
  else s.x = planoA / imgA;
  return (uv - 0.5) * s + 0.5;
}

float cajaRedonda(vec2 p, vec2 mid, float r) {
  vec2 q = abs(p - mid) - (mid - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  // Esquinas rectas en el caso; la tarjeta las lleva redondeadas (SDF en unidades de alto 1)
  vec2 sz = vec2(u_planeAspect, 1.0);
  vec2 mid = sz * 0.5;
  float r = min(u_corner, min(mid.x, mid.y));
  float d = cajaRedonda(vUv * sz, mid, r);
  float aa = max(fwidth(d), 1e-5);
  float alfa = 1.0 - smoothstep(-aa, aa, d);

  // Fundido entre dos medios, ajustados a «cover»
  vec3 a = texture2D(u_map0, uvCover(u_planeAspect, u_aspect0, vUv)).rgb;
  vec3 b = texture2D(u_map1, uvCover(u_planeAspect, u_aspect1, vUv)).rgb;
  vec3 col = mix(a, b, u_mezcla);
  // Degradado bajo el título de la tarjeta: aparece al volar de regreso
  float g = 1.0 - smoothstep(0.0, 0.5, vUv.y);
  col = mix(col, vec3(0.0), 0.65 * g * g * u_scrim);

  // Normal analítica de la forma de reposo (ola + puerta), como en la tarjeta
  float D = CINTA_DEPTH * u_W;
  float q = vX / u_W * CINTA_T + CINTA_SHIFT;
  float s = vX / u_W;
  float dzdx = -D * cintaPendiente(q) * CINTA_T / u_W;
  if (abs(s) < 1.0) dzdx += CINTA_DOOR * 1.5 * (1.0 - s * s);
  dzdx *= u_sheetP;
  vec3 n = normalize(vec3(-dzdx, 0.0, 1.0));
  float aRep = CINTA_BANK * cintaPendiente(q) / PI_ * u_sheetP;
  float ca = cos(aRep);
  float sa = sin(aRep);
  n = vec3(n.x, n.y * ca - n.z * sa, n.y * sa + n.z * ca);

  vec3 L = normalize(LUZ);
  vec3 v = normalize(cameraPosition - vMundo);
  float difuso = dot(n, L) * 0.5 + 0.5;
  col *= 1.0 - LUZ_DIFUSO * (1.0 - difuso) * u_shade;
  vec3 h = normalize(L + v);
  col += pow(max(dot(n, h), 0.0), LUZ_BRILLO) * LUZ_ESPEC * u_shade;

  float prof = clamp((D - vOla) / (2.0 * D), 0.0, 1.0);
  col = mix(col, BRUMA_COLOR, BRUMA_FUERZA * prof * u_shade);

  gl_FragColor = vec4(col, alfa);
}
`;
