/**
 * La cinta de obra (autor, 2026-10-04): marca lo que todavía no tiene proyecto (las disciplinas sin casos del
 * N2 y las tarjetas «Próximamente» del N3) y guía el recorrido hacia lo que sí está listo. Es de vidrio, como
 * el resto del sitio, reacciona al cursor sin descontrolarse y, si se jala, se rompe y se repone.
 *
 * Cada tarjeta bloqueada toma una disposición al azar (en X, cruzadas o una), distinta de la de la tarjeta
 * anterior, y el texto se alterna de una cinta a otra. La física vive en las coordenadas planas de la
 * tarjeta (`fisica.ts`); el nivel deforma la malla en su shader igual que deforma la tarjeta (`glsl.ts`). En
 * las puntas, la cinta da la vuelta al canto y sigue por detrás, como papel de regalo.
 */
import * as THREE from 'three';
import { estampado, MASCARA_VACIA, TEXTOS } from './estampado';
import { aleatorio, ALTO_TARJETA, ANCHO_CINTA, DISPOSICIONES, FisicaCinta, lineasDe, type Disposicion, type Punto2 } from './fisica';

export { ALTO_TARJETA } from './fisica';
export type { Disposicion, Punto2 } from './fisica';

/** Ámbar de la paleta (`--color-motion`, #E09B00) y ónix (#111111), ya codificados. */
const AMBAR = new THREE.Vector3(0xe0 / 255, 0x9b / 255, 0x00 / 255);
const HUMO = new THREE.Vector3(0x11 / 255, 0x11 / 255, 0x11 / 255);
// El doblez de cada punta: 8 puntos en la vuelta al canto y 3 por detrás
const PLIEGUE = 11;
const ATRAS = 0.3;

export interface OpcionesCintas {
  /** Ancho / alto de la tarjeta. */
  aspecto: number;
  /** Varía la disposición y el arranque del estampado de una tarjeta a otra. */
  semilla: number;
  /** La disposición de la tarjeta anterior: esta toma otra. */
  anterior: Disposicion | null;
  /** Índice del primer texto de esta tarjeta en TEXTOS (se alterna de cinta en cinta). */
  texto: number;
  /** Medio grueso de la tarjeta, en unidades de la física (alto de la tarjeta = ALTO_TARJETA). */
  rCanto: number;
  anisotropia: number;
  /** El material del nivel, con el vertex que deforma la cinta como a su tarjeta. */
  crearMaterial: (uniformes: Record<string, THREE.IUniform>) => THREE.ShaderMaterial;
  /** Se llama cuando una máscara termina de cargar (para volver a dibujar). */
  alCargar?: () => void;
}

interface Cinta {
  fisica: FisicaCinta;
  malla: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  vert: Float32Array;
  canto: Float32Array;
  tang: Float32Array;
  trav: Float32Array;
  pliegueE: number[];
  uOpacidad: THREE.IUniform<number>;
}

export class CintasDeTarjeta {
  readonly disposicion: Disposicion;
  readonly textos: string[];
  readonly mallas: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private readonly cintas: Cinta[] = [];
  private readonly W: number;
  private readonly H = ALTO_TARJETA;

  constructor(private readonly op: OpcionesCintas) {
    const r = aleatorio(op.semilla);
    const posibles = DISPOSICIONES.filter((d) => d !== op.anterior);
    this.disposicion = posibles[Math.floor(r() * posibles.length)];
    this.W = this.H * op.aspecto;
    const lineas = lineasDe(this.disposicion, this.W, this.H, r() < 0.5);
    this.textos = lineas.map((_, j) => TEXTOS[(op.texto + j) % TEXTOS.length]);
    lineas.forEach((linea, j) => {
      const fisica = new FisicaCinta(linea, 0.012 + 0.03 * j, this.W, this.H);
      this.cintas.push(this.crearCinta(fisica, this.textos[j], r() * 10));
    });
  }

