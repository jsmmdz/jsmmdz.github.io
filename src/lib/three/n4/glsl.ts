/**
 * Shaders del N4 (T32): la foto, el fondo de cortinas, el material de los cristales y el texto impreso.
 *
 * La foto es un plano que mezcla dos fotos con el progreso del scroll (K7 de Zero: fundido lineal por
 * pares) y, sin curvatura, calza con su rectángulo DOM.
 *
 * Para el regreso del caso a la cinta, el mismo plano toma poco a poco la forma de la tarjeta del N3:
 * usa la misma deformación (`cinta`) y la misma luz que ella, con `u_sheetP` de 0 (plano) a 1 (la forma
 * de la tarjeta en la cinta quieta). Todo se calcula en el color ya codificado, como el N3 (ver
 * `lib/three/n3/glsl.ts`): así el último cuadro del vuelo de ida y el primero del caso coinciden.
 */
import { REFRACCION_FUERZA } from '@/lib/n4/cristales';
import { CINTA_CONST, CINTA_FUNC } from '../n3/glsl';

export const MEDIO_VERTEX = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform float u_W;
uniform float u_sheetP;

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

// ---------- El fondo: las cortinas de Zero en el color del caso (A1) ----------

/** Un plano que cubre toda la pantalla: la posición ya viene en el espacio de recorte. */
export const PANTALLA_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Franjas verticales de pliegues (periodos de 4 a 10 % del ancho) entre fondo × 0,6 y fondo × 1,5, una
 * viñeta que oscurece las esquinas hasta × 0,35 sin tocar el centro, grano de ±4 de luma que cambia por
 * cuadro y un vaivén lento (≤ 1 % del ancho, periodo de 5 s). Ningún píxel pasa de luma 80 (Rec. 709).
 * Los colores son los ya codificados, como en el resto del mundo.
 *
 * La luz late como en Zero (pulido de T32, medido en la grabación el 2026-10-02): los haces no se mueven
 * de lugar; su brillo late cada ≈ 0,6 s con ± 15 % y, de vez en cuando, un haz se enciende fuerte unos
 * instantes. Con movimiento reducido no late.
 */
export const FONDO_FRAGMENT = /* glsl */ `
uniform vec3 u_fondo;
uniform float u_alfa;
uniform float u_tiempo;
uniform float u_cuadro;
uniform float u_aspecto;
uniform float u_mov;

varying vec2 vUv;

const float TAU = 6.2831853;
const float LUMA_MAX = 79.0 / 255.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // Vaivén lento de los pliegues: 0,7 % del ancho con un periodo de 5,2 s (apagado con movimiento reducido)
  float x = vUv.x + u_mov * 0.007 * sin(u_tiempo * 1.2);
  // Tres armónicos: periodos de 10 %, 5,6 % y 4,2 % del ancho
  float f = 0.55 * sin(TAU * x * 10.0 + 0.7) + 0.3 * sin(TAU * x * 18.0 + 2.1) + 0.15 * sin(TAU * x * 24.0 + 4.0);
  // El cuerpo de la cortina queda en el color del caso (× 1); los pliegues oscuros llegan a × 0,6 y los
  // haces claros angostos, a × 1,5
  float haz = pow(smoothstep(0.25, 0.95, f), 1.4);
  float pliegue = smoothstep(0.15, 0.95, -f);
  // El latido: tres senos de periodos que no se repiten entre sí (0,6, 0,37 y 2,3 s), ± 15 % en total
  float t = u_tiempo;
  float latido = 0.09 * sin(TAU * t / 0.6) + 0.04 * sin(TAU * t / 0.37 + 1.3) + 0.02 * sin(TAU * t / 2.3 + 0.4);
  // El destello: cada haz (uno por periodo de 10 % del ancho) se enciende un instante cada ≈ 14 s, a destiempo
  float idHaz = floor(x * 10.0 + 0.7 / TAU + 0.25);
  float destello = pow(max(0.0, sin(t * 0.45 + hash(vec2(idHaz, 3.7)) * TAU)), 24.0);
  float k = 1.0 + 0.5 * haz * (1.0 + u_mov * (latido * 2.0 + 1.6 * destello)) - 0.4 * pliegue + u_mov * latido * 0.9;

  // Viñeta: 0 en el centro, 1 en las esquinas
  float r = length((vUv - 0.5) * vec2(u_aspecto, 1.0)) / length(vec2(u_aspecto, 1.0) * 0.5);
  float vineta = 1.0 - 0.65 * smoothstep(0.55, 1.0, r);

  vec3 col = u_fondo * k * vineta;
  // Grano de ±4 de luma
  col += (hash(gl_FragCoord.xy + u_cuadro * 17.0) - 0.5) * 2.0 * (4.0 / 255.0);
  // Tope de luma: ni el haz más claro pasa de 79
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  if (luma > LUMA_MAX) col *= LUMA_MAX / luma;
  gl_FragColor = vec4(max(col, 0.0) * u_alfa, 1.0);
}
`;

