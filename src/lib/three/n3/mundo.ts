/**
 * El mundo del N3: la cinta de tarjetas de Landberg dibujada en WebGL.
 *
 * Cada tarjeta es un plano de 24×24 segmentos cuya posición y escala salen de su rectángulo DOM en
 * z = 0 (K2), así que sin deformación coincide píxel a píxel con la pista. Todas se doblan con la
 * misma función de la x del mundo (K3), con la luz, la bruma y las esquinas por SDF en el fragment.
 * El mundo se dibuja en un render target de 4 muestras que se copia a pantalla (D4 de T28).
 *
 * Este módulo no lee el DOM cada cuadro: recibe los rectángulos de la pista y la velocidad.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import type { Pista, RectTarjeta } from '@/lib/n3/pista';
import { PASE_FRAGMENT, PASE_VERTEX, TARJETA_FRAGMENT, TARJETA_VERTEX } from './glsl';
import { Piso } from './piso';
import { dibujarFondo, dibujarOverlay, leerColoresN3, type ColoresN3 } from './textura-tarjeta';
import { Vuelo } from './vuelo';

// K2: la cámara
const FOV = 53.4;
const CAM_Z = 41.18;
// Muestras del render target del mundo (D4: el antialias de Landberg)
const MUESTRAS = 4;
// K11: concavidad del hover (× alto de la tarjeta) y su duración
const HUECO_HOVER = 0.1;
const DURACION_HOVER = 0.5;
// K19: entrada al montar
const ENTRADA_DURACION = 1.25;
const ENTRADA_ARRANQUE = 0.1;
const ENTRADA_ESCALONADO = 0.05;
const PISO_ENTRADA = { duracion: 1.1, retraso: 0.15 };
// K16: lo demás se apaga al volar
const APAGADO_TARJETAS = 0.3;
const APAGADO_PISO = 0.45;
// Esquina de la tarjeta (2 rem)
const ESQUINA_REM = 2;
// Toda espera tiene salida: si una portada no carga en este tiempo, se sigue con el color de respaldo
const TIEMPO_MAX_CARGA_MS = 6000;

export interface DatosTarjeta {
  /** null en las tarjetas «Próximamente». */
  slug: string | null;
  titulo: string;
  img: HTMLImageElement | null;
  /** Ruta absoluta del video de portada (opcional). */
  video: string | null;
  /** Proporción ancho / alto de la portada. */
  aspecto: number;
}

interface Carta {
  datos: DatosTarjeta;
  malla: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  hover: { v: number };
  entrada: { x: number };
  alfa: { v: number };
  texturas: THREE.Texture[];
  /** Título y disco: se rehace al cambiar el tamaño de la tarjeta. */
  overlay: THREE.Texture | null;
  video: HTMLVideoElement | null;
}

const esperar = (ms: number) => new Promise<void>((listo) => window.setTimeout(listo, ms));

