/**
 * Los pasos de la tinta del home (T33): una simulación de fluidos estable (advección, divergencia,
 * presión, gradiente) y la mezcla final. La técnica es la de noth.in (ficha K1), reimplementada.
 * Son solo cadenas de GLSL: este módulo no importa three, así que pesa casi nada.
 */

export const VERTICE = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Una salpicadura gaussiana: suma `uColor` alrededor de `uPunto` (x corregida por el aspecto). */
export const SALPICAR = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDestino;
uniform float uAspecto;
uniform vec2 uPunto;
uniform vec3 uColor;
uniform float uRadio;
void main() {
  vec2 d = vUv - uPunto;
  d.x *= uAspecto;
  vec3 aporte = exp(-dot(d, d) / uRadio) * uColor;
  gl_FragColor = vec4(texture2D(uDestino, vUv).xyz + aporte, 1.0);
}`;

/** Advección semilagrangiana. `uDt` es el paso normalizado (1 = un cuadro a 60 Hz). */
export const ADVECTAR = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocidad;
uniform sampler2D uFuente;
uniform vec2 uTexel;
uniform float uDisipacion;
uniform float uDt;
void main() {
  vec2 atras = vUv - uDt * texture2D(uVelocidad, vUv).xy * uTexel;
  gl_FragColor = uDisipacion * texture2D(uFuente, atras);
}`;

export const DIVERGENCIA = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocidad;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uVelocidad, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVelocidad, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVelocidad, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture2D(uVelocidad, vUv + vec2(0.0, uTexel.y)).y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

/** Una iteración de Jacobi para la presión. */
export const PRESION = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPresion;
uniform sampler2D uDivergencia;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uPresion, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPresion, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPresion, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPresion, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4((L + R + B + T - texture2D(uDivergencia, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`;

/** Resta el gradiente de la presión a la velocidad: el campo queda sin divergencia. */
export const GRADIENTE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPresion;
uniform sampler2D uVelocidad;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uPresion, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPresion, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPresion, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPresion, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture2D(uVelocidad, vUv).xy - 0.5 * vec2(R - L, T - B);
  gl_FragColor = vec4(v, 0.0, 1.0);
}`;

/**
 * Reduce la tinta a una cuadrícula chica: cada texel de salida mira un bloque de 8 × 8 de la tinta y
 * vale 1 si algún punto del bloque todavía se vería (tinta × tamaño ≥ borde). Es lo que permite
 * dormir la simulación sin dejar una mancha congelada: se lee de vuelta una vez cada medio segundo.
 */
export const REDUCIR = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTinta;
uniform float uTexel;
uniform float uTamano;
uniform float uBordeSuave;
void main() {
  float maximo = 0.0;
  for (int j = 0; j < 8; j++) {
    for (int i = 0; i < 8; i++) {
      vec2 desde = floor(vUv / (8.0 * uTexel)) * 8.0 * uTexel;
      maximo = max(maximo, texture2D(uTinta, desde + (vec2(float(i), float(j)) + 0.5) * uTexel).r);
    }
  }
  float visible = step(uBordeSuave * 0.9, maximo * uTamano);
  gl_FragColor = vec4(visible, visible, visible, 1.0);
}`;

/**
 * La mezcla final, de borde duro. `uBase` es la cobertura del titular (blanco sobre negro, canal R):
 * con ella y el lavado se compone la capa de abajo (fondo + titular). Dentro de la tinta se ve la capa
 * revelada: el video de materiales ajustado al ancho y centrado en alto (K2), negro fuera de él.
 * Los colores llegan como uniformes ya en el espacio de la pantalla: no hay conversión de color.
 */
export const MEZCLA = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uRevelado;
uniform sampler2D uTinta;
uniform vec3 uFondo;
uniform vec3 uFondoLavado;
uniform vec3 uTexto;
uniform float uLavado;
uniform float uTieneVideo;
uniform float uAspectoVideo;
uniform float uAspectoPlano;
uniform float uTamano;
uniform float uBordeSuave;
uniform float uAnchoBorde;
void main() {
  float tinta = texture2D(uTinta, vUv).r * uTamano;
  float mascara = smoothstep(uBordeSuave, uBordeSuave + uAnchoBorde, tinta);

  vec3 fondo = mix(uFondo, uFondoLavado, uLavado);
  vec3 base = mix(fondo, uTexto, texture2D(uBase, vUv).r);

  // El video ocupa todo el ancho; su alto es ancho / aspecto, y se centra. v = 0,5 + (y - 0,5) / f,
  // con f = aspectoPlano / aspectoVideo la fracción de alto que ocupa.
  float v = (vUv.y - 0.5) * (uAspectoVideo / uAspectoPlano) + 0.5;
  float dentro = step(0.0, v) * step(v, 1.0) * step(0.5, uTieneVideo);
  vec3 revelado = texture2D(uRevelado, vec2(vUv.x, clamp(v, 0.0, 1.0))).rgb * dentro;

  gl_FragColor = vec4(mix(base, revelado, mascara), 1.0);
}`;
