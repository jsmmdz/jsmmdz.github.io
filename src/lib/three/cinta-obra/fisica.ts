/**
 * La física de la cinta de obra (autor, 2026-10-04): una cuerda XPBD de pasos pequeños, en las coordenadas
 * planas de su tarjeta. La tarjeta mide siempre ALTO_TARJETA de alto (y su proporción de ancho); cada nivel la
 * escala y la deforma en su shader (la cinta de Landberg en el N3, el cilindro en el N2).
 *
 * Valores del prototipo aprobado por el autor (claude.ai/artifact/LbRFAdDQGNH6353gqRtbMx, versión 5):
 * - las puntas quedan fijas en los cantos de la tarjeta; el doblez hacia atrás no se simula, se dibuja;
 * - el cursor abomba la cinta en campana, como mucho HUNDE_MAX, y la mueve sin darle impulso: por rápido que
 *   se mueva el cursor, la cinta no sale disparada (el prototipo 3 se descontrolaba por eso);
 * - al agarrarla se estira hasta ESTIRA_MAX; si la mano se aleja ROMPE_A de su sitio, se rompe: suelta la
 *   tensión y casi todo su impulso (no sale volando), las mitades cuelgan y a los REPONE s se tiende otra;
 * - el paso es fijo (PASO), así se comporta igual a 30, 60 o 144 Hz;
 * - quieta, se duerme: no calcula ni pide cuadros.
 * Un poco suelta (autor, 2026-10-04): TENSION de 0,98 con un peso leve, así se comba apenas.
 */

export const ALTO_TARJETA = 4.5;
export const ANCHO_CINTA = 0.5;

const PASO = 1 / 2400;
const G = -1.5;
const G_ROTA = -8;
const MASA = 4;
const AMORT = 7;
const AMORT_ROTA = 10;
const FRICCION = 2;
const TENSION = 0.98;
const ALFA_LARGO = 2.4e-7;
const ALFA_FLEXION = 3e-5;
const R_DEDO = 0.3;
const HUNDE_MAX = 0.2;
const PASA = 0.6;
const PERFIL = 1.5;
const GOLPE = 1.0;
const ESTIRA_MAX = 0.5;
const LEVANTE = 0.15;
const K_JALAR = 10;
const ROMPE_A = 1.8;
const K_ROTA = 3;
const V_ROTA = 2;
const REPONE = 2.0;
const DESVANECE = 0.5;
const TENDER = 1.0;
const DORMIR_VEL = 2e-3;
const DORMIR_S = 0.3;

export interface Punto2 {
  x: number;
  y: number;
}

export interface LineaCinta {
  a: Punto2;
  b: Punto2;
}

type Fase = 'entera' | 'rota' | 'desvanece' | 'tiende';

export class FisicaCinta {
  readonly N: number;
  /** Posiciones (x, y, z) de los nodos; z es la altura sobre la cara de la tarjeta. */
  readonly pos: Float32Array;
  /** Dirección de la cinta sobre la cara (de a hacia b). */
  readonly dir: Punto2;
  readonly capa: number;
  /** Largo de arco de cada nodo (para la textura). */
  readonly arco: Float32Array;
  dormida = false;
  /** Tramo roto (entre los nodos `corte` y `corte + 1`), o -1. */
  corte = -1;
  /** Cambió el corte: hay que rehacer la malla. */
  cambioCorte = false;
  /** 0..1: cuánto se ve (se apaga antes de tender la nueva). */
  opacidad = 1;
  /** 0..1: cuánto de la cinta nueva ya se tendió (de izquierda a derecha). */
  tendida = 1;

  private readonly prev: Float32Array;
  private readonly vel: Float32Array;
  private readonly w: Float32Array;
  private readonly inicial: Float32Array;
  private readonly ci: Int32Array;
  private readonly cj: Int32Array;
  private readonly rest: Float32Array;
  private readonly restInicial: Float32Array;
  private readonly comp: Float32Array;
  private readonly activa: Uint8Array;
  private readonly a: Punto2;
  private readonly b: Punto2;
  private contacto = false;
  private lado = 0;
  private s = 0;
  private quieta = 0;
  private ultimo: Punto2 | null = null;
  private fase: Fase = 'entera';
  private tFase = 0;
  private calma = 0;
  private agarre: { k: number; t: number; mano: Punto2 } | null = null;

