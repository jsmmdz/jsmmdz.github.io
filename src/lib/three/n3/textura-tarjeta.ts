/**
 * Texturas 2D de las tarjetas del N3 (K15). El título y el disco con la flecha se dibujan en una
 * textura aparte de la portada y se mezclan encima en el shader: así se doblan con la cinta sin
 * necesitar texto MSDF, y el degradado de la mitad de abajo queda por debajo del texto.
 *
 * Los colores salen de los tokens CSS (nada de hex en el código): se leen una vez al montar.
 */

export interface ColoresN3 {
  /** Texto y flecha (token `--color-texto-claro`). */
  claro: string;
  /** Disco (token `--color-negro`). */
  negro: string;
  /** Fondo de las tarjetas «Próximamente» (token `--color-texto-oscuro`). */
  oscuro: string;
  /** Familia tipográfica del texto (token `--fuente-texto`). */
  fuente: string;
}

export function leerColoresN3(): ColoresN3 {
  const estilo = getComputedStyle(document.documentElement);
  const token = (nombre: string, respaldo: string) => estilo.getPropertyValue(nombre).trim() || respaldo;
  return {
    claro: token('--color-texto-claro', 'white'),
    negro: token('--color-negro', 'black'),
    oscuro: token('--color-texto-oscuro', 'black'),
    fuente: token('--fuente-texto', 'sans-serif'),
  };
}

export interface MedidasOverlay {
  /** Tamaño de la tarjeta en px CSS. */
  ancho: number;
  alto: number;
  /** 1 rem del N3 en px CSS. */
  rem: number;
  dpr: number;
}

function lienzo(ancho: number, alto: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ancho));
  canvas.height = Math.max(1, Math.round(alto));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sin contexto 2d');
  return { canvas, ctx };
}

function recortar(ctx: CanvasRenderingContext2D, texto: string, maximo: number): string {
  if (ctx.measureText(texto).width <= maximo) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > maximo) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

/**
 * Título abajo a la izquierda (1,8 rem, interletraje −0,05 em) y disco negro con flecha blanca abajo a
 * la derecha (2,5 rem); insets de 2 rem a los lados y 1 rem abajo. La tarjeta bloqueada lleva
 * «Próximamente» en el lugar del título y no lleva disco.
 */
export function dibujarOverlay(m: MedidasOverlay, colores: ColoresN3, titulo: string, bloqueada: boolean): HTMLCanvasElement {
  const { canvas, ctx } = lienzo(m.ancho * m.dpr, m.alto * m.dpr);
  const u = m.rem * m.dpr;
  const w = canvas.width;
  const h = canvas.height;
  const diametro = 2.5 * u;
  const cx = w - 2 * u - diametro / 2;
  const cy = h - 1 * u - diametro / 2;

  if (!bloqueada) {
    ctx.fillStyle = colores.negro;
    ctx.beginPath();
    ctx.arc(cx, cy, diametro / 2, 0, Math.PI * 2);
    ctx.fill();
    // Flecha hacia la derecha, trazada (sin depender de una fuente)
    ctx.strokeStyle = colores.claro;
    ctx.lineWidth = Math.max(1, 0.12 * u);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const r = diametro * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx + r * 0.25, cy - r * 0.75);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx + r * 0.25, cy + r * 0.75);
    ctx.stroke();
  }

  const tam = 1.8 * u;
  ctx.fillStyle = colores.claro;
  ctx.font = `600 ${tam}px ${colores.fuente}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.letterSpacing = `${-0.05 * tam}px`;
  const maximo = (bloqueada ? w - 4 * u : cx - diametro / 2 - 2 * u) - 2 * u;
  ctx.fillText(recortar(ctx, titulo, maximo), 2 * u, cy);
  return canvas;
}

/** Un lienzo de un solo color: el fondo de las tarjetas «Próximamente». */
export function dibujarFondo(color: string): HTMLCanvasElement {
  const { canvas, ctx } = lienzo(4, 4);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 4, 4);
  return canvas;
}
