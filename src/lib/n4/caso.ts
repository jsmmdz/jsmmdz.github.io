/**
 * El caso de estudio (N4): la exposición por capítulos de Zero en dos columnas, con el anillo y la
 * curvatura de Landberg. Une el scroll virtual, el texto de cada capítulo, la regla, el anillo, el
 * medio en WebGL y la entrada y el regreso de la pieza en un solo reloj (`gsap.ticker`).
 *
 * Funciona sin WebGL (el medio es entonces una imagen HTML con fundido de opacidad) y con movimiento
 * reducido (sin curvatura ni entradas animadas). Con la escena quieta no escribe en el DOM ni dibuja.
 * Esta clase no importa three: el mundo WebGL llega después con `adjuntarMundo`.
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
import type { MundoN4 } from '@/lib/three/n4/mundo';
import { barrer, TextoCapitulos } from './barrido';
import { estadoDelMedio } from './medios';
import { N4_MEDIO } from './portada';
import { Anillo, Regla } from './regla';
import { ScrollCaso } from './scroll';
import { ajustarTitulo, fuenteDelTituloLista } from './titulo';

// La entrada, contada desde el clic que abrió el caso (K14 y ZK3): el texto desde 0,44 s; «← Volver» y
// la regla desde 0,5 s; el anillo desde 0,575 s
const ENTRADA = {
  texto: 0.44,
  volver: { desde: 0.5, duracion: 0.85 },
  regla: { desde: 0.5, duracion: 0.6 },
  anillo: { desde: 0.575, duracion: 0.85 },
};
// Regreso (K14): la pieza vuela 1,0 s con «ro»; lo demás se apaga en 0,3 s
const DURACION_REGRESO = 1.0;
const APAGADO_REGRESO = 0.3;
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
  private readonly bloques: HTMLElement[];
  private readonly titulo: HTMLElement | null;
  private readonly medios: HTMLImageElement[];
  private readonly volver: HTMLElement | null;
  private readonly navRegla: HTMLElement | null;
  private readonly contAnillo: HTMLElement | null;
  private readonly regla: Regla | null;
  private readonly anillo: Anillo | null;
  private readonly texto: TextoCapitulos;
  private readonly scroll: ScrollCaso;
  private readonly mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly escrito: Record<string, string> = {};
  private mundo: MundoN4 | null = null;
  private conWebgl = false;
  private primerDibujo = false;
  private esperandoRelevo = false;
  private quitarEscucha: (() => void) | null = null;
  private quitarEscuchaRegla: (() => void) | null = null;
  private capituloActual = 0;
  private tramoPrevio = 0;
  private ultimo = 0;
  private volando = false;
  private promesaRegreso: Promise<void> | null = null;
  private readonly llamadas: gsap.core.Tween[] = [];
  private entradaLista = false;
  private medioListo = false;
  private destruido = false;
  private iniciado = false;

  constructor(
    private readonly act: HTMLElement,
    private readonly opc: OpcionesCaso,
  ) {
    this.bloques = Array.from(act.querySelectorAll<HTMLElement>('[data-n4-capitulo]'));
    this.titulo = act.querySelector<HTMLElement>('h1');
    this.medios = Array.from(act.querySelectorAll<HTMLImageElement>('img[data-n4-medio]'));
    this.volver = act.querySelector<HTMLElement>('a[data-n4-volver]');
    this.navRegla = act.querySelector<HTMLElement>('[data-n4-regla]');
    this.contAnillo = act.querySelector<HTMLElement>('[data-n4-anillo]');
    this.texto = new TextoCapitulos(this.bloques, { remPx: () => this.remPx(), reducido: () => this.reducido });
    this.scroll = new ScrollCaso({
      alto: () => window.innerHeight,
      capitulos: () => Math.max(1, this.bloques.length),
      bloqueado: () => this.volando || this.enVueloDeIda,
      focoEnControl: () => document.activeElement?.closest(CONTROLES) != null,
    });
    this.regla = this.navRegla ? new Regla(this.navRegla, (k) => this.scroll.irAlCapitulo(k), this.control.signal) : null;
    this.anillo = this.contAnillo ? new Anillo(this.contAnillo) : null;
  }

  /** La pieza todavía vuela desde el mundo hasta este medio: los controles esperan su aterrizaje. */
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

  /** Las imágenes de respaldo de los medios (una por capítulo), de donde el mundo WebGL saca sus texturas. */
  get imagenesDeMedios(): HTMLImageElement[] {
    return this.medios;
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
    if (window.innerWidth < N4_MEDIO.anchoMinEscritorioPx) {
      // Ventana angosta: página apilada con scroll normal (el responsive queda fuera del MVP)
      act.classList.add('n4-estrecho');
      act.dataset.listo = '1';
      terminarVueloIda();
      return;
    }
    this.iniciado = true;
    act.classList.add('n4-iniciado');
    // Si la pieza viene volando, el canvas ya está dibujándola: el medio HTML no puede taparla
    if (vueloIdaEnCurso()) act.classList.add('n4-con-webgl');
    this.tramoPrevio = this.scroll.tramo;
    this.medios.forEach((m, k) => {
      m.style.opacity = k === 0 ? '1' : '0';
    });
    this.regla?.marcarActivo(0);
    // Los rótulos de la regla no se usan mientras vuela la pieza (ida o regreso)
    if (this.enVueloDeIda) {
      this.regla?.habilitar(false);
      this.quitarEscuchaRegla = alEntregarVueloIda(() => this.regla?.habilitar(true));
    }
    this.regla?.actualizar(0, window.innerHeight);
    this.anillo?.progreso(0);
    this.publicar(true);

    const { signal } = this.control;
    this.scroll.conectar(signal);
    window.addEventListener('resize', this.alRedimensionar, { signal });
    gsap.ticker.add(this.tick);

    this.texto.preparar();
    this.entrar();
    void fuenteDelTituloLista().then(() => {
      if (!this.destruido) this.ajustarTitulo();
    });
    document.fonts?.addEventListener?.('loadingdone', this.ajustarTitulo, { signal });
    // Toda espera tiene salida: sin el medio cargado se declara listo igual
    this.llamadas.push(gsap.delayedCall(ESPERA_MEDIO_MAX_MS / 1000, () => this.medioCargado()));
  }

  private ajustarTitulo = (): void => {
    if (this.titulo) ajustarTitulo(this.titulo, this.remPx());
  };

  /** La entrada: título y capítulo 0, «← Volver», regla y anillo, contados desde el clic que abrió el caso. */
  private entrar(): void {
    const vuelo = vueloIdaEnCurso();
    const transcurrido = vuelo ? Math.max(0, (performance.now() - vuelo.tClic) / 1000) : 0;
    // Si la página monta después de lo previsto, cada entrada arranca al montar
    const e = (desde: number) => Math.max(0, desde - transcurrido);
    const remPx = this.remPx();

    if (this.reducido) {
      this.texto.entrar(0, 0);
      this.anillo?.entrar(0, 0, true);
      this.entradaLista = true;
      this.intentarListo();
      return;
    }

    const fines: number[] = [];
    if (this.titulo) barrer(this.titulo, e(ENTRADA.texto), remPx);
    this.texto.entrar(0, e(ENTRADA.texto));
    fines.push(e(ENTRADA.texto) + 4);
    for (const [el, t] of [
      [this.volver, ENTRADA.volver],
      [this.navRegla, ENTRADA.regla],
    ] as const) {
      if (!el) continue;
      gsap.fromTo(
        el,
        { opacity: 0 },
        {
          opacity: 1,
          duration: t.duracion,
          delay: e(t.desde),
          ease: el === this.volver ? 'expo.out' : 'power2.out',
          onComplete: () => {
            gsap.set(el, { clearProps: 'opacity' });
          },
        },
      );
      fines.push(e(t.desde) + t.duracion);
    }
    this.anillo?.entrar(e(ENTRADA.anillo.desde), ENTRADA.anillo.duracion, false);
    fines.push(e(ENTRADA.anillo.desde) + ENTRADA.anillo.duracion);
    this.llamadas.push(
      gsap.delayedCall(Math.max(...fines), () => {
        this.entradaLista = true;
        this.intentarListo();
      }),
    );
  }

  private intentarListo(): void {
    if (this.entradaLista && this.medioListo) this.act.dataset.listo = '1';
  }

  /** El medio 0 está cargado (imagen o primer dibujo del plano). */
  private medioCargado(): void {
    if (this.medioListo) return;
    this.medioListo = true;
    this.intentarListo();
  }

  // ---------- El mundo WebGL ----------

  /** Sin WebGL: el medio es la imagen HTML y el fundido es de opacidad. */
  sinWebgl(): void {
    this.act.classList.add('n4-sin-webgl');
    this.act.classList.remove('n4-con-webgl');
    this.mundo = null;
    this.conWebgl = false;
    terminarVueloIda();
    this.aplicarMediosDom();
    const img = this.medios[0];
    if (!img || (img.complete && img.naturalWidth > 0)) {
      this.medioCargado();
      return;
    }
    img.addEventListener('load', () => this.medioCargado(), { once: true, signal: this.control.signal });
    img.addEventListener('error', () => this.medioCargado(), { once: true, signal: this.control.signal });
  }

  /** El mundo WebGL ya existe: se le da su caja y se espera el relevo del vuelo, si lo hay. */
  adjuntarMundo(mundo: MundoN4): void {
    if (this.destruido) return;
    this.mundo = mundo;
    this.conWebgl = true;
    this.medirMundo();
    const vuelo = vueloIdaEnCurso();
    if (vuelo) {
      // La pieza todavía vuela (o aterrizó) sobre el canvas: el medio HTML no puede taparla
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

  private cajaMedio() {
    const r = (this.medios[0] ?? this.act).getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  private medirMundo(): void {
    this.mundo?.ajustar(this.cajaMedio(), this.act.clientWidth || window.innerWidth, this.act.clientHeight || window.innerHeight);
  }

  private estadoMundo() {
    const m = estadoDelMedio(this.scroll.pos, this.scroll.tramo, this.bloques.length);
    return { medio: m.medio, mezcla: m.mezcla, desfase: this.scroll.objetivo - this.scroll.pos, reducido: this.reducido };
  }

  private dibujarAhora(): void {
    if (!this.mundo) return;
    this.mundo.actualizar(this.estadoMundo());
    this.mundo.dibujar();
  }

  // ---------- Un cuadro del reloj único ----------

  private tick = (): void => {
    if (this.destruido) return;
    const ahora = performance.now();
    const dt = this.ultimo === 0 ? 1 / 60 : (ahora - this.ultimo) / 1000;
    this.ultimo = ahora;
    let cambio = false;
    if (!this.volando && this.scroll.update(dt)) {
      this.alCambiarPosicion();
      cambio = true;
    }
    this.publicar(false);
    const mundo = this.mundo;
    if (!mundo || this.esperandoRelevo || !mundo.medioListo) return;
    if (cambio || mundo.sucio || this.volando) {
      mundo.actualizar(this.estadoMundo());
      mundo.dibujar();
      if (!this.primerDibujo) {
        this.primerDibujo = true;
        this.act.classList.add('n4-con-webgl');
        this.medioCargado();
      }
    }
  };

  /** La posición cambió: capítulo, regla, anillo y medio de respaldo. */
  private alCambiarPosicion(): void {
    const cap = this.scroll.capitulo;
    if (cap !== this.capituloActual) {
      this.capituloActual = cap;
      this.texto.cambiar(cap);
      this.regla?.marcarActivo(cap);
    }
    this.regla?.actualizar(this.scroll.pos, window.innerHeight);
    this.anillo?.progreso(this.scroll.progreso);
    if (!this.conWebgl || !this.primerDibujo) this.aplicarMediosDom();
  }

  /** Respaldo sin WebGL: el medio base opaco y el siguiente encima, con la opacidad de la mezcla. */
  private aplicarMediosDom(): void {
    const { medio, mezcla } = estadoDelMedio(this.scroll.pos, this.scroll.tramo, this.bloques.length);
    this.medios.forEach((m, k) => {
      const v = k === medio ? 1 : k === medio + 1 ? mezcla : 0;
      const s = String(Math.round(v * 1000) / 1000);
      if (m.style.opacity !== s) m.style.opacity = s;
    });
  }

  /** Escribe los `data-*` del caso solo cuando cambian (con la escena quieta no hay escrituras). */
  private publicar(forzar: boolean): void {
    const { medio, mezcla } = estadoDelMedio(this.scroll.pos, this.scroll.tramo, this.bloques.length);
    const valores: Record<string, string> = {
      posicion: this.scroll.pos.toFixed(2),
      objetivo: this.scroll.objetivo.toFixed(2),
      capitulo: String(this.scroll.capitulo),
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

  private alRedimensionar = (): void => {
    if (this.destruido) return;
    this.scroll.reescalar(this.tramoPrevio);
    this.tramoPrevio = this.scroll.tramo;
    this.ajustarTitulo();
    this.anillo?.medir();
    this.alCambiarPosicion();
    this.medirMundo();
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
   * «← Volver», Esc o el atrás del navegador: el plano del medio vuela hasta la pose de su tarjeta en la
   * cinta en 1,0 s con la curva «ro», recalculando la pose cada cuadro; el texto, la regla y el anillo se
   * apagan en 0,3 s. Se resuelve al aterrizar; después se navega al mundo.
   */
  volarDeRegreso(): Promise<void> {
    if (this.promesaRegreso) return this.promesaRegreso;
    this.promesaRegreso = (async () => {
      await this.esperarRelevo();
      const mundo = this.mundo;
      if (!mundo || this.destruido) return;
      this.volando = true;
      this.regla?.habilitar(false);
      const apagables = [this.titulo, ...this.bloques, this.navRegla, this.contAnillo, this.volver].filter((el): el is HTMLElement => el !== null);
      gsap.to(apagables, { opacity: 0, duration: APAGADO_REGRESO, ease: 'power1.out', overwrite: true });
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
    this.quitarEscuchaRegla?.();
    this.quitarEscuchaRegla = null;
    for (const l of this.llamadas) l.kill();
    this.texto.destruir();
    this.anillo?.destruir();
    const objetivos = [this.titulo, this.volver, this.navRegla, this.contAnillo].filter((el): el is HTMLElement => el !== null);
    gsap.killTweensOf(objetivos);
    if (this.opc.contenedor) delete this.opc.contenedor.dataset.vuelo;
  }
}
