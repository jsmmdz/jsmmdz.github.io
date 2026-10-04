/**
 * El estampado de la cinta de obra: franjas diagonales arriba y abajo y el texto en Unbounded 800, que se
 * repite. Es una máscara (blanco donde va el ámbar, negro donde va la tinta): el color lo pone el vidrio.
 * El texto se alterna de una cinta a otra (autor, 2026-10-04).
 */
import * as THREE from 'three';
import { ANCHO_CINTA } from './fisica';

export const TEXTOS = ['PRÓXIMAMENTE', 'EN CONSTRUCCIÓN', 'NO PASAR'] as const;

const ALTO_PX = 192;
// Las máscaras se comparten entre niveles y viven lo que vive la página (son tres, pequeñas)
const cache = new Map<string, THREE.CanvasTexture>();

/** Una textura vacía (todo ámbar) mientras carga la fuente. */
export const MASCARA_VACIA = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  t.userData.largo = 1;
  return t;
})();

let fuenteLista: Promise<void> | null = null;

function cargarFuente(): Promise<void> {
  if (!fuenteLista) {
    const tope = new Promise<void>((listo) => window.setTimeout(listo, 1500));
    fuenteLista = Promise.race([document.fonts.load('800 77px Unbounded').then(() => undefined), tope]).catch(() => undefined);
  }
  return fuenteLista;
}

/** La máscara del texto. `largo` (en `userData`) es cuánto mide una repetición, en unidades de la cinta. */
export async function estampado(texto: string, anisotropia: number): Promise<THREE.Texture> {
  const hecha = cache.get(texto);
  if (hecha) return hecha;
  await cargarFuente();
  const yaHecha = cache.get(texto);
  if (yaHecha) return yaHecha;

  const H = ALTO_PX;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return MASCARA_VACIA;
  const tam = Math.round(H * 0.4);
  const fuente = `800 ${tam}px Unbounded, sans-serif`;
  ctx.font = fuente;
  ctx.letterSpacing = `${0.04 * tam}px`;
  const tw = ctx.measureText(texto).width;
  const cap = ctx.measureText('H').actualBoundingBoxAscent;
  const esp = tam;
  const r = tam * 0.12;
  const W = Math.round(tw + 2 * esp + 2 * r);
  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  // Franjas diagonales arriba y abajo, con un periodo que cabe justo en la repetición
  const hb = H * 0.16;
  const nP = Math.max(1, Math.round(W / (H * 0.36)));
  const per = W / nP;
  const banda = (y0: number, y1: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, W, y1 - y0);
    ctx.clip();
    const alto = y1 - y0;
    for (let k = -2; k <= nP + 2; k++) {
      const x0 = k * per;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + per / 2, y0);
      ctx.lineTo(x0 + per / 2 - alto, y1);
      ctx.lineTo(x0 - alto, y1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
  banda(0, hb);
  banda(H - hb, H);
  ctx.font = fuente;
  ctx.letterSpacing = `${0.04 * tam}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(texto, esp / 2, H / 2 + cap / 2);
  ctx.beginPath();
  ctx.arc(tw + esp + r, H / 2, r, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = anisotropia;
  tex.userData.largo = (ANCHO_CINTA * W) / H;
  cache.set(texto, tex);
  return tex;
}