// ---------- El material del cristal (K4): máscara de normales y refracción en pantalla ----------

/**
 * Primer paso: cada cristal se dibuja en una máscara con su normal en espacio de vista (xy en rojo y
 * verde) y una normal de escarcha generada aquí (en azul). Todo va premultiplicado por la opacidad del
 * cristal: con el antialias de la máscara, el borde queda con cobertura parcial.
 */
export const MASCARA_VERTEX = /* glsl */ `
varying vec3 vN;
varying vec2 vLocal;
void main() {
  vN = normalize(normalMatrix * normal);
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const MASCARA_FRAGMENT = /* glsl */ `
uniform float u_alfa;
varying vec3 vN;
varying vec2 vLocal;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Ruido de valor suave: la escarcha del cristal, atada a su propia forma
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 n = normalize(vN);
  // Celdas grandes (4 y 9 por ancho de cristal): la escarcha modula el desplazamiento, no lo rompe
  float escarcha = 0.65 * ruido(vLocal * 4.0) + 0.35 * ruido(vLocal * 9.0);
  gl_FragColor = vec4(vec3(n.xy * 0.5 + 0.5, escarcha) * u_alfa, u_alfa);
}
`;

/**
 * Segundo paso: donde hay cristal, la escena se toma desplazada por la normal
 * (`nxy·0,15 + (escarcha − 0,5)·0,3·nxy`), con dispersión (el rojo con `1 − d` y el azul con `1 + d`),
 * fresnel `0,04 + 0,96·(1 − nz)^10` y brillo de arista sobre el gradiente de la normal. No desenfoca
 * nada detrás: solo lo desplaza.
 *
 * Pulido de T32 (`E2`, opción C del autor, 2026-10-02): el corrimiento y el arcoíris van por separado.
 * La fuerza baja de 0,25 a 0,15 (el fondo se corre de 10 a 60 px a 1440 en reposo) y la dispersión sube de
 * 0,15 a 0,35. Encima, como en Zero: un velo claro en el cuerpo, tornasol donde la normal se inclina (la
 * franja de astillas) y la pared clara, que ya no trae de lejos la foto de la derecha.
 */
const REFRACCION = /* glsl */ `
uniform sampler2D tEscena;
uniform sampler2D tMascara;
uniform vec2 u_px;

const float REFRACCION_FUERZA = ${REFRACCION_FUERZA.toFixed(3)};
const float DISPERSION = 0.35;
const float ESCARCHA_FUERZA = 0.3;
const float FRESNEL_POTENCIA = 10.0;
const float ARISTA = 0.3;
const vec3 FRESNEL_COLOR = vec3(0.92, 0.95, 1.0);
const float VELO = 0.09;
const vec3 VELO_COLOR = vec3(1.0, 0.93, 0.94);
const float TORNASOL = 0.1;
const float PARED_CLARA = 0.3;
const float ARCOIRIS_CUERPO = 0.2;

