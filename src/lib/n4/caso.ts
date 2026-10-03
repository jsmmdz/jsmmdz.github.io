/**
 * El caso de estudio (N4) como plantilla (T32): la historia contada en cristales de vidrio por la mitad
 * izquierda y, a la derecha, la foto de cada paso fundida con la siguiente al ritmo del scroll (la
 * sección roja de Zero, su capítulo 2). Une el scroll virtual, el título, el anillo, los cristales y la
 * foto en WebGL, y la entrada y el regreso de la pieza en un solo reloj (`gsap.ticker`).
 *
 * Funciona sin WebGL (la historia se lee en HTML y la foto es una imagen con fundido de opacidad), con
 * movimiento reducido (los cristales no suben: se funden en su sitio) y en pantalla angosta (la misma
 * escena con la foto arriba). Esta clase no importa three: el mundo WebGL llega después con
 * `adjuntarMundo`.
 */
import gsap from 'gsap';
import { ro } from '@/lib/n3/curva-ro';
import { rectTarjetaCentrada } from '@/lib/n3/medidas';
import {
  alEntregarVueloIda,
  llegueVolandoA,
  marcarRegreso,
  olvidarLlegada,
  terminarVueloIda,
  tomarRelevo,
  vueloIdaEnCurso,
} from '@/lib/navigation/vuelo';
import type { ConfigMundo, EstadoMundo, MundoN4 } from '@/lib/three/n4/mundo';
import { Anillo } from './anillo';
import { barrer, quitarBarrido } from './barrido';
import { opacidadDelPaso } from './cristales';
import { disposicion, TITULO_ANCHO_REM, TITULO_TAMANO_REM, type Disposicion } from './geometria';
import { TIPOS_PASO, type PasoVista } from './historia';
import { posHistoria, presenciaDS, totalTramos, tramoDelPaso } from './design-system';
import { estadoDelMedio } from './medios';
import { N4_MEDIO } from './portada';
import { pasoEn, ScrollCaso } from './scroll';
import { ajustarTitulo, fuenteDelTituloLista } from './titulo';

// La entrada, contada desde el clic que abrió el caso (K14 y ZK3): el título desde 0,44 s; «← Volver»
// desde 0,5 s; el anillo desde 0,575 s. Las cortinas esperan a que aterrice la pieza (1,0 s) para que el
// vuelo se siga viendo sobre negro; en enlace directo entran con el caso.
const ENTRADA = {
  titulo: 0.44,
  volver: { desde: 0.5, duracion: 0.85 },
  anillo: { desde: 0.575, duracion: 0.85 },
  fondo: { despuesDelVuelo: 1.0, duracion: 0.4 },
};
// Regreso (K14): la pieza vuela 1,0 s con «ro»; lo demás se apaga en 0,3 s
const DURACION_REGRESO = 1.0;
const APAGADO_REGRESO = 0.3;
// El título se va cuando la posición cruza 0,5·P (en 0,3 s) y vuelve al regresar
const TITULO_SE_VA_EN = 0.5;
const TITULO_FUNDIDO = 0.3;
// El ratón mueve el paralaje con una constante de tiempo de 0,12 s (K9)
const TAU_RATON = 0.12;
// Con la escena animándose sola (balanceo y grano), se dibuja a 30 cuadros por segundo
const INTERVALO_ANIMADO_MS = 1000 / 30 - 2;
// Toda espera tiene salida
const ESPERA_MEDIO_MAX_MS = 6000;
const ESPERA_RELEVO_MAX_MS = 1800;

const CONTROLES = 'a[href], button, input, select, textarea, [contenteditable]';

export interface OpcionesCaso {
  /** Contenedor del canvas persistente (donde se publica `data-vuelo`). */
  contenedor: HTMLElement | null;
}

