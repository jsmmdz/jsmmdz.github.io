/**
 * La forma de un cristal (A2 y K4 de la ficha de Zero): una placa de vidrio irregular de 4 a 7 lados,
 * con las orillas astilladas, generada en código y sin modelos de Zero. Una semilla fija por cristal
 * decide la forma, así las capturas se repiten.
 *
 * La placa mide 1 de ancho (de −0,5 a 0,5 en x); el grosor es una fracción de ese ancho (de 1/10 a
 * 1/20, K4). La cara de adelante está partida en facetas planas con una inclinación casi nula: sus
 * normales casi no desplazan el fondo, pero entre faceta y faceta el gradiente de normales dibuja la red
 * de grietas que ilumina el brillo de arista. Las paredes de la orilla son las aristas que dan el grosor.
 * Es matemática pura: devuelve arreglos, el mundo WebGL los convierte en geometría.
 */
import { aleatorio } from './cristales';

export interface FormaCristal {
  /** Vértices de triángulos sin indexar (x, y, z) y su normal de cara (x, y, z), en unidades del ancho. */
  posiciones: Float32Array;
  normales: Float32Array;
  /** El contorno de la placa (x, y) en el sentido contrario a las agujas del reloj. */
  contorno: Float32Array;
  /** Alto de la placa (el ancho mide 1). */
  alto: number;
  /** Grosor de la placa (el ancho mide 1). */
  grosor: number;
  /** El rectángulo más grande que cabe dentro, centrado en `cx, cy`: ahí se imprime el texto. */
  areaTexto: { cx: number; cy: number; ancho: number; alto: number };
}

export interface OpcionesForma {
  /** Lados de la placa (4 a 7). Sin valor, lo decide la semilla. */
  lados?: number;
  /** Grosor relativo al ancho (de 1/20 a 1/10). Sin valor, lo decide la semilla (de 0,05 a 0,06: la pared delgada de Zero). */
  grosor?: number;
}

type P2 = [number, number];

/** Ancho medio de la franja de astillas de la orilla y cuánto se levanta su punto medio (unidades del ancho). */
const BANDA_ASTILLAS = 0.036;
const RELIEVE_ASTILLAS = 0.009;
/** Probabilidad de que un tramo fuera de las zonas de golpe lleve astillas. */
const SALPICADO_ASTILLAS = 0.15;
/** Cuánto se levanta (o se hunde) un vértice quebrado del anillo interior. */
const RELIEVE_GRIETA = 0.02;

/** ¿El punto está dentro del polígono? (regla par-impar) */
function dentro(contorno: P2[], x: number, y: number): boolean {
  let en = false;
  for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
    const [xi, yi] = contorno[i];
    const [xj, yj] = contorno[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) en = !en;
  }
  return en;
}

function normalDeTriangulo(a: number[], b: number[], c: number[]): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