// El color de la escena visto a través del cristal, con la dispersión por canal
vec3 refractar(vec2 uv, vec2 nxy, float escarcha) {
  vec2 d = nxy * REFRACCION_FUERZA + (escarcha - 0.5) * ESCARCHA_FUERZA * nxy;
  return vec3(
    texture2D(tEscena, uv + d * (1.0 - DISPERSION)).r,
    texture2D(tEscena, uv + d).g,
    texture2D(tEscena, uv + d * (1.0 + DISPERSION)).b
  );
}

float fresnel(vec2 nxy) {
  float nz = sqrt(max(0.0, 1.0 - dot(nxy, nxy)));
  return 0.04 + 0.96 * pow(1.0 - nz, FRESNEL_POTENCIA);
}

// Tornasol de película delgada: el tono gira con la dirección de la normal y la escarcha
vec3 tornasol(vec2 nxy, float escarcha) {
  float t = dot(nxy, vec2(1.7, 2.3)) + escarcha * 1.3;
  return 0.5 + 0.5 * cos(6.2831853 * (t + vec3(0.0, 0.33, 0.67)));
}

// El color del vidrio en un punto: la escena refractada con su velo, el tornasol de las astillas y la
// pared clara. La pared (la normal casi de canto) toma la escena de cerca: con la fuerza entera traería
// la foto de la otra columna.
vec3 vidrio(vec2 uv, vec2 nxy, float escarcha) {
  float inclinacion = length(nxy);
  float pared = smoothstep(0.6, 0.85, inclinacion);
  vec3 c = refractar(uv, nxy * (1.0 - 0.8 * pared), escarcha);
  c = mix(c, VELO_COLOR, VELO);
  c += tornasol(nxy, escarcha) * TORNASOL * smoothstep(0.12, 0.45, inclinacion);
  // Arcoíris en el cuerpo (autor, 2026-10-02; en Zero son manchas de espectro dentro del vidrio): una veta
  // donde la escarcha cruza 0,62 a 0,78, con el tono recorriendo el espectro a lo ancho de la veta. El
  // tono se corre con la normal, así la veta cambia de color cuando el cristal gira.
  float veta = smoothstep(0.58, 0.64, escarcha) * (1.0 - smoothstep(0.72, 0.8, escarcha));
  vec3 espectro = 0.5 + 0.5 * cos(6.2831853 * ((escarcha - 0.58) * 4.5 + dot(nxy, vec2(3.0, 2.0)) + vec3(0.0, 0.33, 0.67)));
  c += espectro * veta * ARCOIRIS_CUERPO;
  c = mix(c, vec3(1.0), pared * PARED_CLARA);
  return c + fresnel(nxy) * FRESNEL_COLOR;
}
`;

/**
 * La máscara de tinte de los cristales de la paleta (el design system): el color de cada uno, premultiplicado
 * por su opacidad. Los demás cristales no la tocan.
 */
export const TINTE_FRAGMENT = /* glsl */ `
uniform vec3 u_color;
uniform float u_alfa;
void main() {
  gl_FragColor = vec4(u_color * u_alfa, u_alfa);
}
`;

/** El pase de composición de los cristales de frente: nítidos, con brillo de arista. */
export const CRISTALES_FRAGMENT = /* glsl */ `
${REFRACCION}
uniform sampler2D tTinte;
uniform float u_conTinte;
varying vec2 vUv;

// Cuánto toma el vidrio el color de su paleta: casi todo, para que el color se lea fiel
const float TINTE = 0.82;

vec2 normalCruda(vec2 uv) {
  return texture2D(tMascara, uv).rg * 2.0 - 1.0;
}

