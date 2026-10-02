/**
 * El texto impreso en el cristal (K5, decisión del autor): una textura de canvas 2D con el `destacado`
 * (Unbounded 800, grande, como la cifra de Zero) y el `texto` (Space Grotesk), en crema. La textura se
 * dibuja una vez por caso con las fuentes ya cargadas y se libera al salir.
 *
 * El tamaño exacto del texto en el cristal es del pulido: aquí se ajusta solo para que quepa, primero el
 * destacado y luego el texto lo más grande que entre.
 */
import type { PasoVista } from '@/lib/n4/historia';

/** Ancho de la textura (px): el alto sale de la proporción del área de texto del cristal. */
const ANCHO_TEXTURA = 1024;
// Toda espera tiene salida: sin las fuentes a tiempo se dibuja con las de respaldo
const ESPERA_FUENTES_MS = 1500;

const FUENTE_DISPLAY = 'Unbounded, "Unbounded Fallback", sans-serif';
const FUENTE_TEXTO = '"Space Grotesk", "Space Grotesk Fallback", sans-serif';

/** Espera (con tope) a que las dos fuentes del texto estén cargadas. */
export async function fuentesDelTextoListas(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 100px Unbounded'), document.fonts.load('600 40px "Space Grotesk"')]),
      new Promise<void>((listo) => window.setTimeout(listo, ESPERA_FUENTES_MS)),
    ]);
  } catch {
    // sin las fuentes se dibuja con las de respaldo
  }
}

function envolver(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && ctx.measureText(prueba).width > ancho) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Dibuja el texto de un paso en un canvas de proporción `proporcion` (ancho / alto del área de texto).
 * `color` es el crema del token de texto claro. `rotulo` es el tipo del paso («PROBLEMA», «ROL Y APORTE»…):
 * va arriba, pequeño y en mayúsculas, para que se sepa qué parte de la historia cuenta cada cristal
 * (autor, 2026-10-02).
 */
export function dibujarTextoCristal(paso: PasoVista, proporcion: number, color: string, rotulo?: string): HTMLCanvasElement {
  const W = ANCHO_TEXTURA;
  const H = Math.round(W / proporcion);
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return lienzo;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const margen = 0.03 * W;
  const util = W - 2 * margen;

  // El rótulo: Space Grotesk en mayúsculas con aire entre letras, del tamaño de una línea pequeña
  const fsR = rotulo ? Math.min(0.1 * H, 0.05 * W) : 0;
  const altoRotulo = rotulo ? fsR * 1.9 : 0;

  // La cifra grande: lo mayor que quepa de ancho, sin pasar de 0,3 del alto
  let fsD = 0;
  if (paso.destacado) {
    fsD = 0.3 * H;
    ctx.font = `800 ${fsD}px ${FUENTE_DISPLAY}`;
    const ancho = ctx.measureText(paso.destacado).width;
    if (ancho > util) fsD *= util / ancho;
  }

  // El texto: lo más grande que quepa en lo que deja la cifra; si no cabe, la cifra cede un poco
  const alturaLinea = 1.22;
  let fsT = 0.07 * H;
  let lineas: string[] = [];
  for (let intento = 0; intento < 6; intento++) {
    const libre = H - 2 * margen - altoRotulo - (fsD ? fsD * 1.15 : 0);
    const maximo = paso.destacado ? 0.14 * H : 0.2 * H;
    let encontrado = false;
    for (let f = maximo; f >= 0.07 * H; f -= 0.004 * H) {
      ctx.font = `600 ${f}px ${FUENTE_TEXTO}`;
      const l = envolver(ctx, paso.texto, util);
      if (l.length * f * alturaLinea <= libre) {
        fsT = f;
        lineas = l;
        encontrado = true;
        break;
      }
    }
    if (encontrado || !fsD) break;
    fsD *= 0.82;
  }
  if (lineas.length === 0) {
    ctx.font = `600 ${fsT}px ${FUENTE_TEXTO}`;
    lineas = envolver(ctx, paso.texto, util);
  }

  // El bloque va centrado en vertical dentro del área
  const altoBloque = altoRotulo + (fsD ? fsD * 1.15 : 0) + lineas.length * fsT * alturaLinea;
  let y = Math.max(margen, (H - altoBloque) / 2);
  if (rotulo) {
    ctx.font = `600 ${fsR}px ${FUENTE_TEXTO}`;
    ctx.letterSpacing = `${(0.12 * fsR).toFixed(1)}px`;
    ctx.globalAlpha = 0.85;
    y += fsR;
    ctx.fillText(rotulo.toUpperCase(), margen, y);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
    y += fsR * 0.9;
  }
  if (paso.destacado) {
    ctx.font = `800 ${fsD}px ${FUENTE_DISPLAY}`;
    y += fsD * 0.9;
    ctx.fillText(paso.destacado, margen, y);
    y += fsD * 0.25;
  }
  ctx.font = `600 ${fsT}px ${FUENTE_TEXTO}`;
  for (const l of lineas) {
    y += fsT * 0.95;
    ctx.fillText(l, margen, y);
    y += fsT * (alturaLinea - 0.95);
  }
  return lienzo;
}