export class CasoN4 {
  private readonly control = new AbortController();
  private readonly pasosDom: HTMLElement[];
  /** El design system (antes del resultado), si el caso lo trae: la sección, su título, cada color y las fuentes. */
  private readonly dsDom: HTMLElement | null;
  private readonly tituloDS: HTMLElement | null;
  private readonly coloresDom: HTMLElement[];
  private readonly fuentesDom: HTMLElement | null;
  private readonly fuentesLis: HTMLElement[];
  private tituloDSEscrito = '';
  private cajaFuentesEscrita = '';
  private tamanoFuentes: { w: number; h: number } | null = null;
  private readonly titulo: HTMLElement | null;
  /** Las fotos: la portada (medio −1) y la de cada paso, en ese orden. */
  private readonly medios: HTMLImageElement[];
  private readonly volver: HTMLElement | null;
  private readonly contAnillo: HTMLElement | null;
  private readonly anillo: Anillo | null;
  private readonly scroll: ScrollCaso;
  private readonly mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly escrito: Record<string, string> = {};
  private readonly cajasEscritas: string[] = [];
  /** El tamaño fijo (CSS) de la copia de cada paso: se mide al montar y al cambiar la ventana, no por cuadro. */
  private tamanosCopia: Array<{ w: number; h: number }> = [];
  private tamanosColor: Array<{ w: number; h: number }> = [];
  private readonly cajasColorEscritas: string[] = [];
  /** Lo que animan los fundidos de entrada y de salida: la opacidad de las cortinas y de los cristales. */
  private readonly alfas = { fondo: 0, cristales: 1 };
  private readonly raton = { x: 0, y: 0, objX: 0, objY: 0 };
  private mundo: MundoN4 | null = null;
  private conWebgl = false;
  private primerDibujo = false;
  private esperandoRelevo = false;
  private quitarEscucha: (() => void) | null = null;
  private tramoPrevio = 0;
  private ultimo = 0;
  private ultimoDibujo = 0;
  private tiempo = 0;
  private cuadro = 0;
  private tituloVisible = true;
  private tweenTitulo: gsap.core.Tween | null = null;
  private volando = false;
  private promesaRegreso: Promise<void> | null = null;
  private readonly llamadas: gsap.core.Tween[] = [];
  private entradaLista = false;
  private medioListo = false;
  /** Las cortinas ya entraron (o no hay): en enlace directo arrancan con el primer dibujo. */
  private fondoListo = false;
  private fondoPorArrancar = false;
  private destruido = false;
  private iniciado = false;

  constructor(
    private readonly act: HTMLElement,
    private readonly opc: OpcionesCaso,
  ) {
    this.pasosDom = Array.from(act.querySelectorAll<HTMLElement>('[data-n4-paso]'));
    this.dsDom = act.querySelector<HTMLElement>('[data-n4-ds]');
    this.tituloDS = act.querySelector<HTMLElement>('[data-n4-ds-titulo]');
    this.coloresDom = Array.from(act.querySelectorAll<HTMLElement>('[data-n4-color]'));
    this.fuentesDom = act.querySelector<HTMLElement>('[data-n4-fuentes]');
    this.fuentesLis = Array.from(act.querySelectorAll<HTMLElement>('[data-n4-fuente]'));
    this.titulo = act.querySelector<HTMLElement>('h1');
    this.medios = Array.from(act.querySelectorAll<HTMLImageElement>('img[data-n4-medio]')).sort((a, b) => Number(a.dataset.n4Medio) - Number(b.dataset.n4Medio));
    this.volver = act.querySelector<HTMLElement>('a[data-n4-volver]');
    this.contAnillo = act.querySelector<HTMLElement>('[data-n4-anillo]');
    this.scroll = new ScrollCaso({
      alto: () => window.innerHeight,
      pasos: () => Math.max(1, this.pasosDom.length),
      extra: () => (this.dsDom ? 1 : 0),
      bloqueado: () => this.volando || this.enVueloDeIda,
      focoEnControl: () => document.activeElement?.closest(CONTROLES) != null,
      esControl: (destino) => destino instanceof Element && destino.closest(CONTROLES) != null,
    });
    this.anillo = this.contAnillo ? new Anillo(this.contAnillo) : null;
  }

  /** La pieza todavía vuela desde el mundo hasta la foto: los controles esperan su aterrizaje. */
  private get enVueloDeIda(): boolean {
    const v = vueloIdaEnCurso();
    return v !== null && !v.entregado && !v.cancelado;
  }