  private crearCinta(fisica: FisicaCinta, texto: string, desfase: number): Cinta {
    const N = fisica.N;
    const F = PLIEGUE;
    const M = N + 2 * F;
    const vert = new Float32Array(6 * M);
    const canto = new Float32Array(6 * M);
    const detras = new Float32Array(2 * M);
    const uv = new Float32Array(4 * M);
    const rr = this.op.rCanto + fisica.capa;
    const ux = Math.max(0.2, Math.abs(fisica.dir.x));
    const pliegueE = Array.from({ length: F }, (_, q) => (q < 8 ? (Math.PI * rr * (q + 1)) / 8 : Math.PI * rr + (ATRAS * (q - 7)) / 3));
    const ponUv = (j: number, u: number) => {
      uv[4 * j] = uv[4 * j + 2] = u + desfase;
      uv[4 * j + 1] = 1;
      uv[4 * j + 3] = 0;
    };
    const largo = fisica.arco[N - 1];
    for (let q = 0; q < F; q++) {
      ponUv(F - 1 - q, -pliegueE[q] / ux);
      ponUv(F + N + q, largo + pliegueE[q] / ux);
      // Más allá de un cuarto de vuelta, el doblez queda detrás de la tarjeta
      const atras = pliegueE[q] > (Math.PI * rr) / 2 ? 1 : 0;
      detras[2 * (F - 1 - q)] = detras[2 * (F - 1 - q) + 1] = atras;
      detras[2 * (F + N + q)] = detras[2 * (F + N + q) + 1] = atras;
    }
    for (let i = 0; i < N; i++) ponUv(F + i, fisica.arco[i]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vert, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCanto', new THREE.BufferAttribute(canto, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aDetras', new THREE.BufferAttribute(detras, 1));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const uImpresion: THREE.IUniform<THREE.Texture> = { value: MASCARA_VACIA };
    const uRepeat: THREE.IUniform<number> = { value: 1 };
    const uOpacidad: THREE.IUniform<number> = { value: 1 };
    const material = this.op.crearMaterial({
      tImpresion: uImpresion,
      u_repeat: uRepeat,
      u_ambar: { value: AMBAR },
      u_humo: { value: HUMO },
      u_opacidad: uOpacidad,
    });
    void estampado(texto, this.op.anisotropia).then((t) => {
      uImpresion.value = t;
      uRepeat.value = 1 / (t.userData.largo as number);
      this.op.alCargar?.();
    });
    const malla = new THREE.Mesh(geo, material);
    malla.frustumCulled = false; // la deformación ocurre en el shader
    this.mallas.push(malla);
    const cinta: Cinta = { fisica, malla, vert, canto, tang: new Float32Array(3 * N), trav: new Float32Array(3 * N), pliegueE, uOpacidad };
    this.indice(cinta);
    this.escribir(cinta);
    return cinta;
  }

