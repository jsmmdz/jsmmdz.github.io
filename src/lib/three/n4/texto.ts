/**
 * El texto impreso en el cristal (K5, decisión del autor): una textura de canvas 2D con el `destacado`
 * (Unbounded 800, grande, como la cifra de Zero) y el `texto` (Space Grotesk), en crema. La textura se
 * dibuja una vez por caso con las fuentes ya cargadas y se libera al salir.
 *
 * El tamaño exacto del texto en el cristal es del pulido: aquí se ajusta solo para que quepa, primero el
 * destacado y luego el texto lo más grande que entre.
 */
import type { PasoVista } from '@/lib/n4/historia';

/** Un rectángulo dentro de la textura, en fracciones de su ancho y de su alto (y medido desde arriba). */
export interface RectTextura {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** El texto de un cristal ya dibujado y, si el paso trae video, dónde quedó la línea «Ver completo ↗». */
export interface TextoDibujado {
  lienzo: HTMLCanvasElement;
  enlace: RectTextura | null;
}

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
export function dibujarTextoCristal(paso: PasoVista, proporcion: number, color: string, rotulo?: string): TextoDibujado {
  const W = ANCHO_TEXTURA;
  const H = Math.round(W / proporcion);
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return { lienzo, enlace: null };
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const margen = 0.03 * W;
  const util = W - 2 * margen;

  // El rótulo: Space Grotesk en mayúsculas con aire entre letras, del tamaño de una línea pequeña
  const fsR = rotulo ? Math.min(0.1 * H, 0.05 * W) : 0;
  const altoRotulo = rotulo ? fsR * 1.9 : 0;

  // «Ver completo ↗» (T38): una línea al pie del cristal cuando el paso trae el enlace a su video completo
  const fsE = paso.video ? Math.min(0.075 * H, 0.05 * W) : 0;
  const altoEnlace = paso.video ? fsE * 2.2 : 0;

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
    const libre = H - 2 * margen - altoRotulo - altoEnlace - (fsD ? fsD * 1.15 : 0);
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
  let y = Math.max(margen, (H - altoEnlace - altoBloque) / 2);
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
  // Dónde queda la línea sale de aquí, de lo que se dibujó: el mundo la proyecta a la ventana para poner el enlace
  const caja = paso.video ? dibujarVerCompleto(ctx, fsE, margen, H - margen - fsE * 0.35) : null;
  return { lienzo, enlace: caja ? { x: caja.x / W, y: caja.y / H, ancho: caja.ancho / W, alto: caja.alto / H } : null };
}

/**
 * «Ver completo» subrayado y una flecha ↗ trazada a mano (la fuente del texto no trae el glifo), con su base en
 * (x, y). Devuelve la caja que cubre texto, subrayado y flecha, en px de la textura.
 */
function dibujarVerCompleto(ctx: CanvasRenderingContext2D, fs: number, x: number, y: number): { x: number; y: number; ancho: number; alto: number } {
  ctx.font = `600 ${fs}px ${FUENTE_TEXTO}`;
  ctx.fillText('Ver completo', x, y);
  const medida = ctx.measureText('Ver completo');
  const ancho = medida.width;
  ctx.lineWidth = Math.max(2, fs * 0.07);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.moveTo(x, y + fs * 0.18);
  ctx.lineTo(x + ancho, y + fs * 0.18);
  ctx.stroke();
  // La flecha: una diagonal hacia arriba y a la derecha con su punta
  const ax = x + ancho + fs * 0.4;
  const lado = fs * 0.6;
  const base = y - fs * 0.05;
  ctx.beginPath();
  ctx.moveTo(ax, base);
  ctx.lineTo(ax + lado, base - lado);
  ctx.moveTo(ax + lado * 0.1, base - lado);
  ctx.lineTo(ax + lado, base - lado);
  ctx.lineTo(ax + lado, base - lado * 0.1);
  ctx.stroke();
  // La caja: de la flecha (arriba) o de las mayúsculas al subrayado o los rabos de las letras (abajo)
  const medio = ctx.lineWidth / 2;
  const arriba = y - Math.max(medida.actualBoundingBoxAscent, y - (base - lado)) - medio;
  const abajo = y + Math.max(medida.actualBoundingBoxDescent, fs * 0.18) + medio;
  const izquierda = x - medio;
  const derecha = ax + lado + medio;
  return { x: izquierda, y: arriba, ancho: derecha - izquierda, alto: abajo - arriba };
}

/** Una fuente del design system del caso: `familia` es la de su `@font-face` (ver `design-system.ts`). */
export interface FuenteDS {
  familia: string;
  nombre: string;
  uso: string;
}

/**
 * El cristal de las tipografías del design system (autor, 2026-10-02): el rótulo «TIPOGRAFÍA» arriba y, por
 * cada fuente, una fila con «Aa» grande y su nombre escritos en esa fuente, y su uso debajo en Space
 * Grotesk. Las filas se reparten el alto; todo cabe a lo ancho.
 */
export function dibujarFuentes(fuentes: FuenteDS[], proporcion: number, color: string): HTMLCanvasElement {
  const W = ANCHO_TEXTURA;
  const H = Math.round(W / proporcion);
  const lienzo = document.createElement('canvas');
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext('2d');
  if (!ctx || fuentes.length === 0) return lienzo;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const margen = 0.03 * W;

  // El rótulo, como el de los pasos
  const fsR = Math.min(0.085 * H, 0.05 * W);
  ctx.font = `600 ${fsR}px ${FUENTE_TEXTO}`;
  ctx.letterSpacing = `${(0.12 * fsR).toFixed(1)}px`;
  ctx.globalAlpha = 0.85;
  ctx.fillText('TIPOGRAFÍA', margen, margen + fsR);
  ctx.globalAlpha = 1;
  ctx.letterSpacing = '0px';

  // Las filas: «Aa» a la izquierda y, a su derecha, el nombre (en su fuente) y el uso
  const arriba = margen + fsR * 2.2;
  const fila = (H - arriba - margen) / fuentes.length;
  fuentes.forEach((f, i) => {
    const y0 = arriba + i * fila;
    const familia = `"${f.familia}", ${FUENTE_TEXTO}`;
    const fsA = Math.min(0.92 * fila, 0.3 * W);
    ctx.font = `${fsA}px ${familia}`;
    const anchoA = ctx.measureText('Aa').width;
    const xTexto = margen + anchoA + 0.04 * W;
    const libre = W - margen - xTexto;
    // El nombre, lo más grande que quepa en lo que deja «Aa», sin pasar de 0,32 de la fila
    let fsN = 0.42 * fila;
    ctx.font = `${fsN}px ${familia}`;
    const anchoN = ctx.measureText(f.nombre).width;
    if (anchoN > libre) fsN *= libre / anchoN;
    const fsU = Math.min(0.2 * fila, 0.05 * W);
    ctx.font = `${fsA}px ${familia}`;
    const base = y0 + fila * 0.5 + fsA * 0.36;
    ctx.fillText('Aa', margen, base);
    ctx.font = `${fsN}px ${familia}`;
    ctx.fillText(f.nombre, xTexto, y0 + fila * 0.5);
    ctx.font = `500 ${fsU}px ${FUENTE_TEXTO}`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(f.uso, xTexto, y0 + fila * 0.5 + fsU * 1.6);
    ctx.globalAlpha = 1;
  });
  return lienzo;
}