  /** 1 rem del N4 en px. */
  private remPx(): number {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  get reducido(): boolean {
    return this.mq.matches;
  }

  get angosto(): boolean {
    return window.innerWidth < N4_MEDIO.anchoMinEscritorioPx;
  }

  /** La posición de la historia sin el tramo del design system (la foto y el paso activo salen de ella). */
  private posHistoria(): number {
    return posHistoria(this.scroll.pos, this.scroll.tramo, this.pasosDom.length, this.dsDom !== null);
  }

  /** Cuánto se ve el design system (0 a 1). */
  private presenciaDS(): number {
    return presenciaDS(this.scroll.pos, this.scroll.tramo, this.pasosDom.length, this.dsDom !== null);
  }

  /** Las fotos de respaldo (la portada y una por paso), de donde el mundo WebGL saca sus texturas. */
  get imagenesDeMedios(): HTMLImageElement[] {
    return this.medios;
  }

  /** Lo que el mundo necesita saber del caso: los pasos que se imprimen, el color de fondo y el del texto. */
  configMundo(): ConfigMundo {
    const pasos: PasoVista[] = this.pasosDom.map((li) => ({
      tipo: TIPOS_PASO.find((t) => t === li.dataset.tipo) ?? 'idea',
      destacado: li.querySelector('.n4-paso-destacado')?.textContent?.trim() || undefined,
      texto: li.querySelector('.n4-paso-texto')?.textContent?.trim() ?? '',
    }));
    const hex = /^#([0-9a-f]{6})$/i.exec(this.act.dataset.fondo ?? '')?.[1] ?? '000000';
    const canal = (i: number) => parseInt(hex.slice(2 * i, 2 * i + 2), 16) / 255;
    const estilo = getComputedStyle(this.act);
    return {
      pasos,
      fondo: [canal(0), canal(1), canal(2)],
      colorTexto: estilo.getPropertyValue('--color-texto-claro').trim() || estilo.color,
      colorOscuro: estilo.getPropertyValue('--color-texto-oscuro').trim() || 'black',
      designSystem: this.dsDom
        ? {
            paleta: this.coloresDom.map((li) => li.dataset.hex ?? ''),
            fuentes: this.fuentesLis.map((li) => ({ nombre: li.dataset.nombre ?? '', uso: li.dataset.uso ?? '' })),
          }
        : null,
    };
  }

  /** ¿Se puede volar de regreso a la cinta? Con WebGL, sin movimiento reducido y si se llegó volando. */
  puedeVolarAl(destino: URL): boolean {
    if (!this.mundo || !this.iniciado || this.reducido || this.destruido) return false;
    if (!llegueVolandoA(this.act.dataset.project ?? '')) return false;
    const mundoUrl = this.volver ? new URL(this.volver.getAttribute('href') ?? '', window.location.href) : null;
    const norm = (p: string) => p.replace(/\/+$/, '');
    return mundoUrl !== null && norm(mundoUrl.pathname) === norm(destino.pathname);
  }

  // ---------- Arranque ----------

  iniciar(): void {
    const act = this.act;
    this.iniciado = true;
    act.classList.add('n4-iniciado');
    act.classList.toggle('n4-angosto', this.angosto);
    // Si la pieza viene volando, el canvas ya está dibujándola: la foto HTML no puede taparla
    if (vueloIdaEnCurso()) act.classList.add('n4-con-webgl');
    this.tramoPrevio = this.scroll.tramo;
    this.medios.forEach((m, k) => {
      m.style.opacity = k === 0 ? '1' : '0';
    });
    this.alfas.fondo = this.reducido ? 1 : 0;
    this.anillo?.progreso(0);
    this.publicar(true);

    const { signal } = this.control;
    this.scroll.conectar(signal);
    window.addEventListener('resize', this.alRedimensionar, { signal });
    window.addEventListener('pointermove', this.alRaton, { signal });
    document.documentElement.addEventListener('mouseleave', this.alSalirRaton, { signal });
    gsap.ticker.add(this.tick);

    this.entrar();
    void fuenteDelTituloLista().then(() => {
      if (!this.destruido) this.ajustarTitulo();
    });
    document.fonts?.addEventListener?.('loadingdone', this.ajustarTitulo, { signal });
    // Toda espera tiene salida: sin la foto cargada (o sin el primer dibujo) se declara listo igual
    this.llamadas.push(
      gsap.delayedCall(ESPERA_MEDIO_MAX_MS / 1000, () => {
        this.medioCargado();
        if (this.fondoPorArrancar) this.entrarFondo(0);
      }),
    );
  }

  private ajustarTitulo = (): void => {
    if (!this.titulo) return;
    if (this.angosto) {
      // En angosto el título puede ocupar más de una línea: el CSS fija su tamaño
      this.titulo.style.removeProperty('font-size');
      return;
    }
    const rem = this.remPx();
    ajustarTitulo(this.titulo, TITULO_ANCHO_REM * rem, TITULO_TAMANO_REM * rem);
  };

  /** La entrada: título, «← Volver», anillo y cortinas, contados desde el clic que abrió el caso. */
  private entrar(): void {
    const vuelo = vueloIdaEnCurso();
    const transcurrido = vuelo ? Math.max(0, (performance.now() - vuelo.tClic) / 1000) : 0;
    // Si la página monta después de lo previsto, cada entrada arranca al montar
    const e = (desde: number) => Math.max(0, desde - transcurrido);
    const remPx = this.remPx();

    if (this.reducido) {
      this.anillo?.entrar(0, 0, true);
      this.fondoListo = true;
      this.entradaLista = true;
      this.intentarListo();
      return;
    }

    const fines: number[] = [];
    if (this.titulo) {
      this.tweenTitulo = barrer(this.titulo, e(ENTRADA.titulo), remPx);
      fines.push(e(ENTRADA.titulo) + this.tweenTitulo.duration());
    }
    if (this.volver) {
      const el = this.volver;
      gsap.fromTo(
        el,
        { opacity: 0 },
        {
          opacity: 1,
          duration: ENTRADA.volver.duracion,
          delay: e(ENTRADA.volver.desde),
          ease: 'expo.out',
          onComplete: () => {
            gsap.set(el, { clearProps: 'opacity' });
          },
        },
      );
      fines.push(e(ENTRADA.volver.desde) + ENTRADA.volver.duracion);
    }
    this.anillo?.entrar(e(ENTRADA.anillo.desde), ENTRADA.anillo.duracion, false);
    fines.push(e(ENTRADA.anillo.desde) + ENTRADA.anillo.duracion);
    // Las cortinas: tras el aterrizaje de la pieza o, en enlace directo, con el primer dibujo
    if (vuelo) this.entrarFondo(e(ENTRADA.fondo.despuesDelVuelo));
    else this.fondoPorArrancar = true;
    this.llamadas.push(
      gsap.delayedCall(Math.max(...fines), () => {
        this.entradaLista = true;
        this.intentarListo();
      }),
    );
  }

  /** Las cortinas entran con un fundido de 0,4 s, `espera` segundos después de ahora. */
  private entrarFondo(espera: number): void {
    this.fondoPorArrancar = false;
    gsap.to(this.alfas, {
      fondo: 1,
      duration: ENTRADA.fondo.duracion,
      delay: espera,
      ease: 'none',
      onUpdate: () => {
        if (this.mundo) this.mundo.sucio = true;
      },
      onComplete: () => {
        this.fondoListo = true;
        this.intentarListo();
      },
    });
  }

  private intentarListo(): void {
    if (this.entradaLista && this.medioListo && this.fondoListo) this.act.dataset.listo = '1';
  }

  /** La portada está cargada (imagen o primer dibujo del plano). */
  private medioCargado(): void {
    if (this.medioListo) return;
    this.medioListo = true;
    this.intentarListo();
  }

  // ---------- El mundo WebGL ----------

  /** Sin WebGL: la historia se lee en HTML y la foto es la imagen con fundido de opacidad. */
  sinWebgl(): void {
    this.act.classList.add('n4-sin-webgl');
    this.act.classList.remove('n4-con-webgl');
    this.mundo = null;
    this.conWebgl = false;
    terminarVueloIda();
    for (const li of [...this.pasosDom, ...this.coloresDom, ...(this.fuentesDom ? [this.fuentesDom] : [])]) li.style.removeProperty('transform');
    this.cajasEscritas.length = 0;
    this.cajasColorEscritas.length = 0;
    // Sin escena, el fondo es el color plano del caso y el título se ve de una vez
    this.alfas.fondo = 1;
    this.fondoListo = true;
    this.fondoPorArrancar = false;
    this.aplicarRespaldoDom();
    const img = this.medios[0];
    if (!img || (img.complete && img.naturalWidth > 0)) {
      this.medioCargado();
      return;
    }
    img.addEventListener('load', () => this.medioCargado(), { once: true, signal: this.control.signal });
    img.addEventListener('error', () => this.medioCargado(), { once: true, signal: this.control.signal });
  }

  /** El mundo WebGL ya existe: se le da su disposición y se espera el relevo del vuelo, si lo hay. */
  adjuntarMundo(mundo: MundoN4): void {
    if (this.destruido) return;
    this.mundo = mundo;
    this.conWebgl = true;
    this.medirMundo();
    const vuelo = vueloIdaEnCurso();
    if (vuelo) {
      // La pieza todavía vuela (o aterrizó) sobre el canvas: la foto HTML no puede taparla
      this.act.classList.add('n4-con-webgl');
      if (vuelo.entregado) {
        this.aplicarRelevo();
      } else {
        this.esperandoRelevo = true;
        this.quitarEscucha = alEntregarVueloIda(() => {
          this.aplicarRelevo();
        });
      }
    }
    void mundo.cargar().then(() => {
      if (this.destruido) return;
      mundo.sucio = true;
    });
  }

  private aplicarRelevo(): void {
    this.quitarEscucha?.();
    this.quitarEscucha = null;
    const relevo = tomarRelevo();
    if (relevo && this.mundo) this.mundo.recibirRelevo(relevo);
    else relevo?.textura.dispose();
    terminarVueloIda();
    this.esperandoRelevo = false;
    if (this.mundo) this.mundo.sucio = true;
  }

  private rectFoto() {
    const r = (this.medios[0] ?? this.act).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  private calcularDisposicion(): Disposicion {
    return disposicion(this.act.clientWidth || window.innerWidth, this.act.clientHeight || window.innerHeight, this.rectFoto());
  }

  private medirMundo(): void {
    const d = this.calcularDisposicion();
    // En angosto el título se centra en el espacio de debajo de la foto: el CSS lo lee de aquí
    if (d.angosto) this.act.style.setProperty('--n4-meseta-y', `${d.mesetaY.toFixed(1)}px`);
    else this.act.style.removeProperty('--n4-meseta-y');
    this.mundo?.ajustar(d);
  }

  private estadoMundo(): EstadoMundo {
    const m = estadoDelMedio(this.posHistoria(), this.scroll.tramo, this.pasosDom.length);
    return {
      medio: m.medio,
      mezcla: m.mezcla,
      pos: this.scroll.pos,
      tramo: this.scroll.tramo,
      reducido: this.reducido,
      alfaFondo: this.alfas.fondo,
      alfaCristales: this.alfas.cristales,
      tiempo: this.tiempo,
      cuadro: this.cuadro,
      raton: { x: this.raton.x, y: this.raton.y },
    };
  }

  private dibujarAhora(): void {
    if (!this.mundo) return;
    this.mundo.actualizar(this.estadoMundo());
    this.mundo.dibujar();
    this.aplicarCajas();
  }

  // ---------- Un cuadro del reloj único ----------

  private tick = (): void => {
    if (this.destruido) return;
    const ahora = performance.now();
    const dt = this.ultimo === 0 ? 1 / 60 : Math.min(0.25, (ahora - this.ultimo) / 1000);
    this.ultimo = ahora;
    if (!this.reducido) {
      this.tiempo += dt;
      this.cuadro++;
      const k = 1 - Math.exp(-dt / TAU_RATON);
      this.raton.x += (this.raton.objX - this.raton.x) * k;
      this.raton.y += (this.raton.objY - this.raton.y) * k;
    }
    let cambio = false;
    if (!this.volando && this.scroll.update(dt)) {
      this.alCambiarPosicion();
      cambio = true;
    }
    this.publicar(false);
    const mundo = this.mundo;
    if (!mundo || this.esperandoRelevo || !mundo.medioListo) return;
    const animandose = mundo.animado && ahora - this.ultimoDibujo >= INTERVALO_ANIMADO_MS;
    if (cambio || mundo.sucio || this.volando || animandose) {
      this.ultimoDibujo = ahora;
      this.dibujarAhora();
      if (!this.primerDibujo) {
        this.primerDibujo = true;
        this.act.classList.add('n4-con-webgl');
        this.medioCargado();
        if (this.fondoPorArrancar) this.entrarFondo(0);
      }
    }
  };

  /** La posición cambió: título, anillo y respaldo DOM. */
  private alCambiarPosicion(): void {
    const debeVerse = this.scroll.pos < TITULO_SE_VA_EN * this.scroll.tramo;
    if (debeVerse !== this.tituloVisible) {
      this.tituloVisible = debeVerse;
      this.moverTitulo(debeVerse);
    }
    this.anillo?.progreso(this.scroll.progreso);
    if (!this.conWebgl || !this.primerDibujo) this.aplicarRespaldoDom();
  }

  /** El título se va (o vuelve) con un fundido de 0,3 s; sigue en el DOM. */
  private moverTitulo(ver: boolean): void {
    const el = this.titulo;
    if (!el) return;
    // Un barrido de entrada a medias se corta: el título vuelve entero
    this.tweenTitulo?.kill();
    this.tweenTitulo = null;
    quitarBarrido(el);
    gsap.to(el, { opacity: ver ? 1 : 0, duration: this.reducido ? 0 : TITULO_FUNDIDO, ease: 'power1.out', overwrite: true });
  }

  /** Escribe la caja proyectada de cada cristal en su copia del DOM (solo cuando cambia). */
  private aplicarCajas(): void {
    const mundo = this.mundo;
    if (!mundo) return;
    if (this.tamanosCopia.length !== this.pasosDom.length) this.medirCopias();
    this.pasosDom.forEach((li, k) => {
      const c = mundo.cajas[k];
      if (!c) return;
      // La copia tiene un tamaño fijo (CSS): se escala para que su caja sea la del cristal
      const { w: w0, h: h0 } = this.tamanosCopia[k];
      const v = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${(c.ancho / w0).toFixed(4)}, ${(c.alto / h0).toFixed(4)})`;
      if (this.cajasEscritas[k] !== v) {
        this.cajasEscritas[k] = v;
        li.style.transform = v;
      }
    });
    // La copia de cada color de la paleta sigue la caja de su cristal, igual que los pasos
    if (this.tamanosColor.length !== this.coloresDom.length) this.tamanosColor = this.coloresDom.map((li) => ({ w: li.offsetWidth || 1, h: li.offsetHeight || 1 }));
    this.coloresDom.forEach((li, i) => {
      const c = mundo.cajasPaleta[i];
      if (!c) return;
      const { w: w0, h: h0 } = this.tamanosColor[i];
      const v = c.opacidad > 0 ? `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${(c.ancho / w0).toFixed(4)}, ${(c.alto / h0).toFixed(4)})` : '';
      if (this.cajasColorEscritas[i] !== v) {
        this.cajasColorEscritas[i] = v;
        if (v) li.style.transform = v;
        else li.style.removeProperty('transform');
      }
    });
    // Las tipografías: su copia sigue la caja de su cristal
    if (this.fuentesDom) {
      const c = mundo.cajaFuentes;
      if (!this.tamanoFuentes) this.tamanoFuentes = { w: this.fuentesDom.offsetWidth || 1, h: this.fuentesDom.offsetHeight || 1 };
      const { w: w0, h: h0 } = this.tamanoFuentes;
      const v = c.opacidad > 0 ? `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${(c.ancho / w0).toFixed(4)}, ${(c.alto / h0).toFixed(4)})` : '';
      if (v !== this.cajaFuentesEscrita) {
        this.cajaFuentesEscrita = v;
        if (v) this.fuentesDom.style.transform = v;
        else this.fuentesDom.style.removeProperty('transform');
      }
    }
    // «Design system»: encima de la sección, alineado con el borde izquierdo de la paleta; aparece con ella
    if (this.tituloDS) {
      const visibles = [...mundo.cajasPaleta, mundo.cajaFuentes].filter((c) => c.opacidad > 0);
      const alfa = visibles.length > 0 ? this.presenciaDS() : 0;
      const colores = mundo.cajasPaleta.filter((c) => c.opacidad > 0);
      const x = colores.length ? Math.min(...colores.map((c) => c.x)) : 0;
      const y = visibles.length ? Math.min(...visibles.map((c) => c.y)) : 0;
      const v = alfa > 0 ? `${x.toFixed(1)}|${(y - 5 * this.remPx()).toFixed(1)}|${alfa.toFixed(3)}` : '';
      if (v !== this.tituloDSEscrito) {
        this.tituloDSEscrito = v;
        const el = this.tituloDS;
        if (v) {
          const [tx, ty, ta] = v.split('|');
          el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          el.style.opacity = ta;
        } else {
          el.style.removeProperty('transform');
          el.style.removeProperty('opacity');
        }
      }
    }
  }

  private medirCopias(): void {
    this.tamanosCopia = this.pasosDom.map((li) => ({ w: li.offsetWidth || 1, h: li.offsetHeight || 1 }));
  }

  /** Respaldo sin WebGL: la foto base opaca y la siguiente encima, y cada paso con la opacidad de su fundido. */
  private aplicarRespaldoDom(): void {
    const n = this.pasosDom.length;
    const ds = this.dsDom !== null;
    const { medio, mezcla } = estadoDelMedio(this.posHistoria(), this.scroll.tramo, n);
    const visible = 1 - this.presenciaDS();
    this.medios.forEach((m, i) => {
      // La imagen i es el medio i − 1 (la portada es el medio −1); se desvanece con el design system
      const k = i - 1;
      const v = (k === medio ? 1 : k === medio + 1 ? mezcla : 0) * visible;
      const s = String(Math.round(v * 1000) / 1000);
      if (m.style.opacity !== s) m.style.opacity = s;
    });
    if (!this.conWebgl) {
      // Con design system, el resultado se corre un tramo y la sección tiene el suyo
      const tramos = totalTramos(n, ds);
      this.pasosDom.forEach((li, k) => {
        const s = String(Math.round(opacidadDelPaso(tramoDelPaso(k, n, ds), this.scroll.pos, this.scroll.tramo, tramos) * 1000) / 1000);
        if (li.style.opacity !== s) li.style.opacity = s;
      });
      if (this.dsDom) {
        const s = String(Math.round((1 - visible) * 1000) / 1000);
        if (this.dsDom.style.opacity !== s) this.dsDom.style.opacity = s;
      }
    }
  }

  /** Escribe los `data-*` del caso solo cuando cambian (con la escena quieta no hay escrituras). */
  private publicar(forzar: boolean): void {
    const posH = this.posHistoria();
    const { medio, mezcla } = estadoDelMedio(posH, this.scroll.tramo, this.pasosDom.length);
    const valores: Record<string, string> = {
      posicion: this.scroll.pos.toFixed(2),
      objetivo: this.scroll.objetivo.toFixed(2),
      paso: String(pasoEn(posH, this.scroll.tramo, this.pasosDom.length)),
      ds: this.presenciaDS().toFixed(3),
      // La transición entre fotos (1 si no hay ninguna en curso)
      transicion: (this.mundo?.progresoTransicion ?? 1).toFixed(3),
      // Cuánto se inclina la foto con el scroll (rad)
      giro: (this.mundo?.giroFoto ?? 0).toFixed(3),
      progreso: this.scroll.progreso.toFixed(4),
      medio: String(medio),
      mezcla: mezcla.toFixed(3),
    };
    for (const [k, v] of Object.entries(valores)) {
      if (forzar || this.escrito[k] !== v) {
        this.escrito[k] = v;
        this.act.dataset[k] = v;
      }
    }
  }

  // ---------- Ratón y ventana ----------

  private alRaton = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse' || this.reducido) return;
    this.raton.objX = (ev.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    this.raton.objY = (ev.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
  };

  private alSalirRaton = (): void => {
    this.raton.objX = 0;
    this.raton.objY = 0;
  };

  /**
   * La ventana cambió de tamaño (también cuando cruza los 1024 px con el caso abierto, E2): se vuelve a
   * medir todo y el modo que toque (escritorio o angosto) sigue con el caso donde estaba.
   */
  private alRedimensionar = (): void => {
    if (this.destruido) return;
    this.act.classList.toggle('n4-angosto', this.angosto);
    this.scroll.reescalar(this.tramoPrevio);
    this.tramoPrevio = this.scroll.tramo;
    this.ajustarTitulo();
    this.anillo?.medir();
    this.cajasEscritas.length = 0;
    this.cajasColorEscritas.length = 0;
    this.tituloDSEscrito = '';
    this.cajaFuentesEscrita = '';
    this.tamanoFuentes = null;
    this.tamanosCopia = [];
    this.tamanosColor = [];
    this.medirMundo();
    this.alCambiarPosicion();
    this.publicar(false);
  };

  // ---------- El regreso: la pieza vuela de vuelta a su sitio en la cinta ----------

  /** Espera (con tope) a que el N3 entregue el relevo del vuelo de ida, si todavía vuela. */
  private esperarRelevo(): Promise<void> {
    if (!this.esperandoRelevo) return Promise.resolve();
    return new Promise<void>((listo) => {
      const inicio = performance.now();
      const revisar = () => {
        if (!this.esperandoRelevo || performance.now() - inicio > ESPERA_RELEVO_MAX_MS) listo();
        else this.llamadas.push(gsap.delayedCall(0.05, revisar));
      };
      revisar();
    });
  }

  /**
   * «← Volver», Esc o el atrás del navegador: la foto vuela hasta la pose de su tarjeta en la cinta en
   * 1,0 s con la curva «ro», recalculando la pose cada cuadro; el texto, los cristales, el anillo y las
   * cortinas se apagan en 0,3 s. Se resuelve al aterrizar; después se navega al mundo.
   */
  volarDeRegreso(): Promise<void> {
    if (this.promesaRegreso) return this.promesaRegreso;
    this.promesaRegreso = (async () => {
      await this.esperarRelevo();
      const mundo = this.mundo;
      if (!mundo || this.destruido) return;
      this.volando = true;
      this.tweenTitulo?.kill();
      const apagables = [this.titulo, this.contAnillo, this.volver].filter((el): el is HTMLElement => el !== null);
      gsap.to(apagables, { opacity: 0, duration: APAGADO_REGRESO, ease: 'power1.out', overwrite: true });
      gsap.to(this.alfas, { fondo: 0, cristales: 0, duration: APAGADO_REGRESO, ease: 'power1.out', overwrite: true });
      const aspecto = Number(this.act.dataset.aspectoPortada) || N4_MEDIO.proporcion;
      mundo.prepararRegreso(rectTarjetaCentrada(window.innerWidth, window.innerHeight, aspecto), this.remPx());
      const contenedor = this.opc.contenedor;
      await new Promise<void>((resolver) => {
        const estado = { v: 0 };
        const poner = () => {
          const p = ro(estado.v);
          mundo.ponerRegreso(p);
          if (contenedor) contenedor.dataset.vuelo = p.toFixed(3);
        };
        poner();
        gsap.to(estado, {
          v: 1,
          duration: DURACION_REGRESO,
          ease: 'none',
          onUpdate: poner,
          onComplete: () => {
            poner();
            // El último cuadro se dibuja antes de navegar: el canvas lo conserva hasta que el mundo monte
            this.dibujarAhora();
            if (contenedor) delete contenedor.dataset.vuelo;
            resolver();
          },
        });
      });
      marcarRegreso(this.act.dataset.project ?? '');
    })();
    return this.promesaRegreso;
  }

  // ---------- Fin ----------

  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    olvidarLlegada();
    this.control.abort();
    gsap.ticker.remove(this.tick);
    this.quitarEscucha?.();
    this.quitarEscucha = null;
    for (const l of this.llamadas) l.kill();
    this.tweenTitulo?.kill();
    this.anillo?.destruir();
    const objetivos = [this.titulo, this.volver, this.contAnillo].filter((el): el is HTMLElement => el !== null);
    gsap.killTweensOf(objetivos);
    gsap.killTweensOf(this.alfas);
    if (this.opc.contenedor) delete this.opc.contenedor.dataset.vuelo;
  }
}
