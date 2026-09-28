/**
 * Punto de enganche arquitectónico para «La Caída» (T15).
 * 
 * Contrato para T15 y T14:
 * - T19 establece el contenedor de scroll entre N1 y N2.
 * - T15 conectará aquí la animación de GSAP ScrollTrigger o deformación espacial
 *   durante el desplazamiento del home hacia el menú circular de disciplinas.
 * - Se preserva la regla de tuteo colombiano, cero datos inventados y tipado estricto.
 */

export type CaidaScrollCallback = (progreso: number) => void;

interface CaidaHookRegistry {
  callbacks: Set<CaidaScrollCallback>;
  progresoActual: number;
}

const registroCaida: CaidaHookRegistry = {
  callbacks: new Set<CaidaScrollCallback>(),
  progresoActual: 0,
};

/**
 * Registra un callback que se invocará con el progreso (0 = N1 completo, 1 = N2 completo).
 * Devuelve una función para desuscribirse.
 */
export function suscribirCaida(callback: CaidaScrollCallback): () => void {
  registroCaida.callbacks.add(callback);
  callback(registroCaida.progresoActual);
  return () => {
    registroCaida.callbacks.delete(callback);
  };
}

/**
 * Notifica a los observadores de la caída sobre el progreso actual del scroll.
 * Invocado por el controlador de scroll de la película.
 */
export function notificarProgresoCaida(progreso: number): void {
  const normalizado = Math.max(0, Math.min(1, progreso));
  registroCaida.progresoActual = normalizado;

  if (typeof document !== 'undefined') {
    if (document.body) {
      document.body.dataset.caida = Number(normalizado.toFixed(3)).toString();
      // Pulido: pasada la mitad (bajo el destello), la escena ya es el menú: el home se oculta y el
      // video del personaje aparece. Al disolverse el destello se ven el personaje y el anillo, no el
      // final del home con «JSMMDZ» cortado arriba.
      document.body.toggleAttribute('data-caida-menu', normalizado >= 0.5);
    }
    const destello = document.getElementById('caida-destello');
    if (destello) {
      // Destello crema #FAF8F5 a mitad de camino (Zero § 4.0 / T25)
      // Cubre toda la pantalla en crema sin blanco puro ni resplandor
      if (normalizado >= 0.20 && normalizado <= 0.80) {
        destello.style.visibility = 'visible';
        let opacidad = 0;
        if (normalizado < 0.35) {
          opacidad = (normalizado - 0.20) / 0.15;
        } else if (normalizado <= 0.65) {
          opacidad = 1;
        } else {
          opacidad = 1 - (normalizado - 0.65) / 0.15;
        }
        destello.style.opacity = Math.max(0, Math.min(1, opacidad)).toFixed(3);
      } else {
        destello.style.opacity = '0';
        destello.style.visibility = 'hidden';
      }
    }
  }

  registroCaida.callbacks.forEach((cb) => cb(normalizado));
}

/**
 * Obtiene el progreso actual de la caída (0 a 1).
 */
export function obtenerProgresoCaida(): number {
  return registroCaida.progresoActual;
}
