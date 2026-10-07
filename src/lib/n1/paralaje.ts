/**
 * El paralaje de dos capas de Digitalists (T36, ficha K4): el personaje y la capa de atrás (el titular, la
 * tinta y el video) se corren en sentidos opuestos con el ratón.
 *
 * Con `a = x / ancho − 0,5` y `l = y / alto − 0,5` (de −0,5 a 0,5):
 *   - el personaje se traslada (−60·a, −30·l) px, en contra del cursor (hasta ±30 / ±15 px);
 *   - la capa de atrás, (+30·a, +15·l) px, a favor (hasta ±15 / ±7,5 px);
 *   - cada movimiento llega en 0,5 s con `power2.out` (`gsap.quickTo`).
 * Sin ratón no se mueve nada, y con el ratón quieto tampoco: no hay animación en reposo. Con movimiento
 * reducido y en pantalla táctil no se monta.
 */
import gsap from 'gsap';

const PERSONAJE = { x: -60, y: -30 } as const;
const CAPA_ATRAS = { x: 30, y: 15 } as const;
const DURACION_S = 0.5;
const CURVA = 'power2.out';

export interface OpcionesParalaje {
  personaje: HTMLElement;
  capaAtras: HTMLElement;
  /** Solo se mueve mientras esto sea verdadero (en el home, no durante la caída ni en el menú). */
  activo: () => boolean;
}

export interface ControladorParalaje {
  destruir: () => void;
}

export function iniciarParalaje({ personaje, capaAtras, activo }: OpcionesParalaje): ControladorParalaje | null {
  // Sin ratón (pantalla táctil) no hay paralaje.
  if (window.matchMedia('(hover: none)').matches) return null;

  const ajustes = { duration: DURACION_S, ease: CURVA };
  const personajeX = gsap.quickTo(personaje, 'x', ajustes);
  const personajeY = gsap.quickTo(personaje, 'y', ajustes);
  const capaX = gsap.quickTo(capaAtras, 'x', ajustes);
  const capaY = gsap.quickTo(capaAtras, 'y', ajustes);

  const alMover = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || !activo()) return;
    const ancho = window.innerWidth || 1;
    const alto = window.innerHeight || 1;
    const a = e.clientX / ancho - 0.5;
    const l = e.clientY / alto - 0.5;
    personajeX(PERSONAJE.x * a);
    personajeY(PERSONAJE.y * l);
    capaX(CAPA_ATRAS.x * a);
    capaY(CAPA_ATRAS.y * l);
  };
  window.addEventListener('pointermove', alMover, { passive: true });

  return {
    destruir: (): void => {
      window.removeEventListener('pointermove', alMover);
      gsap.killTweensOf([personaje, capaAtras]);
      gsap.set([personaje, capaAtras], { clearProps: 'transform' });
    },
  };
}