  /** Los triángulos de la malla; el tramo roto (si lo hay) se salta. */
  private indice(c: Cinta): void {
    const M = c.fisica.N + 2 * PLIEGUE;
    const roto = c.fisica.corte >= 0 ? PLIEGUE + c.fisica.corte : -1;
    const idx: number[] = [];
    for (let j = 0; j < M - 1; j++) {
      if (j === roto) continue;
      const a = 2 * j;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    c.malla.geometry.setIndex(idx);
  }

  /** Avanza la física. `puntero` en coordenadas de la tarjeta (alto = ALTO_TARJETA) o null. ¿Se movió algo? */
  paso(dt: number, puntero: Punto2 | null): boolean {
    let movio = false;
    for (const c of this.cintas) {
      if (!c.fisica.paso(dt, puntero)) continue;
      if (c.fisica.cambioCorte) {
        c.fisica.cambioCorte = false;
        this.indice(c);
      }
      c.uOpacidad.value = c.fisica.opacidad;
      // La cinta nueva se tiende de izquierda a derecha
      const tramos = c.fisica.N + 2 * PLIEGUE - 1;
      c.malla.geometry.setDrawRange(0, c.fisica.tendida >= 1 ? Infinity : Math.floor(c.fisica.tendida * tramos) * 6);
      this.escribir(c);
      movio = true;
    }
    return movio;
  }

  /** Agarra la cinta que está bajo `P` (la de encima primero). ¿Agarró alguna? */
  agarrar(P: Punto2): boolean {
    for (let j = this.cintas.length - 1; j >= 0; j--) if (this.cintas[j].fisica.agarrar(P)) return true;
    return false;
  }

  /** La mano suelta lo que tenga. */
  soltar(): void {
    for (const c of this.cintas) c.fisica.soltar();
  }

  get agarrada(): boolean {
    return this.cintas.some((c) => c.fisica.agarrada);
  }

  /** Cuántas cintas de esta tarjeta están rotas (o reponiéndose). */
  get rotas(): number {
    return this.cintas.reduce((n, c) => n + (c.fisica.rota ? 1 : 0), 0);
  }

  /** El clic en la tarjeta bloqueada: las cintas brincan alrededor de (x, y). */
  golpe(x: number, y: number): void {
    for (const c of this.cintas) c.fisica.golpe(x, y);
  }

  dispose(): void {
    for (const c of this.cintas) {
      c.malla.removeFromParent();
      c.malla.geometry.dispose();
      c.malla.material.dispose();
    }
  }

  // Cada nodo da dos vértices. El ancho se lleva por transporte paralelo desde el medio de cada pieza (no se
  // voltea) y gira un poco donde la cinta se despega. En las puntas, el doblez continúa la recta de la cinta
  // sobre la superficie de la tarjeta: da la vuelta al canto (radio rCanto) y sigue por detrás.
  private escribir(c: Cinta): void {
    const { fisica, vert: o, canto: oc, tang: T, trav: A } = c;
    const p = fisica.pos;
    const N = fisica.N;
    const F = PLIEGUE;
    const hw = ANCHO_CINTA / 2;
    const corte = fisica.corte;
    for (let i = 0; i < N; i++) {
      // La tangente no cruza el corte
      let a = Math.max(0, i - 1);
      let b = Math.min(N - 1, i + 1);
      if (corte >= 0 && i === corte + 1) a = i;
      if (corte >= 0 && i === corte) b = i;
      const tx = p[3 * b] - p[3 * a];
      const ty = p[3 * b + 1] - p[3 * a + 1];
      const tz = p[3 * b + 2] - p[3 * a + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      T[3 * i] = tx / tl;
      T[3 * i + 1] = ty / tl;
      T[3 * i + 2] = tz / tl;
    }
    const llevar = (de: number, a: number) => {
      const ax = A[3 * de];
      const ay = A[3 * de + 1];
      const az = A[3 * de + 2];
      const qx = T[3 * a];
      const qy = T[3 * a + 1];
      const qz = T[3 * a + 2];
      const pp = ax * qx + ay * qy + az * qz;
      let rx = ax - pp * qx;
      let ry = ay - pp * qy;
      let rz = az - pp * qz;
      const rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-5) { rx = ax; ry = ay; rz = az; } else { rx /= rl; ry /= rl; rz /= rl; }
      A[3 * a] = rx;
      A[3 * a + 1] = ry;
      A[3 * a + 2] = rz;
    };
    // Ancho en el medio de cada pieza: la normal de la tarjeta (0, 0, 1) × la tangente; luego se transporta
    const piezas: Array<[number, number]> = corte >= 0 ? [[0, corte], [corte + 1, N - 1]] : [[0, N - 1]];
    for (const [i0, i1] of piezas) {
      const k0 = (i0 + i1) >> 1;
      let cx = -T[3 * k0 + 1];
      let cy = T[3 * k0];
      const cl = Math.hypot(cx, cy);
      if (cl < 1e-4) { cx = 0; cy = 1; } else { cx /= cl; cy /= cl; }
      A[3 * k0] = cx;
      A[3 * k0 + 1] = cy;
      A[3 * k0 + 2] = 0;
      for (let i = k0 + 1; i <= i1; i++) llevar(i - 1, i);
      for (let i = k0 - 1; i >= i0; i--) llevar(i + 1, i);
    }

    const poner = (j: number, x: number, y: number, z: number, ax: number, ay: number, az: number) => {
      o[6 * j] = x + ax * hw; o[6 * j + 1] = y + ay * hw; o[6 * j + 2] = z + az * hw;
      o[6 * j + 3] = x - ax * hw; o[6 * j + 4] = y - ay * hw; o[6 * j + 5] = z - az * hw;
      oc[6 * j] = ax; oc[6 * j + 1] = ay; oc[6 * j + 2] = az;
      oc[6 * j + 3] = -ax; oc[6 * j + 4] = -ay; oc[6 * j + 5] = -az;
    };
    for (let i = 0; i < N; i++) {
      const x = p[3 * i];
      const y = p[3 * i + 1];
      const z = p[3 * i + 2];
      let cx = A[3 * i];
      let cy = A[3 * i + 1];
      let cz = A[3 * i + 2];
      const phi = 0.3 * Math.min(1, Math.max(0, z - fisica.capa) / 0.3);
      if (phi > 0) {
        const tx = T[3 * i];
        const ty = T[3 * i + 1];
        const tz = T[3 * i + 2];
        const bx = ty * cz - tz * cy;
        const by = tz * cx - tx * cz;
        const bz = tx * cy - ty * cx;
        const co = Math.cos(phi);
        const si = Math.sin(phi);
        cx = cx * co + bx * si;
        cy = cy * co + by * si;
        cz = cz * co + bz * si;
      }
      poner(F + i, x, y, z, cx, cy, cz);
    }
    // Los dobleces
    const rr = this.op.rCanto + fisica.capa;
    const zc = -this.op.rCanto;
    const W2 = this.W / 2;
    for (const [nodo, sg] of [[0, -1], [N - 1, 1]] as const) {
      const base = sg < 0 ? F - 1 : F + N;
      const paso = sg < 0 ? -1 : 1;
      const ux = Math.max(0.2, Math.abs(fisica.dir.x));
      const uy = sg * fisica.dir.y;
      const y0 = p[3 * nodo + 1];
      const aSx = A[3 * nodo] * sg;
      const aSy = A[3 * nodo + 1];
      for (let q = 0; q < F; q++) {
        const eq = c.pliegueE[q];
        const l = eq / ux;
        let lx: number;
        let lz: number;
        let txx: number;
        let txz: number;
        if (eq <= Math.PI * rr) {
          const fi = eq / rr;
          lx = sg * (W2 + rr * Math.sin(fi));
          lz = zc + rr * Math.cos(fi);
          txx = sg * Math.cos(fi);
          txz = -Math.sin(fi);
        } else {
          lx = sg * (W2 - (eq - Math.PI * rr));
          lz = zc - rr;
          txx = -sg;
          txz = 0;
        }
        let ax = aSx * txx;
        let ay = aSy;
        let az = aSx * txz;
        const al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
        poner(base + paso * q, lx, y0 + l * uy, lz, ax, ay, az);
      }
    }
    const geo = c.malla.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aCanto').needsUpdate = true;
    geo.computeVertexNormals();
  }
}
