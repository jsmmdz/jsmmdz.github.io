/**
 * geometria.ts — Cálculo geométrico de sectores del anillo SVG para N0Preloader.
 * Genera arcos polares para cada disciplina en el anillo calcado de Aikawa.
 */

export interface SectorArco {
  slug: string;
  nombre: string;
  acento: string;
  texturaSrc: string;
  d: string;
}

/**
 * Convierte grados a radianes.
 */
function degARad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Construye la descripción de camino SVG (path data) para un sector de corona circular.
 */
export function calcularSectorCorona(
  cx: number,
  cy: number,
  rInt: number,
  rExt: number,
  anguloInicioDeg: number,
  anguloFinDeg: number
): string {
  const radInicio = degARad(anguloInicioDeg);
  const radFin = degARad(anguloFinDeg);

  const x1 = cx + rExt * Math.cos(radInicio);
  const y1 = cy + rExt * Math.sin(radInicio);
  const x2 = cx + rExt * Math.cos(radFin);
  const y2 = cy + rExt * Math.sin(radFin);

  const x3 = cx + rInt * Math.cos(radFin);
  const y3 = cy + rInt * Math.sin(radFin);
  const x4 = cx + rInt * Math.cos(radInicio);
  const y4 = cy + rInt * Math.sin(radInicio);

  const arcoGrande = anguloFinDeg - anguloInicioDeg > 180 ? 1 : 0;

  return [
    `M ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `A ${rExt} ${rExt} 0 ${arcoGrande} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`,
    `L ${x3.toFixed(3)} ${y3.toFixed(3)}`,
    `A ${rInt} ${rInt} 0 ${arcoGrande} 0 ${x4.toFixed(3)} ${y4.toFixed(3)}`,
    'Z'
  ].join(' ');
}
