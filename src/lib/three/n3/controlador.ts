/**
 * Controlador del N3: une la pista DOM, el scroll virtual y el mundo WebGL en un solo reloj.
 *
 * Cada cuadro (`tick`, llamado por gsap.ticker desde el gestor de escena): el scroll avanza con su
 * inercia, la pista escribe las posiciones, el mundo toma esas poses y dibuja. Con la cinta quieta y
 * sin hover no se dibuja ni se escribe nada en el DOM. Nada aquí abre su propio requestAnimationFrame.
 */
import gsap from 'gsap';
import type * as THREE from 'three';
import { Pista } from '@/lib/n3/pista';
import { ScrollVirtual } from '@/lib/n3/scroll';
import { rectPortadaN4 } from '@/lib/n4/portada';
import { cancelarVueloIda, entregarVueloIda, iniciarVueloIda } from '@/lib/navigation/vuelo';
import { MundoN3, type DatosTarjeta } from './mundo';

// K14: el HUD se apaga en 0,3 s con power1.out al abrir un caso
const HUD_APAGADO = 0.3;

export interface TarjetaDom extends DatosTarjeta {
  el: HTMLElement;
}

export interface EntradaControlador {
  act: HTMLElement;
  contenedor: HTMLElement;
  hud: HTMLElement | null;
  tarjetas: TarjetaDom[];
  /** Tarjeta que queda centrada al entrar (si no, la primera de un caso real). */
  slugInicial: string | null;
  reducido: () => boolean;
  /** Pieza de la que se viene de regreso volando desde su caso: queda quieta en su sitio al entrar. */
  regresoDe: string | null;
  /** El vuelo aterrizó y ya se entregó su relevo al caso: el mundo puede soltarse. */
  alTerminarVuelo: (slug: string) => void;
}

