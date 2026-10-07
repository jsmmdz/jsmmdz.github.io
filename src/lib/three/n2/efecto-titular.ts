/**
 * El efecto del titular del N2 (valores de Aikawa), extraído para que lo usen el N2 y el home (T36).
 *
 * Son dos cosas, ambas del ratón:
 * - el fluido (`FluidoN2`) desplaza las letras: `velocidad × 18·10⁻⁵`, recortado suave a 0,018;
 * - alrededor del cursor (256 px a 1440 de ancho, entre 80 y 360) el borde se desenfoca y toma un filo de
 *   arcoíris rojo, amarillo, cian y azul.
 *
 * Aquí viven las constantes y los dos trozos de GLSL. Este módulo no importa three, así que no pesa nada
 * en el JS inicial. Quien incluya `GLSL_EFECTO_TITULAR` tiene que declarar antes `float alfa(vec2 uv)` (la
 * cobertura de las letras, de 0 a 1) y los uniformes que pasa como argumentos.
 *
 * Los colores del filo son una excepción a la paleta (`docs/1-PRODUCTO.md` § 6, el reflejo del N2).
 */

export const ESCALA_FLUIDO = 18e-5;
export const TOPE_FLUIDO = 0.018;
export const RADIO = 256;
export const RADIO_ANCHO_BASE = 1440;
export const RADIO_MIN = 80;
export const RADIO_MAX = 360;
const SUAVIDAD = 0.86;
const CROMA_FUERZA = 3.4;
const CROMA_SEPARACION = 0.86;
const CROMA_DESENFOQUE = 1.45;
const DESENFOQUE_FUERZA = 2.75;
const DESENFOQUE_SEPARACION = 3;

/** El radio del efecto en px CSS para un ancho de pantalla: 256 a 1440, entre 80 y 360. */
export function radioDelEfecto(ancho: number): number {
  return Math.min(RADIO_MAX, Math.max(RADIO_MIN, RADIO * (ancho / RADIO_ANCHO_BASE)));
}

export const GLSL_EFECTO_TITULAR = /* glsl */ `
  const vec3 ROJO = vec3(1.0, 0.180, 0.267);
  const vec3 AMARILLO = vec3(1.0, 0.988, 0.416);
  const vec3 CIAN = vec3(0.404, 1.0, 0.922);
  const vec3 AZUL = vec3(0.310, 0.486, 1.0);

  // Desenfoque de 9 muestras con los pesos de un núcleo gaussiano pequeño
  float alfaSuave(vec2 uv, vec2 texel, float px) {
    vec2 d = texel * max(px, 0.0);
    float a = alfa(uv) * 0.18;
    a += (alfa(uv + vec2(d.x, 0.0)) + alfa(uv - vec2(d.x, 0.0)) + alfa(uv + vec2(0.0, d.y)) + alfa(uv - vec2(0.0, d.y))) * 0.105;
    a += (alfa(uv + d) + alfa(uv - d) + alfa(uv + vec2(d.x, -d.y)) + alfa(uv + vec2(-d.x, d.y))) * 0.095;
    return clamp(a, 0.0, 1.0);
  }

  // De dónde se lee el texto una vez que el fluido lo desplazó. \`fluido\` es la textura de velocidad.
  vec2 fuenteDesplazada(sampler2D fluido, vec2 uv) {
    vec2 bruto = texture2D(fluido, uv).xy * ${ESCALA_FLUIDO.toExponential()};
    float largo = length(bruto);
    float tope = ${TOPE_FLUIDO.toFixed(4)};
    float suave = tope * (1.0 - exp(-largo / tope));
    vec2 corrimiento = largo > 1e-6 ? bruto * (suave / largo) : vec2(0.0);
    float mezcla = smoothstep(0.00075, 0.009, length(corrimiento));
    return uv - corrimiento * mezcla;
  }

  // El borde alrededor del cursor: desenfoque y filo de arcoíris. \`color\` y \`a\` entran con el texto sin
  // efecto y salen con él. \`frag\` y \`puntero\` van en px del lienzo (con DPR), y hacia arriba.
  void aplicarFiloArcoiris(vec2 uv, vec2 fuente, float base, vec2 resolucion, vec2 puntero, float radio, float dpr, inout vec3 color, inout float a) {
    vec2 texel = 1.0 / resolucion;
    vec2 frag = uv * resolucion;
    float interior = radio * (1.0 - ${SUAVIDAD.toFixed(2)});
    float distancia = distance(frag, puntero);
    float mascara = 1.0 - smoothstep(interior, radio, distancia);
    if (mascara > 0.0001) {
      vec2 dir = distancia > 0.001 ? (frag - puntero) / distancia : vec2(1.0, 0.0);
      vec2 tangente = vec2(-dir.y, dir.x);
      float desenfoque = mascara * (0.35 + ${DESENFOQUE_SEPARACION.toFixed(2)} * 1.05 + ${DESENFOQUE_FUERZA.toFixed(2)} * 0.52) * dpr;
      float suaveA = alfaSuave(fuente, texel, desenfoque);
      float borde = smoothstep(0.025, 0.45, suaveA) * (1.0 - smoothstep(0.56, 0.96, base));
      float cromaPx = mascara * ${CROMA_SEPARACION.toFixed(2)} * (1.2 + ${CROMA_DESENFOQUE.toFixed(2)} * 1.35 + ${DESENFOQUE_FUERZA.toFixed(2)} * 0.42) * ${CROMA_FUERZA.toFixed(2)} * dpr;
      vec2 croma = (dir + tangente * 0.08) * texel * cromaPx;
      float desenfoqueCroma = desenfoque * 0.62 + ${CROMA_DESENFOQUE.toFixed(2)} * 0.7 * dpr;
      float calidoA = alfaSuave(fuente + croma, texel, desenfoqueCroma);
      float frioA = alfaSuave(fuente - croma, texel, desenfoqueCroma);
      float amarilloA = alfa(fuente + croma * 0.42);
      float cianA = alfa(fuente - croma * 0.42);
      vec3 calido = mix(AMARILLO, ROJO, 0.42);
      vec3 frio = mix(CIAN, AZUL, 0.32);
      float pesoCalido = max(calidoA - base * 0.25, 0.0) + amarilloA * borde * 0.25;
      float pesoFrio = max(frioA - base * 0.25, 0.0) + cianA * borde * 0.25;
      vec3 filo = (calido * pesoCalido + frio * pesoFrio) / max(pesoCalido + pesoFrio, 0.001);
      float mezclaFilo = clamp((pesoCalido + pesoFrio + borde * 0.22) * mascara * ${CROMA_FUERZA.toFixed(2)} * 0.45, 0.0, 1.0);
      float nucleo = smoothstep(0.62, 0.98, base);
      color = mix(color, filo, mezclaFilo * (1.0 - nucleo * 0.74));
      a = clamp(max(base, mezclaFilo * 0.18 * (calidoA + frioA) + borde * mascara * 0.06), 0.0, 1.0);
    }
  }
`;