function textura(fuente: TexImageSource): THREE.Texture {
  // Sin decodificar: el mundo trabaja con el color ya codificado (ver glsl.ts)
  const t = new THREE.Texture(fuente);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export class MundoN3 {
  readonly escena = new THREE.Scene();
  readonly camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 2000);
  /** true cuando hay algo nuevo que dibujar; `dibujar()` lo baja. */
  sucio = true;
  /** Las texturas de las tarjetas cargaron y terminó la entrada. */
  listo = false;

  private readonly cartas: Carta[] = [];
  private readonly geometria = new THREE.PlaneGeometry(1, 1, 24, 24);
  private readonly uW: THREE.IUniform<number> = { value: 1 };
  private readonly uV: THREE.IUniform<number> = { value: 0 };
  private readonly piso: Piso;
  private readonly vacia = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  private colores: ColoresN3 = leerColoresN3();
  private mundoRT: THREE.WebGLRenderTarget | null = null;
  private pase: { escena: THREE.Scene; camara: THREE.OrthographicCamera; geometria: THREE.PlaneGeometry; material: THREE.ShaderMaterial } | null = null;
  private tam = new THREE.Vector2();
  private W = 1;
  private H = 1;
  private hoverActual = -1;
  private vuelo: Vuelo | null = null;
  private destruido = false;
  /** El mundo no se dibuja hasta que empieza la entrada: así las tarjetas no aparecen en su sitio un instante. */
  private iniciado = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly pista: Pista,
    datos: DatosTarjeta[],
    private readonly reducido: () => boolean,
  ) {
    this.vacia.needsUpdate = true;
    this.camara.position.set(0, 0, CAM_Z);
    this.camara.updateMatrixWorld(true);
    this.piso = new Piso(this.uW);
    this.escena.add(this.piso.malla);
    for (const d of datos) this.cartas.push(this.crearCarta(d));
    this.ajustar();
  }

  private crearCarta(datos: DatosTarjeta): Carta {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_map: { value: this.vacia },
        u_overlay: { value: this.vacia },
        u_mapAspect: { value: datos.aspecto },
        u_planeAspect: { value: datos.aspecto },
        u_size: { value: new THREE.Vector2(1, 1) },
        u_corner: { value: 0 },
        u_W: this.uW,
        u_V: this.uV,
        u_sheetP: { value: 1 },
        u_shade: { value: 1 },
        u_scrim: { value: datos.slug ? 1 : 0 },
        u_overlayA: { value: 1 },
        u_alpha: { value: 1 },
        u_hover: { value: 0 },
        u_dent: { value: 0 },
      },
      vertexShader: TARJETA_VERTEX,
      fragmentShader: TARJETA_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const malla = new THREE.Mesh(this.geometria, material);
    malla.frustumCulled = false; // la deformación ocurre en el shader: la esfera de la malla no vale
    malla.visible = false;
    this.escena.add(malla);
    return { datos, malla, hover: { v: 0 }, entrada: { x: 0 }, alfa: { v: 1 }, texturas: [], overlay: null, video: null };
  }

  // ---------- Carga ----------

  /** Prepara las texturas de todas las tarjetas. Siempre termina: hay tiempo máximo de respaldo. */
  async cargar(): Promise<void> {
    this.colores = leerColoresN3();
    try {
      await Promise.race([document.fonts.load(`600 16px ${this.colores.fuente}`), esperar(1500)]);
    } catch {
      // sin la fuente se dibuja con la de respaldo
    }
    await Promise.all(this.cartas.map((c, i) => this.cargarCarta(c, i)));
    this.sucio = true;
  }

  /** Dibuja (o vuelve a dibujar) el título y el disco de una tarjeta al tamaño que tiene ahora. */
  private hacerOverlay(c: Carta, i: number): void {
    const u = c.malla.material.uniforms;
    const dpr = Math.min(this.renderer.getPixelRatio(), 2);
    const r = this.pista.rects[i];
    const anterior: THREE.Texture | null = c.overlay;
    const nuevo = textura(dibujarOverlay({ ancho: r.ancho, alto: r.alto, rem: this.pista.rem, dpr }, this.colores, c.datos.titulo, c.datos.slug === null));
    c.overlay = nuevo;
    u.u_overlay.value = nuevo;
    anterior?.dispose();
  }

  private async cargarCarta(c: Carta, i: number): Promise<void> {
    const u = c.malla.material.uniforms;
    const r = this.pista.rects[i];
    this.hacerOverlay(c, i);

    if (c.datos.slug === null || !c.datos.img) {
      // «Próximamente»: fondo oscuro sin recorte (la textura cubre el plano entero)
      const fondo = textura(dibujarFondo(this.colores.oscuro));
      c.texturas.push(fondo);
      u.u_map.value = fondo;
      u.u_mapAspect.value = r.ancho / r.alto;
      return;
    }

    const img = c.datos.img;
    if (!(img.complete && img.naturalWidth > 0)) {
      await Promise.race([
        new Promise<void>((listo) => {
          img.addEventListener('load', () => listo(), { once: true });
          img.addEventListener('error', () => listo(), { once: true });
        }),
        esperar(TIEMPO_MAX_CARGA_MS),
      ]);
    }
    if (this.destruido) return;
    if (img.naturalWidth > 0) {
      const t = textura(img);
      c.texturas.push(t);
      u.u_map.value = t;
      u.u_mapAspect.value = img.naturalWidth / img.naturalHeight;
    } else {
      const fondo = textura(dibujarFondo(this.colores.oscuro));
      c.texturas.push(fondo);
      u.u_map.value = fondo;
    }
    if (c.datos.video) this.cargarVideo(c);
  }

  /** Portada en video: si falla o no llega a tiempo, se queda la imagen. */
  private cargarVideo(c: Carta): void {
    const url = c.datos.video;
    if (!url) return;
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    c.video = video;
    const u = c.malla.material.uniforms;
    video.addEventListener(
      'canplay',
      () => {
        if (this.destruido || c.video !== video) return;
        const t = new THREE.VideoTexture(video);
        t.colorSpace = THREE.NoColorSpace;
        c.texturas.push(t);
        u.u_map.value = t;
        if (video.videoWidth > 0) u.u_mapAspect.value = video.videoWidth / video.videoHeight;
        void video.play().catch(() => undefined);
        this.sucio = true;
      },
      { once: true },
    );
    video.addEventListener('error', () => {
      c.video = null; // la imagen de portada ya está puesta
    });
  }

  /** Hay un video reproduciéndose en alguna tarjeta: hay que dibujar cada cuadro. */
  get hayVideo(): boolean {
    return this.cartas.some((c) => c.video !== null && !c.video.paused);
  }

  // ---------- Medidas ----------

  /** Ajusta cámara, piso y render targets al tamaño de la ventana. */
  ajustar(): void {
    const ww = this.pista.ancho;
    const wh = this.pista.alto;
    this.camara.aspect = ww / wh;
    this.camara.updateProjectionMatrix();
    this.camara.updateMatrixWorld(true);
    this.H = Math.tan((FOV / 2) * (Math.PI / 180)) * CAM_Z;
    this.W = this.H * (ww / wh);
    this.uW.value = this.W;
    const r = this.pista.rects[0];
    const abajoPx = r && r.alto > 0 ? r.arriba + r.alto : wh * 0.7175;
    const yAbajo = ((wh / 2 - abajoPx) / (wh / 2)) * this.H;
    this.piso.ajustar(this.W, this.H, yAbajo, ww, wh, this.renderer.getPixelRatio());
    this.ajustarRT();
    // Con las texturas ya cargadas, el título y el disco se rehacen al nuevo tamaño de las tarjetas
    if (this.iniciado) this.cartas.forEach((c, i) => this.hacerOverlay(c, i));
    this.sucio = true;
  }

  private ajustarRT(): THREE.WebGLRenderTarget {
    this.renderer.getDrawingBufferSize(this.tam);
    const ancho = Math.max(1, this.tam.x);
    const alto = Math.max(1, this.tam.y);
    if (!this.mundoRT) {
      this.mundoRT = new THREE.WebGLRenderTarget(ancho, alto, { samples: MUESTRAS, depthBuffer: false });
    } else if (this.mundoRT.width !== ancho || this.mundoRT.height !== alto) {
      this.mundoRT.setSize(ancho, alto);
    }
    return this.mundoRT;
  }

  private asegurarPase(rt: THREE.WebGLRenderTarget) {
    if (this.pase) return this.pase;
    const geometria = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: { tMundo: { value: rt.texture } },
      vertexShader: PASE_VERTEX,
      fragmentShader: PASE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const malla = new THREE.Mesh(geometria, material);
    malla.frustumCulled = false;
    const escena = new THREE.Scene();
    escena.add(malla);
    this.pase = { escena, camara: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), geometria, material };
    return this.pase;
  }

  // ---------- Cuadro ----------

  /** Pone la pose y los uniformes de cada tarjeta a partir de la pista y la velocidad |V|. */
  actualizar(velocidad: number): void {
    const ww = this.pista.ancho;
    const wh = this.pista.alto;
    const vuelo = this.vuelo;
    this.uV.value = vuelo ? vuelo.velocidad0 : velocidad;
    this.piso.sincronizar();
    for (let i = 0; i < this.cartas.length; i++) {
      const c = this.cartas[i];
      const volando = vuelo !== null && vuelo.indice === i;
      const base = this.pista.rects[i];
      const r: RectTarjeta = volando && vuelo ? vuelo.rect() : { izq: base.izq + c.entrada.x, arriba: base.arriba, ancho: base.ancho, alto: base.alto };
      // Las tarjetas fuera de ±0,5 ventanas no se dibujan (K19)
      const visible = volando || (r.izq + r.ancho > -0.5 * ww && r.izq < 1.5 * ww);
      c.malla.visible = visible && c.malla.material.uniforms.u_alpha.value > 0.001;
      if (!visible) continue;
      const cx = ((r.izq + r.ancho / 2 - ww / 2) / (ww / 2)) * this.W;
      const cy = ((wh / 2 - (r.arriba + r.alto / 2)) / (wh / 2)) * this.H;
      const sx = (r.ancho / ww) * 2 * this.W;
      const sy = (r.alto / wh) * 2 * this.H;
      c.malla.position.set(cx, cy, 0);
      c.malla.scale.set(sx, sy, 1);
      c.malla.renderOrder = volando ? 5 : 0;
      const u = c.malla.material.uniforms;
      const p = volando && vuelo ? vuelo.p : 0;
      u.u_size.value.set(sx, sy);
      u.u_planeAspect.value = r.ancho / r.alto;
      u.u_corner.value = (ESQUINA_REM * this.pista.rem * (1 - p)) / r.alto;
      u.u_dent.value = HUECO_HOVER * sy;
      u.u_hover.value = c.hover.v;
      u.u_sheetP.value = 1 - p;
      u.u_shade.value = 1 - p;
      u.u_scrim.value = c.datos.slug ? 1 - p : 0;
      u.u_overlayA.value = 1 - p;
      u.u_alpha.value = volando ? 1 : c.alfa.v;
    }
  }

  /** Dibuja el mundo: reflejo del piso a 1/10, escena al render target de 4 muestras y copia a pantalla. */
  dibujar(): void {
    const renderer = this.renderer;
    if (this.destruido || !this.iniciado) return;
    this.sucio = false;
    const rt = this.ajustarRT();
    const pase = this.asegurarPase(rt);
    if (this.piso.visible) this.piso.dibujarReflejo(renderer, this.escena, this.camara);
    renderer.setRenderTarget(rt);
    renderer.render(this.escena, this.camara);
    renderer.setRenderTarget(null);
    renderer.render(pase.escena, pase.camara);
  }

  // ---------- Animaciones ----------

  /** Entrada de K19: las tarjetas llegan desde ±0,5 ventanas, escalonadas desde la más cercana al centro. */
  entrar(): Promise<void> {
    const ww = this.pista.ancho;
    this.iniciado = true;
    if (this.reducido()) {
      // Sin entrada: todo queda en su sitio de una vez
      this.piso.aparicion.v = 1;
      this.sucio = true;
      return Promise.resolve();
    }
    gsap.to(this.piso.aparicion, {
      v: 1,
      duration: PISO_ENTRADA.duracion,
      delay: PISO_ENTRADA.retraso,
      ease: 'power2.out',
      onUpdate: () => {
        this.sucio = true;
      },
    });
    const orden = this.cartas
      .map((_, i) => ({ i, d: Math.abs(this.pista.rects[i].izq + this.pista.rects[i].ancho / 2 - ww / 2) }))
      .sort((a, b) => a.d - b.d);
    return new Promise<void>((listo) => {
      orden.forEach(({ i }, lugar) => {
        const c = this.cartas[i];
        const r = this.pista.rects[i];
        const signo = r.izq + r.ancho / 2 < ww / 2 ? -1 : 1;
        c.entrada.x = signo * 0.5 * ww;
        gsap.to(c.entrada, {
          x: 0,
          duration: ENTRADA_DURACION,
          delay: ENTRADA_ARRANQUE + ENTRADA_ESCALONADO * lugar,
          ease: 'expo.out',
          onUpdate: () => {
            this.sucio = true;
          },
          onComplete: lugar === orden.length - 1 ? listo : undefined,
        });
      });
      this.sucio = true;
    });
  }

  /** La pieza bajo el puntero se ahueca (K11); -1 para ninguna. */
  ponerHover(indice: number): void {
    if (indice === this.hoverActual || this.reducido()) return;
    const anterior = this.hoverActual;
    this.hoverActual = indice;
    const mover = (c: Carta, v: number) =>
      gsap.to(c.hover, {
        v,
        duration: DURACION_HOVER,
        ease: 'expo.out',
        overwrite: true,
        onUpdate: () => {
          this.sucio = true;
        },
      });
    if (anterior >= 0) mover(this.cartas[anterior], 0);
    if (indice >= 0) mover(this.cartas[indice], 1);
  }

  get volando(): boolean {
    return this.vuelo !== null;
  }

  get vueloTerminado(): boolean {
    return this.vuelo?.terminado === true;
  }

  /** Inicia el vuelo de la tarjeta `indice` hasta `destino` (px CSS). */
  volar(indice: number, destino: RectTarjeta, velocidad: number): void {
    if (this.vuelo) return;
    const base = this.pista.rects[indice];
    const c = this.cartas[indice];
    const origen: RectTarjeta = { izq: base.izq + c.entrada.x, arriba: base.arriba, ancho: base.ancho, alto: base.alto };
    this.ponerHover(-1);
    this.vuelo = new Vuelo(indice, origen, destino, velocidad);
    // Lo demás se apaga: tarjetas en 0,3 s y piso en 0,45 s (power1.out)
    const marcar = () => {
      this.sucio = true;
    };
    this.cartas.forEach((otra, i) => {
      if (i === indice) return;
      gsap.to(otra.alfa, { v: 0, duration: APAGADO_TARJETAS, ease: 'power1.out', onUpdate: marcar });
    });
    gsap.to(this.piso.aparicion, { v: 0, duration: APAGADO_PISO, ease: 'power1.out', overwrite: true, onUpdate: marcar });
    this.vuelo.iniciar(() => {
      this.sucio = true;
    });
    this.sucio = true;
  }

  /** Cancela el vuelo y deja la cinta como estaba. */
  cancelarVuelo(): void {
    if (!this.vuelo) return;
    this.vuelo.cancelar();
    this.vuelo = null;
    const marcar = () => {
      this.sucio = true;
    };
    for (const c of this.cartas) {
      gsap.to(c.alfa, { v: 1, duration: APAGADO_TARJETAS, ease: 'power1.out', overwrite: true, onUpdate: marcar });
    }
    gsap.to(this.piso.aparicion, { v: 1, duration: APAGADO_PISO, ease: 'power1.out', overwrite: true, onUpdate: marcar });
    this.sucio = true;
  }

  dispose(): void {
    this.destruido = true;
    this.vuelo?.cancelar();
    for (const c of this.cartas) {
      gsap.killTweensOf([c.hover, c.entrada, c.alfa]);
      c.malla.material.dispose();
      for (const t of c.texturas) t.dispose();
      c.overlay?.dispose();
      if (c.video) {
        c.video.pause();
        c.video.removeAttribute('src');
        c.video.load();
        c.video = null;
      }
    }
    gsap.killTweensOf(this.piso.aparicion);
    this.geometria.dispose();
    this.vacia.dispose();
    this.piso.dispose();
    if (this.pase) {
      this.pase.geometria.dispose();
      this.pase.material.dispose();
      this.pase = null;
    }
    this.mundoRT?.dispose();
    this.mundoRT = null;
  }
}