export class ControladorN3 {
  private readonly pista: Pista;
  private readonly scroll: ScrollVirtual;
  private readonly mundo: MundoN3;
  private readonly control = new AbortController();
  private ultimo = 0;
  private ultPosicion = '';
  private ultVelocidad = '';
  private punteroX = -1;
  private punteroY = -1;
  private hoverPosible: boolean;
  private notificado = false;
  private destruido = false;
  private slugEnVuelo: string | null = null;
  private indiceEnVuelo = -1;
  private ultVuelo = '';
  /** El contenedor del canvas persistente: ahí se publica `data-vuelo` (el `ClientRouter` reemplaza el de <html>). */
  private readonly contenedorCanvas: HTMLElement | null;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly e: EntradaControlador,
  ) {
    this.contenedorCanvas = renderer.domElement.parentElement;
    this.hoverPosible = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    this.pista = new Pista(
      e.contenedor,
      e.tarjetas.map((t) => t.el),
    );
    this.pista.medir();
    this.scroll = new ScrollVirtual({
      ancho: () => this.pista.ancho,
      alto: () => this.pista.alto,
      reducido: e.reducido,
      bloqueado: () => this.mundo.volando,
      vecina: (d) => this.scroll.irA(this.pista.paraVecina(d, this.scroll.t)),
      alCambiarArrastre: (arrastrando) => {
        e.act.classList.toggle('n3-arrastrando', arrastrando);
        if (arrastrando) this.mundo.ponerHover(-1);
      },
    });
    // Al entrar, el primer caso real (o el de origen) queda centrado
    this.scroll.saltarA(this.pista.centradaExacta(this.indiceInicial(e.slugInicial)));
    this.pista.aplicar(this.scroll.a);
    this.mundo = new MundoN3(renderer, this.pista, e.tarjetas, e.reducido);

    const { signal } = this.control;
    this.scroll.conectar(signal);
    window.addEventListener('pointermove', this.alPuntero, { signal });
    document.documentElement.addEventListener('mouseleave', this.alSalirPuntero, { signal });
    // Una tarjeta que recibe el foco (Tab) viene al centro por el camino corto del bucle
    e.contenedor.addEventListener('focusin', this.alFoco, { signal });
  }

  private indiceInicial(slug: string | null): number {
    const porSlug = slug ? this.e.tarjetas.findIndex((t) => t.slug === slug) : -1;
    if (porSlug >= 0) return porSlug;
    const primera = this.e.tarjetas.findIndex((t) => t.slug !== null);
    return primera >= 0 ? primera : 0;
  }

  /** Carga las texturas, corre la entrada y declara `data-listo`. Siempre termina. */
  async iniciar(): Promise<void> {
    try {
      await this.mundo.cargar();
    } catch {
      // Toda espera tiene salida: sin alguna textura se sigue con el color de respaldo
    }
    if (this.destruido) return;
    this.publicar(true);
    const quieta = this.e.regresoDe ? this.e.tarjetas.findIndex((t) => t.slug === this.e.regresoDe) : -1;
    await this.mundo.entrar(quieta);
    if (this.destruido) return;
    this.mundo.listo = true;
    this.e.act.dataset.listo = '1';
  }

  /** Un cuadro del reloj único. */
  tick(ahora: number): void {
    if (this.destruido) return;
    const dt = this.ultimo === 0 ? 1 / 60 : (ahora - this.ultimo) / 1000;
    this.ultimo = ahora;
    if (!this.mundo.volando) {
      if (this.scroll.update(dt)) {
        this.pista.aplicar(this.scroll.a);
        this.publicar(false);
        this.mundo.sucio = true;
        this.actualizarHover();
      }
    }
    if (this.mundo.sucio || this.mundo.hayVideo) {
      this.mundo.actualizar(Math.abs(this.scroll.velocidad));
      this.mundo.dibujar();
    }
    if (this.mundo.volando && !this.notificado) this.publicarVuelo();
    // El vuelo terminó y ya se dibujó su último cuadro: se entrega la textura al caso (que ya está
    // montado o está por montar) y el mundo puede soltarse
    if (this.mundo.vueloTerminado && !this.notificado) {
      this.notificado = true;
      this.quitarVuelo();
      const slug = this.slugEnVuelo;
      if (slug) {
        entregarVueloIda(this.mundo.entregarRelevo(this.indiceEnVuelo));
        this.e.alTerminarVuelo(slug);
      }
    }
  }

  /** `data-vuelo` en el contenedor persistente: el progreso 0..1 del vuelo en curso. */
  private publicarVuelo(): void {
    const v = this.mundo.progresoVuelo.toFixed(3);
    if (v === this.ultVuelo || !this.contenedorCanvas) return;
    this.ultVuelo = v;
    this.contenedorCanvas.dataset.vuelo = v;
  }

  private quitarVuelo(): void {
    this.ultVuelo = '';
    if (this.contenedorCanvas) delete this.contenedorCanvas.dataset.vuelo;
  }

  /** El vuelo sigue en curso (o aterrizó pero todavía no se entregó): el mundo no se puede soltar. */
  get vueloPendiente(): boolean {
    return this.mundo.volando && !this.notificado;
  }

  /** Escribe data-posicion y data-velocidad solo cuando cambian. */
  private publicar(forzar: boolean): void {
    const pos = this.scroll.a.toFixed(2);
    const v = this.scroll.velocidad;
    const vel = Math.abs(v) < 0.0005 ? '0' : v.toFixed(3);
    if (forzar || pos !== this.ultPosicion) {
      this.ultPosicion = pos;
      this.e.act.dataset.posicion = pos;
    }
    if (forzar || vel !== this.ultVelocidad) {
      this.ultVelocidad = vel;
      this.e.act.dataset.velocidad = vel;
    }
  }

  // ---------- Hover ----------

  private alPuntero = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'mouse') return;
    this.punteroX = ev.clientX;
    this.punteroY = ev.clientY;
    this.actualizarHover();
  };

  private alSalirPuntero = (): void => {
    this.punteroX = -1;
    this.punteroY = -1;
    this.mundo.ponerHover(-1);
  };

  private actualizarHover(): void {
    if (!this.hoverPosible || this.scroll.arrastrando || this.mundo.volando) return;
    this.mundo.ponerHover(this.punteroX < 0 ? -1 : this.pista.bajo(this.punteroX, this.punteroY));
  }

  // ---------- Foco ----------

  private alFoco = (ev: FocusEvent): void => {
    const destino = ev.target instanceof Element ? ev.target.closest('[data-n3-tarjeta]') : null;
    const i = this.e.tarjetas.findIndex((t) => t.el === destino);
    if (i >= 0 && !this.mundo.volando) this.scroll.irA(this.pista.paraCentrar(i, this.scroll.t));
  };

  // ---------- Del mundo al caso ----------

  /**
   * Inicia el vuelo de la pieza del caso (1,0 s). Devuelve false si no hay vuelo (movimiento reducido,
   * ventana angosta o tarjeta desconocida): quien llama navega directo. Si hay vuelo, quien llama
   * navega también, al clic: la página del caso monta mientras la pieza todavía vuela.
   */
  abrirCaso(slug: string): boolean {
    if (this.mundo.volando) return true;
    const i = this.e.tarjetas.findIndex((t) => t.slug === slug);
    const destino = rectPortadaN4(window.innerWidth);
    if (i < 0 || !destino || this.e.reducido()) return false;
    this.slugEnVuelo = slug;
    this.indiceEnVuelo = i;
    this.notificado = false;
    iniciarVueloIda(slug);
    this.e.act.classList.add('n3-volando');
    if (this.e.hud) gsap.to(this.e.hud, { opacity: 0, duration: HUD_APAGADO, ease: 'power1.out' });
    this.mundo.volar(i, { izq: destino.x, arriba: destino.y, ancho: destino.width, alto: destino.height }, Math.abs(this.scroll.velocidad));
    return true;
  }

  get volando(): boolean {
    return this.mundo.volando;
  }

  /** Esc o el atrás del navegador: el vuelo se cancela y la cinta queda como estaba. */
  cancelarVuelo(): void {
    if (!this.mundo.volando) return;
    this.mundo.cancelarVuelo();
    this.slugEnVuelo = null;
    this.quitarVuelo();
    cancelarVueloIda();
    this.e.act.classList.remove('n3-volando');
    if (this.e.hud) {
      gsap.killTweensOf(this.e.hud);
      gsap.set(this.e.hud, { clearProps: 'opacity' });
    }
  }

  /** Deja centrada la pieza de origen al volver de un caso. */
  centrarEn(slug: string): boolean {
    const i = this.e.tarjetas.findIndex((t) => t.slug === slug);
    if (i < 0) return false;
    this.scroll.saltarA(this.pista.centradaExacta(i));
    this.pista.aplicar(this.scroll.a);
    this.publicar(false);
    this.mundo.sucio = true;
    return true;
  }

  alRedimensionar(): void {
    // Con la pieza volando la página ya puede ser la del caso: la pista del N3 no se vuelve a medir
    if (this.destruido || this.mundo.volando) return;
    // La tarjeta que estaba en el centro sigue ahí después de medir otra vez
    const ancla = this.pista.ancla();
    this.pista.medir();
    if (!this.mundo.volando) this.scroll.saltarA(this.pista.paraAncla(ancla.indice, ancla.fraccion));
    this.pista.aplicar(this.scroll.a);
    this.publicar(false);
    this.mundo.ajustar();
  }

  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    this.control.abort();
    if (this.e.hud) {
      gsap.killTweensOf(this.e.hud);
      gsap.set(this.e.hud, { clearProps: 'opacity' });
    }
    this.e.act.classList.remove('n3-volando', 'n3-arrastrando');
    this.quitarVuelo();
    this.mundo.dispose();
  }
}
