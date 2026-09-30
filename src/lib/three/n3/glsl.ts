/**
 * Shaders del mundo N3: la cinta (K3–K7), la luz y la bruma (K10, K11), las esquinas por SDF (K12) y
 * el piso con reflejo (K13). Las constantes son las de la ficha de Landberg
 * (fabrica/proyecto/referentes/T30.json); la forma se verifica contra tests/comunes/cinta.ts.
 *
 * Todo se calcula en el espacio del color ya codificado (sRGB): las texturas se leen sin decodificar
 * y el resultado se escribe tal cual al render target, como hace Landberg. Por eso aquí no aparece
 * `colorspace_fragment`.
 */

/** Constantes de la cinta, una sola vez para el vertex, el fragment y el piso. */
export const CINTA_CONST = /* glsl */ `
const float PI_ = 3.14159265359;
const float CINTA_T = 1.15;
const float CINTA_SHIFT = -0.2;
const float CINTA_TAIL = 1.0;
const float CINTA_BANK = -0.16;
const float CINTA_DIAG = 0.03;
const float CINTA_VTWIST = 1.8;
const float CINTA_REAR_Y = 0.1;
const float CINTA_REAR_Z = 0.2;
const float CINTA_DEPTH = 0.2;
const float CINTA_GAIN = 1.1;
const float CINTA_DOOR = -0.12;
`;

/** Funciones de la cinta: pendiente de la ola, rampa de la puerta y la deformación completa. */
export const CINTA_FUNC = /* glsl */ `
float cintaPendiente(float q) {
  return (PI_ * cos(PI_ * q) - 2.0 * CINTA_TAIL * q * sin(PI_ * q)) * exp(-CINTA_TAIL * q * q);
}

float cintaRampa(float s) {
  s = clamp(s, -1.0, 1.0);
  return s * (1.5 - 0.5 * s * s);
}

// Orden de K3: (1) giro de (y,z) alrededor de la línea central, (2) ola en profundidad,
// (3) diagonal, (4) rear-up, (5) puerta. Todo en función de la x del mundo y multiplicado por P.
vec3 cinta(vec3 p, float W, float V, float P, out float ola) {
  float q = p.x / W * CINTA_T + CINTA_SHIFT;
  float qe = p.x / W;
  float a = CINTA_BANK * cintaPendiente(q) / PI_ * P;
  if (V > 0.001) {
    a += CINTA_VTWIST * V * smoothstep(0.3, 0.9, abs(qe)) * (qe > 0.0 ? 1.0 : -1.0) * P;
  }
  float ca = cos(a);
  float sa = sin(a);
  float y = p.y * ca - p.z * sa;
  float z = p.y * sa + p.z * ca;
  float D = CINTA_DEPTH * W * (1.0 + CINTA_GAIN * V);
  ola = -D * sin(PI_ * q) * exp(-CINTA_TAIL * q * q);
  z += ola * P;
  y += CINTA_DIAG * p.x * P;
  if (V > 0.001) {
    float m = 1.0 - smoothstep(-1.0, 0.3, qe);
    y += CINTA_REAR_Y * W * V * m * P;
    z += CINTA_REAR_Z * W * V * m * P;
  }
  z += CINTA_DOOR * W * cintaRampa(p.x / W) * P;
  return vec3(p.x, y, z);
}
`;

export const TARJETA_VERTEX = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform float u_W;
uniform float u_V;
uniform float u_sheetP;
uniform float u_hover;
uniform float u_dent;

varying vec2 vUv;
varying vec3 vMundo;
varying float vOla;
varying float vX;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // Hover (K11): la pieza se ahueca hacia atrás, más en el centro
  vec2 qd = uv * 2.0 - 1.0;
  float hueco = u_hover * u_dent * (1.0 - qd.x * qd.x) * (1.0 - qd.y * qd.y);
  wp.z -= hueco;
  float ola;
  vec3 p = cinta(wp.xyz, u_W, u_V, u_sheetP, ola);
  vMundo = p;
  // El mismo hueco del hover entra al sombreado: lo ahuecado queda más lejos, más hundido en la bruma
  vOla = ola - hueco;
  vX = wp.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const TARJETA_FRAGMENT = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform sampler2D u_map;
uniform sampler2D u_overlay;
uniform float u_mapAspect;
uniform float u_planeAspect;
uniform vec2 u_size;
uniform float u_corner;
uniform float u_W;
uniform float u_V;
uniform float u_sheetP;
uniform float u_shade;
uniform float u_scrim;
uniform float u_overlayA;
uniform float u_alpha;
uniform float u_hover;
uniform float u_dent;

varying vec2 vUv;
varying vec3 vMundo;
varying float vOla;
varying float vX;

