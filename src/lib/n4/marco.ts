/**
 * El marco de cristal de la foto (autor, 2026-10-02: «marco astillado, lo más rectangular posible»; después:
 * «que no sea un rectángulo sin más: astilla los bordes hacia dentro sin afectar de más la visibilidad»). Un
 * anillo de vidrio alrededor del rectángulo de la foto, del mismo material que los cristales de la historia.
 * Las dos orillas son irregulares y dentadas, con dientes grandes (un punto cada ≈ 46 px): la de adentro
 * se mete sobre la foto en zigzag (≤ 1 ancho del marco) y, en 6 a 9 zonas de golpe (dos o tres en esquinas,
 * que quedan cortadas en diagonal), hasta ≈ 2,6; la de afuera también se astilla. La cara está tallada en
 * planos grandes, no en un polvo de astillas («exagera la geometría»). La cara de adelante baja en bisel hacia afuera: así sus normales se
 * inclinan, refracta lo de detrás y el brillo de arista dibuja el filo.
 *
 * Todo va en px, con el centro de la foto en el origen (y hacia arriba): el mundo lo escala a sus unidades.
 * Es matemática pura: devuelve arreglos, el mundo WebGL los convierte en geometría.
 */
import { aleatorio } from './cristales';

export interface FormaMarco {
  /** Vértices de triángulos sin indexar (x, y, z) y su normal de cara (x, y, z), en px. */
  posiciones: Float32Array;
  normales: Float32Array;
}

/** Cuánto baja el bisel de la cara, en fracciones del ancho del marco: inclina las normales ≈ 20°. */
const BISEL = 0.38;
/** Grosor del vidrio, en fracciones del ancho del marco. */
const GROSOR = 0.2;
/** Separación entre puntos de la orilla de afuera, en px. */
const ENTRE_PUNTOS = 46;
/** Desvío de la orilla recta y de las astillas, en fracciones del ancho del marco. */
const DESVIO_RECTO = 0.7;
const DESVIO_ASTILLA = 1.3;
/**
 * La orilla de afuera nunca entra en la foto: queda al menos esta fracción del ancho del marco por fuera del
 * rectángulo (T38, E2 de la auditoría r3: en el marco 9:16 una esquina de golpe se metía y asomaba la foto).
 */
const FUERA_MIN = 0.3;
/** Cuánto entra la orilla de adentro sobre la foto, en fracciones del ancho del marco: poco en general y más en las zonas de golpe. */
const ENTRA_RECTO = 1.0;
const ENTRA_ASTILLA = 2.6;
/** Cuánto se levanta el punto medio de una astilla, en fracciones del ancho del marco. */
const RELIEVE_ASTILLA = 0.6;
/** Altura de la cresta de cada tramo (la arista que separa sus dos planos), en fracciones del ancho del marco. */
const CRESTA = 0.6;

type P3 = [number, number, number];

function normal(a: P3, b: P3, c: P3): P3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: P3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/**
 * El marco de una foto de `ancho` × `alto` px, con `margen` px de vidrio alrededor. `semilla` fija las
 * astillas: el marco es el mismo en cada carga.
 */