  constructor(
    linea: LineaCinta,
    capa: number,
    private readonly W: number,
    private readonly H: number,
  ) {
    this.capa = capa;
    this.a = linea.a;
    this.b = linea.b;
    const largo = Math.hypot(linea.b.x - linea.a.x, linea.b.y - linea.a.y);
    this.dir = { x: (linea.b.x - linea.a.x) / largo, y: (linea.b.y - linea.a.y) / largo };
    const N = (this.N = Math.max(24, Math.round(largo / 0.13) + 1));
    this.pos = new Float32Array(3 * N);
    this.prev = new Float32Array(3 * N);
    this.vel = new Float32Array(3 * N);
    this.w = new Float32Array(N).fill(1 / MASA);
    this.arco = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1);
      this.pos[3 * i] = linea.a.x + (linea.b.x - linea.a.x) * f;
      this.pos[3 * i + 1] = linea.a.y + (linea.b.y - linea.a.y) * f;
      this.pos[3 * i + 2] = capa;
      this.arco[i] = largo * f;
    }
    this.w[0] = this.w[N - 1] = 0;
    // Restricciones: largo entre vecinos y flexión cada dos nodos, con la cinta tensa (TENSION)
    const ci: number[] = [];
    const cj: number[] = [];
    const rest: number[] = [];
    const comp: number[] = [];
    const seg = largo / (N - 1);
    for (let i = 0; i < N - 1; i++) {
      ci.push(i); cj.push(i + 1); rest.push(TENSION * seg); comp.push(ALFA_LARGO);
    }
    for (let i = 0; i < N - 2; i++) {
      ci.push(i); cj.push(i + 2); rest.push(TENSION * 2 * seg); comp.push(ALFA_FLEXION);
    }
    this.ci = Int32Array.from(ci);
    this.cj = Int32Array.from(cj);
    this.rest = Float32Array.from(rest);
    this.restInicial = Float32Array.from(rest);
    this.comp = Float32Array.from(comp);
    this.activa = new Uint8Array(ci.length).fill(1);
    // Nace asentada (con su leve comba) y dormida: así no salta al despertar. Pasos largos, que bastan aquí.
    for (let k = 0; k < 240; k++) this.subpaso(1 / 240, null);
    this.vel.fill(0);
    this.prev.set(this.pos);
    this.inicial = Float32Array.from(this.pos);
    this.dormida = true;
  }

  get rota(): boolean {
    return this.fase !== 'entera';
  }

  get agarrada(): boolean {
    return this.agarre !== null;
  }

  /**
   * Avanza `dt` segundos. `puntero` en coordenadas de la tarjeta (o null): empuja la cinta o, si está
   * agarrada, es la mano. Devuelve si cambió algo que dibujar.
   */
  paso(dt: number, puntero: Punto2 | null): boolean {
    if (this.agarre && puntero) this.agarre.mano = { x: puntero.x, y: puntero.y };
    const movido = !puntero || !this.ultimo ? puntero !== this.ultimo : Math.abs(puntero.x - this.ultimo.x) + Math.abs(puntero.y - this.ultimo.y) > 1e-4;
    this.ultimo = puntero ? { x: puntero.x, y: puntero.y } : null;
    const conTiempo = this.fase !== 'entera' || this.agarre !== null;
    if (this.dormida && !conTiempo && !(movido && this.cerca(puntero))) return false;
    this.dormida = false;
    const d = Math.min(dt, 1 / 30);
    this.avanzarFase(d);
    if (this.fase === 'entera' && this.agarre && this.distanciaMano() > ROMPE_A) this.romper(this.agarre.k);
    const nsub = Math.max(1, Math.round(d / PASO));
    const h = d / nsub;
    let vmax = 0;
    for (let s = 0; s < nsub; s++) vmax = Math.max(vmax, this.subpaso(h, puntero));
    // Ya rota, si la mitad que tienes en la mano queda tirante contra su ancla, se te escapa
    if (this.agarre && this.fase === 'rota' && this.tirante()) this.soltar();
    if (vmax < DORMIR_VEL && this.fase === 'entera' && !this.agarre) {
      this.quieta += d;
      if (this.quieta > DORMIR_S) this.dormida = true;
    } else {
      this.quieta = 0;
    }
    return true;
  }

  /** Agarra la cinta si `P` (coordenadas de la tarjeta) cae sobre ella. */
  agarrar(P: Punto2): boolean {
    if (this.fase !== 'entera') return false;
    const p = this.pos;
    const radio = this.contacto ? R_DEDO + ANCHO_CINTA + 0.3 : ANCHO_CINTA / 2 + 0.14;
    let mejor = -1;
    let dmin = radio * radio;
    for (let i = 1; i < this.N - 1; i++) {
      const d = (p[3 * i] - P.x) ** 2 + (p[3 * i + 1] - P.y) ** 2;
      if (d < dmin) { dmin = d; mejor = i; }
    }
    if (mejor < 0) return false;
    this.agarre = { k: mejor, t: 0, mano: { x: P.x, y: P.y } };
    // Mientras la mano la sostiene, ese punto no tiene masa: lo mueve solo la mano (sin acumular impulso)
    this.w[mejor] = 0;
    this.contacto = false;
    this.dormida = false;
    return true;
  }

  /** La mano suelta la cinta: el punto vuelve a tener masa y queda quieto. */
  soltar(): void {
    if (!this.agarre) return;
    const k = this.agarre.k;
    this.w[k] = 1 / MASA;
    this.vel[3 * k] = this.vel[3 * k + 1] = this.vel[3 * k + 2] = 0;
    this.agarre = null;
    if (this.fase === 'rota') this.tFase = 0;
  }

  /** Un brinco hacia afuera alrededor de (x, y): la tarjeta bloqueada responde al clic. */
  golpe(x: number, y: number): void {
    if (this.fase !== 'entera') return;
    const p = this.pos;
    const v = this.vel;
    const s2 = 2 * 1.2 * 1.2;
    for (let k = 0; k < this.N; k++) {
      if (this.w[k] === 0) continue;
      const i = 3 * k;
      const dx = p[i] - x;
      const dy = p[i + 1] - y;
      const f = Math.exp(-(dx * dx + dy * dy) / s2);
      v[i + 2] += GOLPE * f;
      v[i] += dx * f * 0.25;
      v[i + 1] += dy * f * 0.25;
    }
    this.dormida = false;
    this.quieta = 0;
  }

  // ---------- Rotura y reposición ----------

  private romper(k: number): void {
    const c = Math.min(k, this.N - 2);
    for (let i = 0; i < this.ci.length; i++) if (Math.min(this.ci[i], this.cj[i]) <= c && Math.max(this.ci[i], this.cj[i]) >= c + 1) this.activa[i] = 0;
    // Suelta la tensión (el reposo pasa a ser el largo que tiene) y tres cuartas partes del impulso
    const p = this.pos;
    for (let i = 0; i < this.ci.length; i++) {
      const a = 3 * this.ci[i];
      const b = 3 * this.cj[i];
      this.rest[i] = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
    }
    for (let i = 0; i < this.vel.length; i++) this.vel[i] *= 0.25;
    this.corte = c;
    this.cambioCorte = true;
    this.fase = 'rota';
    this.tFase = 0;
    this.calma = 1.2;
  }

  private avanzarFase(d: number): void {
    this.calma = Math.max(0, this.calma - d);
    if (this.agarre) this.agarre.t += d;
    if (this.fase === 'rota') {
      if (!this.agarre) this.tFase += d;
      if (this.tFase > REPONE) { this.fase = 'desvanece'; this.tFase = 0; }
    } else if (this.fase === 'desvanece') {
      this.tFase += d;
      this.opacidad = Math.max(0, 1 - this.tFase / DESVANECE);
      if (this.tFase >= DESVANECE) this.reponer();
    } else if (this.fase === 'tiende') {
      this.tFase += d;
      const t = Math.min(1, this.tFase / TENDER);
      this.tendida = 1 - (1 - t) ** 3;
      if (t >= 1) { this.fase = 'entera'; this.tendida = 1; }
    }
  }

  /** Una cinta nueva, asentada, que se tiende de izquierda a derecha. */
  private reponer(): void {
    this.pos.set(this.inicial);
    this.prev.set(this.inicial);
    this.vel.fill(0);
    this.rest.set(this.restInicial);
    this.activa.fill(1);
    this.w.fill(1 / MASA);
    this.w[0] = this.w[this.N - 1] = 0;
    this.corte = -1;
    this.cambioCorte = true;
    this.opacidad = 1;
    this.tendida = 0;
    this.fase = 'tiende';
    this.tFase = 0;
    this.contacto = false;
    this.lado = 0;
  }

  private distanciaMano(): number {
    if (!this.agarre) return 0;
    const f = this.agarre.k / (this.N - 1);
    const rx = this.a.x + (this.b.x - this.a.x) * f;
    const ry = this.a.y + (this.b.y - this.a.y) * f;
    return Math.hypot(this.agarre.mano.x - rx, this.agarre.mano.y - ry);
  }

  /** Algún tramo estirado más de un 4 % sobre su reposo. */
  private tirante(): boolean {
    const p = this.pos;
    for (let i = 0; i < this.ci.length; i++) {
      if (!this.activa[i] || this.cj[i] !== this.ci[i] + 1) continue;
      const a = 3 * this.ci[i];
      const b = 3 * this.cj[i];
      if (Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]) > this.rest[i] * 1.04) return true;
    }
    return false;
  }

  // ---------- Un subpaso ----------

  /** El cursor está lo bastante cerca como para tocarla (despierta a la cinta dormida). */
  private cerca(P: Punto2 | null): boolean {
    if (!P) return false;
    const L = Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
    const tp = (P.x - this.a.x) * this.dir.x + (P.y - this.a.y) * this.dir.y;
    const pn = -(P.x - this.a.x) * this.dir.y + (P.y - this.a.y) * this.dir.x;
    return tp > 0 && tp < L && Math.abs(pn) < R_DEDO + ANCHO_CINTA / 2 + 0.2;
  }

  private subpaso(h: number, P: Punto2 | null): number {
    const p = this.pos;
    const pr = this.prev;
    const v = this.vel;
    const w = this.w;
    const N = this.N;
    const g = this.fase === 'rota' ? G_ROTA : G;
    for (let k = 0; k < N; k++) {
      if (w[k] === 0) continue;
      const i = 3 * k;
      v[i + 1] += g * h;
      pr[i] = p[i]; pr[i + 1] = p[i + 1]; pr[i + 2] = p[i + 2];
      p[i] += v[i] * h; p[i + 1] += v[i + 1] * h; p[i + 2] += v[i + 2] * h;
    }
    if (this.agarre) this.jalar(h);
    else if (this.fase === 'entera') this.pellizco(P);
    this.resolver(h);
    // La cinta no atraviesa la cara de la tarjeta
    const hw = this.W / 2;
    const hh = this.H / 2;
    const am = Math.exp(-(this.calma > 0 ? AMORT_ROTA : AMORT) * h);
    const fr = Math.exp(-FRICCION * h);
    let vmax = 0;
    for (let k = 0; k < N; k++) {
      if (w[k] === 0) continue;
      const i = 3 * k;
      let toca = false;
      if (p[i + 2] < this.capa && Math.abs(p[i]) <= hw && Math.abs(p[i + 1]) <= hh) {
        p[i + 2] = this.capa;
        toca = true;
      }
      let vx = (p[i] - pr[i]) / h;
      let vy = (p[i + 1] - pr[i + 1]) / h;
      const vz = (p[i + 2] - pr[i + 2]) / h;
      if (toca) { vx *= fr; vy *= fr; }
      v[i] = vx * am; v[i + 1] = vy * am; v[i + 2] = vz * am;
      vmax = Math.max(vmax, Math.abs(v[i]), Math.abs(v[i + 1]), Math.abs(v[i + 2]));
    }
    return vmax;
  }

  // La mano mueve el punto agarrado: hacia ella, hasta ESTIRA_MAX de su sitio mientras la cinta está entera
  // y, ya rota, despacio y a lo sumo a V_ROTA.
  private jalar(h: number): void {
    const ag = this.agarre;
    if (!ag) return;
    const i = 3 * ag.k;
    const p = this.pos;
    let tx = ag.mano.x;
    let ty = ag.mano.y;
    if (this.fase === 'entera') {
      const f = ag.k / (this.N - 1);
      const rx = this.a.x + (this.b.x - this.a.x) * f;
      const ry = this.a.y + (this.b.y - this.a.y) * f;
      const dd = Math.hypot(tx - rx, ty - ry);
      if (dd > ESTIRA_MAX) { tx = rx + ((tx - rx) / dd) * ESTIRA_MAX; ty = ry + ((ty - ry) / dd) * ESTIRA_MAX; }
    }
    const tz = this.capa + LEVANTE * Math.min(1, ag.t / 0.4);
    let ex = tx - p[i];
    let ey = ty - p[i + 1];
    let ez = tz - p[i + 2];
    if (this.fase === 'rota') {
      const kf = 1 - Math.exp(-K_ROTA * h);
      const paso = Math.hypot(ex, ey, ez) * kf;
      const esc = paso > V_ROTA * h ? (V_ROTA * h) / paso : 1;
      ex *= kf * esc; ey *= kf * esc; ez *= kf * esc;
    } else {
      const kf = 1 - Math.exp(-K_JALAR * h);
      ex *= kf; ey *= kf; ez *= kf;
    }
    p[i] += ex; p[i + 1] += ey; p[i + 2] += ez;
  }

  // El cursor abomba la cinta al cruzarla, en campana: crece al acercarse, es máximo al cruzar y se apaga solo
  // al alejarse. La lleva hasta la campana y le quita la velocidad hacia los lados: no guarda impulso.
  private pellizco(P: Punto2 | null): void {
    if (!P) {
      this.contacto = false;
      this.lado = 0;
      return;
    }
    const L = Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y);
    const dx = this.dir.x;
    const dy = this.dir.y;
    const nx = -dy;
    const ny = dx;
    const RE = R_DEDO + ANCHO_CINTA / 2;
    const tp = (P.x - this.a.x) * dx + (P.y - this.a.y) * dy;
    const pn = (P.x - this.a.x) * nx + (P.y - this.a.y) * ny;
    const enTramo = tp > 0.25 && tp < L - 0.25;
    if (!this.contacto) {
      if (!enTramo) { this.lado = 0; return; }
      if (Math.abs(pn) >= RE) { this.lado = Math.sign(pn); return; }
      if (this.lado === 0) return;
      this.contacto = true;
      this.s = this.lado;
    }
    const s = this.s;
    const x = -s * pn;
    if (!enTramo || x < -RE || x > PASA) {
      this.contacto = false;
      this.lado = enTramo && Math.abs(pn) >= RE ? Math.sign(pn) : 0;
      return;
    }
    const u = x < 0 ? x / RE : x / PASA;
    const hunde = HUNDE_MAX * (1 - u * u) * (1 - u * u);
    const p = this.pos;
    const pr = this.prev;
    for (let k = 0; k < this.N; k++) {
      if (this.w[k] === 0) continue;
      const i = 3 * k;
      const qx = p[i] - this.a.x;
      const qy = p[i + 1] - this.a.y;
      const d = (qx * dx + qy * dy - tp) / PERFIL;
      if (d <= -1 || d >= 1) continue;
      const peso = (1 - d * d) * (1 - d * d);
      const meta = -s * hunde * peso;
      const qn = qx * nx + qy * ny;
      if (s * qn <= s * meta) continue;
      p[i] += nx * (meta - qn);
      p[i + 1] += ny * (meta - qn);
      const vn = (p[i] - pr[i]) * nx + (p[i + 1] - pr[i + 1]) * ny;
      pr[i] += nx * vn;
      pr[i + 1] += ny * vn;
    }
  }

  private resolver(h: number): void {
    const p = this.pos;
    const w = this.w;
    const h2 = h * h;
    for (let c = 0; c < this.ci.length; c++) {
      if (!this.activa[c]) continue;
      const a = this.ci[c];
      const b = this.cj[c];
      const wa = w[a];
      const wb = w[b];
      const ws = wa + wb;
      if (ws === 0) continue;
      const i = 3 * a;
      const j = 3 * b;
      const dx = p[i] - p[j];
      const dy = p[i + 1] - p[j + 1];
      const dz = p[i + 2] - p[j + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-9) continue;
      const dl = -(L - this.rest[c]) / (ws + this.comp[c] / h2);
      const sx = (dx / L) * dl;
      const sy = (dy / L) * dl;
      const sz = (dz / L) * dl;
      p[i] += sx * wa; p[i + 1] += sy * wa; p[i + 2] += sz * wa;
      p[j] -= sx * wb; p[j + 1] -= sy * wb; p[j + 2] -= sz * wb;
    }
  }
}

/** Generador con semilla (mulberry32): la misma tarjeta toma siempre la misma disposición. */
export function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Disposicion = 'x' | 'cruzadas' | 'una';
export const DISPOSICIONES: readonly Disposicion[] = ['x', 'cruzadas', 'una'];

/** Las rectas de las cintas sobre una tarjeta de W × H, de canto a canto (de izquierda a derecha). */
export function lineasDe(disposicion: Disposicion, W: number, H: number, espejo: boolean): LineaCinta[] {
  const sg = espejo ? -1 : 1;
  const linea = (cy: number, ang: number): LineaCinta => {
    const m = Math.tan(ang);
    return { a: { x: -W / 2, y: cy - (m * W) / 2 }, b: { x: W / 2, y: cy + (m * W) / 2 } };
  };
  if (disposicion === 'x') {
    const ang = 0.8 * Math.atan(H / W);
    return [linea(0, -ang * sg), linea(0, ang * sg)];
  }
  if (disposicion === 'cruzadas') return [linea(H * 0.1, 0.14 * sg), linea(-H * 0.08, -0.19 * sg)];
  return [linea(H * 0.04, -0.09 * sg)];
}