void main() {
  vec3 base = texture2D(tEscena, vUv).rgb;
  vec4 m = texture2D(tMascara, vUv);
  if (m.a < 0.004) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }
  vec2 nxy = m.rg / m.a * 2.0 - 1.0;
  float escarcha = m.b / m.a;
  vec3 c = vidrio(vUv, nxy, escarcha);
  // El cristal de la paleta toma su color, con la luz de la escena refractada para que siga siendo vidrio
  if (u_conTinte > 0.5) {
    vec4 t = texture2D(tTinte, vUv);
    if (t.a > 0.004) {
      vec3 color = t.rgb / t.a;
      float luz = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 vidrioColor = color * (0.85 + 0.5 * (luz - 0.3)) + fresnel(nxy) * FRESNEL_COLOR * 0.5;
      c = mix(c, vidrioColor, TINTE * clamp(t.a / m.a, 0.0, 1.0));
    }
  }
  // Brillo de arista: el gradiente de las normales vecinas (la orilla y las grietas entre facetas)
  vec2 gx = abs(normalCruda(vUv + vec2(u_px.x, 0.0)) - normalCruda(vUv - vec2(u_px.x, 0.0)));
  vec2 gy = abs(normalCruda(vUv + vec2(0.0, u_px.y)) - normalCruda(vUv - vec2(0.0, u_px.y)));
  float dN = length(gx + gy);
  c += vec3(1.0) * smoothstep(0.05, 0.3, dN) * ARISTA;
  gl_FragColor = vec4(mix(base, c, m.a), 1.0);
}
`;

/**
 * El pase de las esquirlas de fondo (K6): lo mismo, pero la máscara se promedia sobre un disco cuyo radio
 * crece con la distancia al punto de enfoque (el desenfoque de lente: máximo 16 px, radio de foco 0,3).
 */
export const ESQUIRLAS_FRAGMENT = /* glsl */ `
${REFRACCION}
uniform float u_aspecto;
uniform float u_desenfoque;
uniform float u_foco;
uniform float u_caida;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

const int MUESTRAS = 16;
const float VELO_LEJANO = 0.08;

void main() {
  vec3 base = texture2D(tEscena, vUv).rgb;
  // Distancia al centro en unidades de medio alto: 0 en el centro, 1 arriba y abajo
  float d = length((vUv - 0.5) * vec2(u_aspecto, 1.0)) * 2.0;
  float radio = u_desenfoque * smoothstep(u_foco, u_foco + u_caida, d);
  float giro = hash(gl_FragCoord.xy) * 6.2831853;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < MUESTRAS; i++) {
    float a = float(i) * 2.39996323 + giro;
    float rad = sqrt((float(i) + 0.5) / float(MUESTRAS));
    acc += texture2D(tMascara, vUv + vec2(cos(a), sin(a)) * rad * radio * u_px);
  }
  vec4 m = acc / float(MUESTRAS);
  if (m.a < 0.004) {
    gl_FragColor = vec4(base, 1.0);
    return;
  }
  vec2 nxy = m.rg / m.a * 2.0 - 1.0;
  float escarcha = m.b / m.a;
  // Un velo claro leve: las piezas lejanas se leen como vidrio pálido y no como manchas oscuras
  vec3 c = refractar(vUv, nxy, escarcha) + (fresnel(nxy) + VELO_LEJANO) * FRESNEL_COLOR;
  gl_FragColor = vec4(mix(base, c, m.a), 1.0);
}
`;

// ---------- El texto impreso (K5) ----------

/** Un plano hijo del cristal con la textura del texto: gira con él y va encima de la refracción. */
export const TEXTO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TEXTO_FRAGMENT = /* glsl */ `
uniform sampler2D u_mapa;
uniform float u_alfa;
varying vec2 vUv;
void main() {
  // La textura ya viene premultiplicada por su alfa
  gl_FragColor = texture2D(u_mapa, vUv) * u_alfa;
}
`;