export function formaMarco(ancho: number, alto: number, margen: number, semilla = 4242): FormaMarco {
  const r = aleatorio(semilla);
  const w = ancho / 2;
  const h = alto / 2;
  const perimetro = 4 * (w + h);
  const n = Math.max(16, Math.round(perimetro / ENTRE_PUNTOS));

  // Un punto del rectángulo interior a la fracción t del perímetro (desde la esquina de arriba a la
  // izquierda, en el sentido de las agujas del reloj) y su dirección hacia afuera
  const enRect = (t: number, ww: number, hh: number): { p: [number, number]; afuera: [number, number] } => {
    const lados = [2 * ww, 2 * hh, 2 * ww, 2 * hh];
    let d = (((t % 1) + 1) % 1) * 2 * (lados[0] + lados[1]);
    if (d < lados[0]) return { p: [-ww + d, hh], afuera: [0, 1] };
    d -= lados[0];
    if (d < lados[1]) return { p: [ww, hh - d], afuera: [1, 0] };
    d -= lados[1];
    if (d < lados[2]) return { p: [ww - d, -hh], afuera: [0, -1] };
    d -= lados[2];
    return { p: [-ww, -hh + d], afuera: [-1, 0] };
  };

  // Las fracciones de muestreo: parejas y, además, las cuatro esquinas exactas (el interior calza con la foto)
  const esquinas = [0, w / (2 * (w + h)), 0.5, 0.5 + w / (2 * (w + h))];
  const ts = Array.from({ length: n }, (_, i) => i / n);
  for (const e of esquinas) if (!ts.some((t) => Math.abs(t - e) < 1e-6)) ts.push(e);
  ts.sort((a, b) => a - b);
  const total = ts.length;

  // Zonas de golpe: 4 a 6, cada una de 2 a 4 tramos (dos de ellas en esquinas); ahí las dos orillas se astillan
  const indiceEsquina = esquinas.map((e) => ts.findIndex((t) => Math.abs(t - e) < 1e-6));
  const golpes = [
    ...Array.from({ length: 2 + Math.floor(r() * 2) }, () => ({ i: indiceEsquina[Math.floor(r() * 4)], alcance: 3 + Math.floor(r() * 3) })),
    ...Array.from({ length: 4 + Math.floor(r() * 3) }, () => ({ i: Math.floor(r() * total), alcance: 2 + Math.floor(r() * 4) })),
  ];
  const astillado = (i: number) =>
    golpes.reduce((m, g) => {
      const d = Math.min(Math.abs(i - g.i), total - Math.abs(i - g.i));
      return Math.max(m, d <= g.alcance ? 1 - d / (g.alcance + 1) : 0);
    }, 0);

  const zFrente = (GROSOR * margen) / 2;
  const zOrilla = zFrente - BISEL * margen;
  const interior: P3[] = [];
  const exterior: P3[] = [];
  const fuerza: number[] = [];
  ts.forEach((t, i) => {
    const { p, afuera } = enRect(t, w, h);
    const a = astillado(i);
    fuerza.push(a);
    const esEsquina = esquinas.some((e) => Math.abs(t - e) < 1e-6);
    // La orilla de adentro se mete sobre la foto: poco en general, más en las zonas de golpe. En una esquina
    // entra en diagonal (la astilla se come la punta del rectángulo)
    // En zigzag: un punto entra más y el siguiente menos, así la orilla queda dentada como vidrio roto
    const diente = i % 2 === 0 ? 1 : 0.35;
    const entra = margen * (ENTRA_RECTO * r() * diente + a * ENTRA_ASTILLA * (0.4 + 0.6 * r()) * (0.6 + 0.4 * diente));
    const haciaDentro: [number, number] = esEsquina ? [-Math.sign(p[0]) * 0.7071, -Math.sign(p[1]) * 0.7071] : [-afuera[0], -afuera[1]];
    interior.push([p[0] + haciaDentro[0] * entra, p[1] + haciaDentro[1] * entra, zFrente]);
    // La orilla de afuera: el rectángulo grande, irregular; en las zonas de golpe se mete o se sale más
    const libre = esEsquina ? -a * margen * DESVIO_ASTILLA : (r() - 0.5) * 2 * margen * (DESVIO_RECTO + a * DESVIO_ASTILLA);
    const desvio = Math.max(libre, -(1 - FUERA_MIN) * margen);
    const q = enRect(t, w + margen, h + margen).p;
    exterior.push([q[0] + afuera[0] * desvio, q[1] + afuera[1] * desvio, zOrilla]);
  });

  // La cara de adelante, tallada en planos grandes («exagera la geometría»): cada punto tiene una cresta a
  // media franja, más alta o más baja según el punto (más en las zonas de golpe). Cada tramo son cuatro
  // triángulos, dos a cada lado de la arista entre crestas: planos grandes con inclinaciones marcadas, que
  // el brillo de arista dibuja como vidrio tallado y no como un polvo de astillas
  const crestas: P3[] = interior.map((a, i) => {
    const d = exterior[i];
    const t = 0.4 + 0.2 * r();
    const alto = (r() < 0.5 ? -0.35 : 1) * (0.4 + 0.6 * r()) * CRESTA * margen * (1 + RELIEVE_ASTILLA * fuerza[i]);
    return [a[0] + (d[0] - a[0]) * t, a[1] + (d[1] - a[1]) * t, (a[2] + d[2]) / 2 + alto];
  });
  const tri: P3[][] = [];
  for (let i = 0; i < total; i++) {
    const j = (i + 1) % total;
    const a = interior[i];
    const b = interior[j];
    const c = exterior[j];
    const d = exterior[i];
    const ci = crestas[i];
    const cj = crestas[j];
    tri.push([a, b, cj], [a, cj, ci], [ci, cj, c], [ci, c, d]);
  }

  // Las paredes: por fuera (la orilla astillada) y por dentro (el filo que toca la foto), hasta la cara de atrás
  const zAtras = -zFrente;
  const pared = (p: P3, q: P3): P3[][] => [
    [p, [p[0], p[1], zAtras], q],
    [q, [p[0], p[1], zAtras], [q[0], q[1], zAtras]],
  ];
  for (let i = 0; i < total; i++) {
    const j = (i + 1) % total;
    tri.push(...pared(exterior[i], exterior[j]), ...pared(interior[j], interior[i]));
  }

  const posiciones = new Float32Array(tri.length * 9);
  const normales = new Float32Array(tri.length * 9);
  tri.forEach((t, k) => {
    let nn = normal(t[0], t[1], t[2]);
    // La cara de adelante mira a +z; las paredes quedan con su normal (casi de canto)
    if (Math.abs(nn[2]) > 0.3 && nn[2] < 0) nn = [-nn[0], -nn[1], -nn[2]];
    t.forEach((v, s) => {
      const o = k * 9 + s * 3;
      posiciones.set(v, o);
      normales.set(nn, o);
    });
  });
  return { posiciones, normales };
}
