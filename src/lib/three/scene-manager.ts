/**
 * Gestor de escena Three.js: el renderer, el reloj único y el menú circular (N2).
 *
 * Una escena persistente en #webgl-canvas-container:
 * - N2 (Aikawa): el cilindro de tarjetas de vidrio, dibujado directo a pantalla, sin antialias.
 * - N3 (Landberg): el mundo de la disciplina vive en `lib/three/n3/` (la cinta, el piso y el vuelo);
 *   aquí solo se monta, se le da el reloj y se desmonta. No se cambia nada del N2 para eso.
 * - N4 (caso de estudio): la foto, las cortinas y los cristales del caso viven en `lib/three/n4/`; los
 *   dibuja el controlador del caso (`lib/n4/caso.ts`) con su propio paso del reloj único. Aquí solo se
 *   monta y se desmonta. Mientras la pieza todavía vuela del N3 al N4 conviven los dos mundos: el N3 se
 *   suelta al aterrizar.
 * - Un solo reloj: gsap.ticker mueve el render (y Lenis, en el home); no hay rAF propio.
 * - Antialias por nivel (D4): el contexto se crea sin antialias (N2, como Aikawa) y el mundo N3 se
 *   dibuja en un render target de 4 muestras que se copia a pantalla (como Landberg).
 * - Sin hex suelto: colores tomados de tokens CSS o rgb().
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { tomarRegreso } from '@/lib/navigation/vuelo';
import type { CasoN4 } from '@/lib/n4/caso';
import type { N2TarjetasManager } from './n2-tarjetas';
import type { ControladorN3, EntradaControlador } from './n3/controlador';
import type { MundoN4 } from './n4/mundo';

export interface N2DisciplinaItem {
  slug: string;
  nombre: string;
  orden: number;
  texturaSrc: string;
  posterSrc: string;
  tieneMundo: boolean;
}

export class ThreeSceneManager {
  private container: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private relojActivo: boolean = false;
  // Movimiento reducido: se lee una vez y se escucha su cambio, no en cada cuadro
  private mqReducido: MediaQueryList | null = null;
  private reducido: boolean = false;
  private isDisposed: boolean = false;
  private isPaused: boolean = false;
  private isN3Active: boolean = false;
  // El mundo de la disciplina (N3) y su montaje en curso
  private n3: ControladorN3 | null = null;
  private montajeN3: number = 0;
  // El N3 espera a soltarse hasta que su pieza termine de volar al caso (la página N4 ya montó)
  private n3SoltarAlTerminar: boolean = false;
  // El medio del caso (N4)
  private mundoN4: MundoN4 | null = null;
  private montajeN4: number = 0;

  // Estado y objetos de N2 (Menú circular Aikawa)
  private n2IsActive: boolean = false;
  private n2Camera: THREE.PerspectiveCamera | null = null;
  private n2Group: THREE.Group | null = null;
  private n2CylinderGroup: THREE.Group | null = null;
  private n2TarjetasManager: N2TarjetasManager | null = null;
  private n2TarjetasCargando: boolean = false;
  private n2CurrentAngle: number = 0;
  private n2TargetAngle: number = 0;
  private n2AnimStartTime: number = 0;
  private n2AnimStartAngle: number = 0;
  private n2IsAnimating: boolean = false;
  private n2OnSettledCallback: (() => void) | null = null;
  private n2RingToCylinderAnimating: boolean = false;
  private n2RingAnimStartTime: number = 0;
  private n2RingAnimDuration: number = 1600;

  private tempVec: THREE.Vector3 = new THREE.Vector3();
  private onContextLostCallback?: () => void;
  private eventsAttached: boolean = false;
  private needsRender: number = 3;

  public requestRender(frames: number = 3): void {
    this.needsRender = Math.max(this.needsRender, frames);
  }

  private iniciarReloj(): void {
    if (this.relojActivo) return;
    this.relojActivo = true;
    // Sin suavizado de lag: el tiempo de la animación sale de performance.now(), no del ticker
    gsap.ticker.lagSmoothing(0);
    gsap.ticker.add(this.tick);
  }

  private detenerReloj(): void {
    if (!this.relojActivo) return;
    this.relojActivo = false;
    gsap.ticker.remove(this.tick);
  }

  private tick = (): void => {
    this.animate(performance.now());
  };

  private ensureRenderer(container: HTMLElement): boolean {
    this.container = container;
    this.isDisposed = false;
    this.isPaused = false;
    this.attachEvents();
    this.iniciarReloj();

    if (this.renderer && container.contains(this.renderer.domElement)) {
      return true;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    try {
      let canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        canvas = document.createElement('canvas');
        container.innerHTML = '';
        container.appendChild(canvas);
      }

      // Los atributos del contexto se fijan aquí y en ningún otro lugar: nada llama a getContext
      // antes (un getContext previo crearía el contexto con antialias y esto se ignoraría).
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height);
      }

      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'auto';

      if (!this.scene) {
        this.scene = new THREE.Scene();
        this.scene.fog = null;
      }

      if (!this.n2Camera) {
        this.n2Camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        this.n2Camera.position.set(0, 0.25, 4.4); // pulido: más cerca, el cilindro ocupa ≈ 40 % del alto como en aikawa-05
        this.n2Camera.lookAt(0, 0.12, 0);
      }

      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        if (this.onContextLostCallback) this.onContextLostCallback();
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Monta el mundo de la disciplina (N3) sobre el canvas persistente. Devuelve el controlador o null
   * si no hay WebGL (el llamador cae al respaldo DOM). Las texturas cargan y la entrada corre sola:
   * el controlador declara `data-listo` cuando termina.
   */
  public async montarN3(
    container: HTMLElement,
    entrada: Omit<EntradaControlador, 'reducido' | 'regresoDe' | 'alTerminarVuelo'>,
    onContextLost?: () => void,
  ): Promise<ControladorN3 | null> {
    this.onContextLostCallback = onContextLost;
    this.desmontarN3();
    const turno = this.montajeN3;
    if (!this.ensureRenderer(container) || !this.renderer) return null;

    // Este contexto dibuja ahora el mundo N3 y no el cilindro de N2
    this.n2IsActive = false;
    if (this.n2Group) this.n2Group.visible = false;
    this.renderer.setClearColor(0x000000, 1);
    this.desmontarN4();

    const { ControladorN3 } = await import('./n3/controlador');
    // El visitante se fue mientras cargaba el módulo: no se monta nada
    if (turno !== this.montajeN3 || this.isDisposed || !this.renderer) return null;
    let controlador: ControladorN3;
    try {
      controlador = new ControladorN3(this.renderer, {
        ...entrada,
        // Si se viene de un caso, su pieza volvió volando: queda quieta en su sitio
        regresoDe: tomarRegreso(),
        reducido: () => this.reducido,
        alTerminarVuelo: () => this.alTerminarVueloN3(),
      });
    } catch {
      return null;
    }
    this.n3 = controlador;
    this.isN3Active = true;
    this.resume();
    void controlador.iniciar();
    return controlador;
  }

  /** Suelta el mundo N3 (listeners, tweens y recursos de GPU). */
  public desmontarN3(): void {
    this.montajeN3++;
    this.n3SoltarAlTerminar = false;
    if (this.n3) {
      this.n3.destruir();
      this.n3 = null;
    }
    this.isN3Active = false;
  }

  /**
   * Al irse de la página del mundo: si la pieza todavía vuela al caso, el mundo sigue vivo hasta que
   * aterrice (dibuja el vuelo sobre la página del caso, que ya montó); si no, se suelta ya.
   */
  public soltarN3(): void {
    if (this.n3?.vueloPendiente) {
      this.n3SoltarAlTerminar = true;
      return;
    }
    this.desmontarN3();
  }

  /** La pieza aterrizó y su textura ya se entregó al caso: si la página del mundo ya se fue, se suelta. */
  private alTerminarVueloN3(): void {
    if (this.n3SoltarAlTerminar) this.desmontarN3();
  }

  /**
   * Monta el mundo del caso (N4) sobre el canvas persistente. Devuelve false si no hay WebGL (el caso
   * cae al respaldo DOM). Si la pieza todavía vuela desde el N3, ese mundo sigue dibujándola y el caso
   * espera su relevo antes de dibujar.
   */
  public async montarN4(container: HTMLElement, caso: CasoN4, onContextLost?: () => void): Promise<boolean> {
    this.onContextLostCallback = onContextLost;
    this.desmontarN4();
    const turno = this.montajeN4;
    if (!this.ensureRenderer(container) || !this.renderer) return false;

    this.n2IsActive = false;
    if (this.n2Group) this.n2Group.visible = false;
    if (!this.n3?.volando) this.desmontarN3();
    this.renderer.setClearColor(0x000000, 1);

    const { MundoN4 } = await import('./n4/mundo');
    // El visitante se fue mientras cargaba el módulo: no se monta nada
    if (turno !== this.montajeN4 || this.isDisposed || !this.renderer) return false;
    let mundo: MundoN4;
    try {
      mundo = new MundoN4(
        this.renderer,
        caso.imagenesDeMedios.map((img) => ({ img })),
        caso.configMundo(),
      );
    } catch {
      return false;
    }
    this.mundoN4 = mundo;
    this.resume();
    caso.adjuntarMundo(mundo);
    return true;
  }

  /** Suelta el mundo del caso (texturas, render targets y geometrías). */
  public desmontarN4(): void {
    this.montajeN4++;
    if (this.mundoN4) {
      this.mundoN4.dispose();
      this.mundoN4 = null;
    }
  }

  public setupN2Menu(
    container: HTMLElement,
    disciplinas: N2DisciplinaItem[],
    initialSlug: string = 'web',
    onSettled?: () => void
  ): boolean {
    if (!this.ensureRenderer(container)) {
      return false;
    }

    this.setN2Active(true);

    if (!this.n2Group && this.scene) {
      this.n2Group = new THREE.Group();
      this.n2CylinderGroup = new THREE.Group();
      this.n2CylinderGroup.position.set(0, 0.2, 0); // pulido: sobre la base del titular (aikawa-05)
      this.n2Group.add(this.n2CylinderGroup);
      this.scene.add(this.n2Group);
    }

    const initialIdx = disciplinas.findIndex((d) => d.slug === initialSlug);
    const targetDeg = (initialIdx >= 0 ? initialIdx : 0) * 72;
    this.n2CurrentAngle = targetDeg;
    this.n2TargetAngle = targetDeg;
    this.n2IsAnimating = false;
    this.n2OnSettledCallback = onSettled || null;

    const hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
    if (document.body?.dataset.currentLevel === 'N2' || /^(web|motion|3d|videojuegos|editorial|disciplinas)$/.test(hash)) {
      this.setCylinderFormedImmediate();
    } else {
      this.prepareRingInitialState();
    }

    this.syncN2Angle();
    this.requestRender(4);

    // Pulido (auditoría T27 · E2): las tarjetas de vidrio se cargan y compilan sin bloquear. Si
    // quien llama esperara esta carga, el control del menú no respondería mientras compilan los
    // shaders (segundos en un equipo lento) y los clics en las flechas se perdían.
    if (this.n2TarjetasManager) {
      this.n2TarjetasManager.resetToReposo();
    } else {
      void this.cargarTarjetasN2(disciplinas);
    }
    return true;
  }

  private async cargarTarjetasN2(disciplinas: N2DisciplinaItem[]): Promise<void> {
    if (this.n2TarjetasCargando || !this.n2CylinderGroup || !this.renderer) return;
    this.n2TarjetasCargando = true;
    const { N2TarjetasManager } = await import('./n2-tarjetas');
    this.n2TarjetasCargando = false;
    if (this.isDisposed || this.n2TarjetasManager || !this.n2CylinderGroup || !this.renderer) return;
    this.n2TarjetasManager = new N2TarjetasManager(this.n2CylinderGroup);
    this.n2TarjetasManager.setupCards(disciplinas, this.renderer, (frames) => {
      this.requestRender(frames);
    });
    this.n2TarjetasManager.ordenarProfundidad(this.n2CurrentAngle);
    if (this.scene && this.n2Camera) {
      this.renderer.compile(this.scene, this.n2Camera);
    }
    this.requestRender(5);
  }

  private syncN2Angle(): void {
    if (this.n2CylinderGroup) {
      this.n2CylinderGroup.rotation.y = -THREE.MathUtils.degToRad(this.n2CurrentAngle);
    }
    this.n2TarjetasManager?.ordenarProfundidad(this.n2CurrentAngle);
    const actN2 = document.getElementById('act-n2');
    if (actN2) actN2.dataset.angulo = this.n2CurrentAngle.toFixed(2);
  }

  public updateCylinderBoundingBox(): void {
    if (!this.n2Camera || !this.container) return;
    if (this.n2TarjetasManager?.getIsExitAnimating()) {
      this.n2TarjetasManager.updateActiveCardBoundingBox(this.n2Camera, this.container);
      return;
    }
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.n2Camera.aspect = width / height;
    this.n2Camera.updateProjectionMatrix();

    const scaleY = this.n2CylinderGroup?.scale.y ?? 1;
    const R = 1.3;
    const H = 0.95 * scaleY;
    const yCenter = this.n2CylinderGroup?.position.y ?? 0.2; // sigue la posición real del cilindro
    const yMin = yCenter - H / 2;
    const yMax = yCenter + H / 2;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    // Puntos extremos visibles frontales
    for (let a = -90; a <= 90; a += 15) {
      const rad = (a * Math.PI) / 180;
      const x = R * Math.sin(rad);
      const z = R * Math.cos(rad);
      for (const y of [yMin, yMax]) {
        this.tempVec.set(x, y, z).project(this.n2Camera);
        const sx = (this.tempVec.x * 0.5 + 0.5) * width;
        const sy = (-this.tempVec.y * 0.5 + 0.5) * height;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }

    const ancho = Math.round(maxX - minX);
    const alto = Math.round(maxY - minY);
    const x = Math.round(minX);
    const y = Math.round(minY);

    const actN2 = document.getElementById('act-n2');
    if (actN2) {
      actN2.dataset.cilindro = `${x},${y},${ancho},${alto}`;
    }
  }

  /**
   * Transforma el anillo plano en cilindro en ≈ 1,6 s con curva ease-in-out (Aikawa paso 5 / T25).
   */
  public startRingToCylinderAnimation(durationMs: number = 1600): void {
    if (!this.n2CylinderGroup) return;
    this.n2RingToCylinderAnimating = true;
    this.n2TarjetasManager?.resetToReposo();
    this.n2RingAnimDuration = durationMs;
    this.n2RingAnimStartTime = performance.now();
    this.n2CylinderGroup.scale.y = 0.2;
    this.updateCylinderBoundingBox();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.opacity = '0';
    }
    this.resume();
    this.requestRender(120);
  }

  /**
   * Fija el cilindro ya formado (alto 100 %) y el titular visible al entrar directo o desde mundos.
   */
  public setCylinderFormedImmediate(): void {
    this.n2RingToCylinderAnimating = false;
    this.n2TarjetasManager?.resetToReposo();
    if (this.n2CylinderGroup) {
      this.n2CylinderGroup.scale.y = 1.0;
    }
    this.updateCylinderBoundingBox();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.opacity = '1';
    }
    this.requestRender(5);
  }

  /**
   * Prepara el estado inicial como anillo plano (< 35 % de alto) mientras se está en el home.
   */
  public prepareRingInitialState(): void {
    this.n2RingToCylinderAnimating = false;
    this.n2TarjetasManager?.resetToReposo();
    if (this.n2CylinderGroup) {
      this.n2CylinderGroup.scale.y = 0.2;
    }
    this.updateCylinderBoundingBox();

    const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
    if (titular) {
      titular.style.opacity = '0';
    }
    this.requestRender(5);
  }

  public rotateN2ToAngle(targetAngleDeg: number, onSettled?: () => void): void {
    if (!this.n2CylinderGroup) return;
    this.n2AnimStartAngle = this.n2CurrentAngle;
    this.n2TargetAngle = targetAngleDeg;
    this.n2AnimStartTime = performance.now();
    this.n2IsAnimating = true;
    this.n2OnSettledCallback = onSettled || null;
    this.resume();
    this.requestRender(90);
  }

  public getN2CurrentAngle(): number {
    return this.n2CurrentAngle;
  }

  public getCylinderBox(): { x: number; y: number; ancho: number; alto: number } {
    const p = (document.getElementById('act-n2')?.dataset.cilindro ?? '371,212,698,336').split(',').map(Number);
    return { x: p[0], y: p[1], ancho: p[2], alto: p[3] };
  }

  public startN2ExitAnimation(activeSlug: string, onComplete?: () => void): void {
    if (!this.n2TarjetasManager) {
      if (onComplete) onComplete();
      return;
    }
    this.n2TarjetasManager.startExitAnimation(activeSlug, onComplete);
    this.resume();
    this.requestRender(120);
  }

  private attachEvents(): void {
    if (this.eventsAttached) return;
    this.eventsAttached = true;

    this.mqReducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducido = this.mqReducido.matches;
    this.mqReducido.addEventListener('change', this.handleReducidoChange);

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleReducidoChange = (e: MediaQueryListEvent): void => {
    this.reducido = e.matches;
  };

  private handleResize = (): void => {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    if (this.n2Camera) {
      this.n2Camera.aspect = width / height;
      this.n2Camera.updateProjectionMatrix();
      this.updateCylinderBoundingBox();
    }
    this.renderer.setSize(width, height);
    this.n3?.alRedimensionar();
    this.requestRender(30);
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.pause();
    } else if (this.isN3Active || this.n2IsActive) {
      this.resume();
      this.requestRender(30);
    }
  };

  private animate = (now: number): void => {
    if (this.isDisposed) return;

    if (this.isPaused || document.hidden) return;

    if (this.n2IsActive) {
      if (this.n2IsAnimating) {
        const elapsed = now - this.n2AnimStartTime;
        const duration = 800;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        this.n2CurrentAngle = this.n2AnimStartAngle + (this.n2TargetAngle - this.n2AnimStartAngle) * ease;
        if (progress >= 1 || Math.abs(this.n2CurrentAngle - this.n2TargetAngle) < 0.04) {
          this.n2CurrentAngle = this.n2TargetAngle;
          this.n2IsAnimating = false;
          this.updateCylinderBoundingBox();
          if (this.n2OnSettledCallback) {
            const cb = this.n2OnSettledCallback;
            this.n2OnSettledCallback = null;
            cb();
          }
        }
        this.syncN2Angle();
        this.needsRender = Math.max(this.needsRender, 15);
      }

      if (this.n2RingToCylinderAnimating) {
        const elapsed = now - this.n2RingAnimStartTime;
        const duration = this.n2RingAnimDuration;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        // Curva ease-in-out cúbica con pico de velocidad hacia los ~0.75 s (Aikawa / T25)
        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const currentScale = 0.2 + (1.0 - 0.2) * ease;
        if (this.n2CylinderGroup) {
          this.n2CylinderGroup.scale.y = currentScale;
        }
        this.updateCylinderBoundingBox();

        // Pulido (spec § 4.0 Aikawa): el titular entra de 3,2 a 3,8 s en una transformación de 2,5 a
        // 4,1 s, es decir, entre 0,7 y 1,3 s de los 1,6 s (progreso 0,4375–0,8125), no durante toda.
        const titular = document.querySelector<HTMLElement>('[data-n2-titular]');
        if (titular) {
          const tramo = Math.min(1, Math.max(0, (progress - 0.4375) / 0.375));
          titular.style.opacity = (tramo * tramo * (3 - 2 * tramo)).toFixed(3);
        }

        if (progress >= 1) {
          this.n2RingToCylinderAnimating = false;
          if (this.n2CylinderGroup) {
            this.n2CylinderGroup.scale.y = 1.0;
          }
          this.updateCylinderBoundingBox();
          if (titular) {
            titular.style.opacity = '1';
          }
        }
        this.needsRender = Math.max(this.needsRender, 3);
      }

      if (this.n2TarjetasManager?.getIsExitAnimating()) {
        this.requestRender(10);
        const sigue = this.n2TarjetasManager.updateExitAnimation(
          now,
          this.n2Camera!,
          this.container!
        );
        if (sigue) {
          this.needsRender = Math.max(this.needsRender, 10);
        }
      }

      if (this.needsRender > 0) {
        this.needsRender--;
        if (this.n2Camera && this.renderer && this.scene) {
          this.renderer.render(this.scene, this.n2Camera);
        }
      }
      return;
    }

    // N3: el controlador lleva su propio estado y solo dibuja cuando algo cambió
    if (this.isN3Active) this.n3?.tick(now);
  };

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  public setN2Active(active: boolean): void {
    this.n2IsActive = active;
    if (active) {
      // Se sale del mundo N3 (o del caso): sus recursos se sueltan antes de que N2 use el mismo contexto
      this.desmontarN3();
      this.desmontarN4();
      if (this.scene) this.scene.background = null;
      if (this.renderer) {
        this.renderer.setRenderTarget(null);
        this.renderer.setClearColor(0x000000, 0);
      }
      if (this.n2Group) this.n2Group.visible = true;
      this.resume();
      this.requestRender(60);
    } else {
      if (this.n2Group) this.n2Group.visible = false;
    }
  }

  private detachEvents(): void {
    if (!this.eventsAttached) return;

    this.mqReducido?.removeEventListener('change', this.handleReducidoChange);
    this.mqReducido = null;

    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.eventsAttached = false;
  }

  public destroy(): void {
    this.isDisposed = true;
    this.detenerReloj();
    this.detachEvents();
    this.desmontarN3();
    this.desmontarN4();
    if (this.n2TarjetasManager) {
      this.n2TarjetasManager.dispose();
      this.n2TarjetasManager = null;
    }
    if (this.n2Group && this.scene) {
      this.scene.remove(this.n2Group);
      this.n2Group = null;
      this.n2CylinderGroup = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }
    this.scene = null;
    this.n2Camera = null;
    this.container = null;
  }
}

let instance: ThreeSceneManager | null = null;

export function getThreeSceneManager(): ThreeSceneManager {
  if (!instance) {
    instance = new ThreeSceneManager();
  }
  return instance;
}