export function formaCristal(semilla: number, opciones: OpcionesForma = {}): FormaCristal {
  const r = aleatorio(semilla);
  const lados = opciones.lados ?? 4 + Math.floor(r() * 4);
  const aspecto = 0.66 + 0.14 * r();
  const grosor = opciones.grosor ?? 0.05 + 0.01 * r();

  // Los vértices base: una elipse irregular (el ángulo y el radio de cada uno se descentran)
  const giro0 = r() * Math.PI * 2;
  const base: P2[] = [];
  for (let i = 0; i < lados; i++) {
    const ang = giro0 + ((i + (r() - 0.5) * 0.42) / lados) * Math.PI * 2;
    const rad = 0.8 + 0.2 * r();
    base.push([Math.cos(ang) * rad * 0.5, Math.sin(ang) * rad * 0.5 * aspecto]);
  }

  // Orillas astilladas: cada arista se parte en 3 a 5 tramos con el filo descentrado, y algunas
  // llevan una astilla más marcada
  const contorno: P2[] = [];
  const indiceBase: number[] = []; // en qué posición del contorno cae cada vértice base
  for (let i = 0; i < lados; i++) {
    const a = base[i];
    const b = base[(i + 1) % lados];
    indiceBase.push(contorno.length);
    contorno.push(a);
    const tramos = 3 + Math.floor(r() * 3);
    const largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (b[1] - a[1]) / (largo || 1);
    const ny = -(b[0] - a[0]) / (largo || 1);
    const astilla = Math.floor(r() * tramos) + 1;
    for (let j = 1; j < tramos; j++) {
      const t = (j + (r() - 0.5) * 0.5) / tramos;
      const desvio = (r() - 0.5) * 0.045 + (j === astilla && r() < 0.6 ? (r() - 0.5) * 0.11 : 0);
      contorno.push([a[0] + (b[0] - a[0]) * t + nx * desvio, a[1] + (b[1] - a[1]) * t + ny * desvio]);
    }
  }

  // Se centra y se escala para que el ancho sea exactamente 1
  const xs = contorno.map((p) => p[0]);
  const ys = contorno.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const esc = 1 / (x1 - x0);
  const cx0 = (x0 + x1) / 2;
  const cy0 = (y0 + y1) / 2;
  const c: P2[] = contorno.map(([x, y]) => [(x - cx0) * esc, (y - cy0) * esc]);
  const alto = (y1 - y0) * esc;

  // La cara de adelante, en facetas: el centro y un anillo interior (los vértices base a la mitad)
  // con un relieve mínimo; el contorno se queda en el plano para que las paredes cierren
  const zFrente = grosor / 2;
  const relieve = () => (r() - 0.5) * 0.012;
  const interior: number[][] = base.map((p) => [((p[0] * 0.5) - cx0 * 0.5) * esc, ((p[1] * 0.5) - cy0 * 0.5) * esc, zFrente + relieve()]);
  const centro = [0, 0, zFrente + relieve()];
  // Dos vértices del anillo quebrados: las uniones de sus facetas son las grietas largas que cruzan el cuerpo
  for (let q = 0; q < 2; q++) interior[Math.floor(r() * interior.length)][2] += (r() < 0.5 ? -1 : 1) * RELIEVE_GRIETA;
  const tri: number[][][] = [];
  const nBase = lados;
  const total = c.length;

  // La franja de astillas (Zero, pulido de T32): entre el contorno y un contorno interior, a 2 a 4 % del
  // ancho, la orilla se rompe en triángulos pequeños con inclinaciones fuertes. El brillo de arista dibuja
  // entre ellos la red de grietas y su refracción, con la dispersión, el arcoíris del filo.
  const cInt: number[][] = c.map(([x, y]) => {
    const l = Math.hypot(x, y) || 1;
    const banda = BANDA_ASTILLAS * (0.65 + 0.7 * r());
    return [x - (x / l) * banda, y - (y / l) * banda, zFrente + (r() - 0.5) * 0.004];
  });
  const astilla = () => (r() - 0.5) * 2 * RELIEVE_ASTILLAS;
  // Las astillas no van en toda la orilla (autor, 2026-10-02: «muy abundantes»): se juntan en 2 o 3 zonas
  // de golpe, de 1 a 2 tramos a cada lado, y salpican el resto con una probabilidad baja. Así la orilla
  // alterna tramos rotos y tramos limpios, como en Zero.
  const impactos = Array.from({ length: 2 + Math.floor(r() * 2) }, () => ({ i: Math.floor(r() * total), alcance: 1 + Math.floor(r() * 2) }));
  const conAstillas = Array.from({ length: total }, (_, i) =>
    impactos.some(({ i: k, alcance }) => Math.min(Math.abs(i - k), total - Math.abs(i - k)) <= alcance) || r() < SALPICADO_ASTILLAS,
  );
  for (let i = 0; i < total; i++) {
    const a = [...c[i], zFrente];
    const b = [...c[(i + 1) % total], zFrente];
    const ai = cInt[i];
    const bi = cInt[(i + 1) % total];
    if (!conAstillas[i]) {
      // Tramo limpio: la franja es plana y no dibuja grietas
      tri.push([a, b, bi], [a, bi, ai]);
      continue;
    }
    // Cada tramo se parte en 1 o 2 astillas. Los puntos de las dos orillas de la franja quedan sobre su
    // recta (cierran sin rendijas con la pared y con las facetas de adentro); solo el del medio se levanta
    const partes = 1 + Math.floor(r() * 2);
    const sobre = (p: number[], q: number[], t: number) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    const fuera: number[][] = [];
    const dentroB: number[][] = [];
    for (let j = 0; j <= partes; j++) {
      const t = j === 0 || j === partes ? j / partes : (j + (r() - 0.5) * 0.5) / partes;
      fuera.push(sobre(a, b, t));
      const p = sobre(ai, bi, t);
      dentroB.push(p);
    }
    for (let j = 0; j < partes; j++) {
      // Un punto en medio de la franja, fuera del plano: de él salen las cuatro astillas del tramo
      const m0 = sobre(fuera[j], fuera[j + 1], 0.5);
      const m1 = sobre(dentroB[j], dentroB[j + 1], 0.5);
      const q = sobre(m0, m1, 0.35 + 0.3 * r());
      q[2] = zFrente + astilla();
      tri.push([fuera[j], fuera[j + 1], q], [fuera[j + 1], dentroB[j + 1], q], [dentroB[j + 1], dentroB[j], q], [dentroB[j], fuera[j], q]);
    }
  }

  for (let i = 0; i < nBase; i++) {
    const desde = indiceBase[i];
    const hasta = i + 1 < nBase ? indiceBase[i + 1] : total;
    const ia = i;
    const ib = (i + 1) % nBase;
    const puntos: number[][] = [];
    for (let k = desde; k <= hasta; k++) puntos.push(cInt[k % total]);
    const tramos = puntos.length - 1;
    let cambio = -1;
    for (let j = 0; j < tramos; j++) {
      const usaA = (j + 0.5) / tramos < 0.5;
      tri.push([interior[usaA ? ia : ib], puntos[j], puntos[j + 1]]);
      if (usaA && (j + 1.5) / tramos >= 0.5) cambio = j + 1;
    }
    // El triángulo que une los dos vértices interiores con el punto donde cambia el apoyo
    tri.push([interior[ia], puntos[cambio < 0 ? 0 : cambio], interior[ib]]);
    tri.push([centro, interior[ia], interior[ib]]);
  }

  // Las paredes: un par de triángulos por cada tramo del contorno, con la normal hacia afuera
  const paredes: Array<{ t: number[][]; n: [number, number, number] }> = [];
  for (let i = 0; i < total; i++) {
    const [ax, ay] = c[i];
    const [bx, by] = c[(i + 1) % total];
    const ex = by - ay;
    const ey = -(bx - ax);
    const l = Math.hypot(ex, ey) || 1;
    // La normal sale hacia afuera: el contorno va en sentido horario o antihorario según la semilla
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const signo = ex * mx + ey * my >= 0 ? 1 : -1;
    const n: [number, number, number] = [(signo * ex) / l, (signo * ey) / l, 0];
    const a0 = [ax, ay, zFrente];
    const a1 = [ax, ay, -zFrente];
    const b0 = [bx, by, zFrente];
    const b1 = [bx, by, -zFrente];
    paredes.push({ t: [a0, a1, b0], n }, { t: [b0, a1, b1], n });
  }

  const posiciones = new Float32Array((tri.length + paredes.length) * 9);
  const normales = new Float32Array((tri.length + paredes.length) * 9);
  let o = 0;
  const poner = (t: number[][], n: [number, number, number]) => {
    for (const v of t) {
      posiciones[o] = v[0];
      posiciones[o + 1] = v[1];
      posiciones[o + 2] = v[2];
      normales[o] = n[0];
      normales[o + 1] = n[1];
      normales[o + 2] = n[2];
      o += 3;
    }
  };
  for (const t of tri) {
    const n = normalDeTriangulo(t[0], t[1], t[2]);
    // La cara de adelante mira siempre a +z
    poner(t, n[2] < 0 ? [-n[0], -n[1], -n[2]] : n);
  }
  for (const p of paredes) poner(p.t, p.n);

  // El rectángulo de texto: el más grande (varios aspectos) que cabe, con un margen, dentro de la franja de astillas
  const interiorPlano: P2[] = cInt.map((p) => [p[0], p[1]]);
  let mejor = { cx: 0, cy: 0, ancho: 0.4, alto: 0.25 };
  let areaMejor = 0;
  for (const asp of [1.25, 1.5, 1.75, 2.1]) {
    for (let ancho = 0.9; ancho > 0.3; ancho -= 0.02) {
      const h = ancho / asp;
      let encontrado = false;
      for (const dy of [0, -0.04, 0.04, -0.08, 0.08]) {
        for (const dx of [0, -0.04, 0.04]) {
          const m = 0.02;
          const esquinas: P2[] = [
            [dx - ancho / 2 - m, dy - h / 2 - m],
            [dx + ancho / 2 + m, dy - h / 2 - m],
            [dx + ancho / 2 + m, dy + h / 2 + m],
            [dx - ancho / 2 - m, dy + h / 2 + m],
          ];
          if (esquinas.every(([x, y]) => dentro(interiorPlano, x, y)) && ancho * h > areaMejor) {
            areaMejor = ancho * h;
            mejor = { cx: dx, cy: dy, ancho, alto: h };
            encontrado = true;
          }
        }
      }
      if (encontrado) break;
    }
  }

  const planos = new Float32Array(c.length * 2);
  c.forEach(([x, y], i) => {
    planos[i * 2] = x;
    planos[i * 2 + 1] = y;
  });
  return { posiciones, normales, contorno: planos, alto, grosor, areaTexto: mejor };
}