// Luz fija (arriba, izquierda y hacia el espectador), brillo Blinn y bruma de K10 y K11
const vec3 LUZ = vec3(-0.4, 0.5, 1.0);
const float LUZ_BRILLO = 48.0;
const float LUZ_ESPEC = 0.35;
const float LUZ_DIFUSO = 0.12;
const float BRUMA_FUERZA = 0.8;
// Gris de la bruma: 15/255, el #0F0F0F de Landberg
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
  // Esquinas por SDF en unidades donde el alto del plano vale 1
  vec2 sz = vec2(u_planeAspect, 1.0);
  vec2 mid = sz * 0.5;
  float r = min(u_corner, min(mid.x, mid.y));
  float d = cajaRedonda(vUv * sz, mid, r);
  float aa = max(fwidth(d), 1e-5);
  float alfa = 1.0 - smoothstep(-aa, aa, d);

  vec3 col = texture2D(u_map, uvCover(u_planeAspect, u_mapAspect, vUv)).rgb;
  // Degradado bajo el título: solo la mitad de abajo, cargado hacia el borde
  float g = 1.0 - smoothstep(0.0, 0.5, vUv.y);
  col = mix(col, vec3(0.0), 0.65 * g * g * u_scrim);
  // Título y disco: ya dibujados en su textura, se mezclan encima del degradado
  vec4 ov = texture2D(u_overlay, vUv);
  col = mix(col, ov.rgb, ov.a * u_overlayA);

  // Normal analítica exacta (ola + puerta, más el hueco del hover): no sale de la malla
  float D = CINTA_DEPTH * u_W * (1.0 + CINTA_GAIN * u_V);
  float q = vX / u_W * CINTA_T + CINTA_SHIFT;
  float s = vX / u_W;
  float dzdx = -D * cintaPendiente(q) * CINTA_T / u_W;
  if (abs(s) < 1.0) dzdx += CINTA_DOOR * 1.5 * (1.0 - s * s);
  dzdx *= u_sheetP;
  float dzdy = 0.0;
  vec2 qd = vUv * 2.0 - 1.0;
  float hov = u_hover * u_dent;
  dzdx += hov * (1.0 - qd.y * qd.y) * 2.0 * qd.x * (2.0 / u_size.x);
  dzdy += hov * (1.0 - qd.x * qd.x) * 2.0 * qd.y * (2.0 / u_size.y);
  vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));
  // La normal gira el mismo ángulo de reposo que la cinta (la torsión no la mueve)
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

  // Bruma: lo lejano (la cola de la ola) se hunde hacia el gris casi negro, sin multiplicar por negro
  float prof = clamp((D - vOla) / (2.0 * D), 0.0, 1.0);
  col = mix(col, BRUMA_COLOR, BRUMA_FUERZA * prof * u_shade);

  gl_FragColor = vec4(col, alfa * u_alpha);
}
`;

export const PISO_VERTEX = /* glsl */ `
${CINTA_CONST}
${CINTA_FUNC}

uniform float u_W;

varying vec3 vPlano;
varying vec3 vMundo;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPlano = wp.xyz;
  // La misma puerta que la cinta: ambos giran como un solo objeto
  wp.z += CINTA_DOOR * u_W * cintaRampa(wp.x / u_W);
  vMundo = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PISO_FRAGMENT = /* glsl */ `
uniform sampler2D u_refl;
uniform mat4 u_reflMatriz;
uniform float u_celda;
uniform float u_recorrido;
uniform float u_lineas;
uniform float u_alfa;
uniform vec2 u_lampara;

varying vec3 vPlano;
varying vec3 vMundo;

// Constantes de K13
const float REFL_FUERZA = 0.5;
const float REFL_ABANICO = 0.35;
const float REFL_BORDE = 0.1;

float lineaEje(float g) {
  float ancho = max(fwidth(g), 1e-5);
  return 1.0 - smoothstep(0.0, 1.5 * ancho, abs(fract(g) - 0.5));
}

void main() {
  // vFar: 0 en el contacto con las tarjetas, 1 al fondo, negativo hacia la cámara
  float vFar = -vPlano.z / u_recorrido;
  float linea = max(lineaEje(vPlano.x / u_celda), lineaEje(-vPlano.z / u_celda));
  float desvanece = 1.0 - smoothstep(0.2, 0.95, vFar);
  float contacto = 1.0 - 0.55 * exp(-abs(vFar) * 14.0);
  float trazo = linea * desvanece * contacto;
  vec3 col = vec3(u_lineas * trazo);

  // Reflejo de las tarjetas: solo dentro de las líneas, con caída hacia el fondo y hacia la cámara
  vec4 clip = u_reflMatriz * vec4(vMundo, 1.0);
  vec2 uvR = clip.xy / clip.w * 0.5 + 0.5;
  // Abanico radial desde la lámpara (x = −0,6·W): el reflejo se abre alejándose de ella
  uvR += (uvR - u_lampara) * REFL_ABANICO * 0.25 * clamp(abs(vFar), 0.0, 1.0);
  float caida = vFar > 0.0 ? exp(-vFar * 6.0) : exp(-abs(vFar) * 2.2);
  float borde = smoothstep(0.0, REFL_BORDE, uvR.x) * smoothstep(1.0, 1.0 - REFL_BORDE, uvR.x)
    * smoothstep(0.0, REFL_BORDE, uvR.y) * smoothstep(1.0, 1.0 - REFL_BORDE, uvR.y);
  vec3 refl = texture2D(u_refl, uvR).rgb;
  col += refl * trazo * REFL_FUERZA * caida * borde;

  gl_FragColor = vec4(col, u_alfa);
}
`;

export const PASE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const PASE_FRAGMENT = /* glsl */ `
uniform sampler2D tMundo;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tMundo, vUv);
}
`;
