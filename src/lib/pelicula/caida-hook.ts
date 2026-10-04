/**
 * Efectos de «La Caída» entre el home (N1) y el menú (N2), amarrados al progreso del scroll.
 *
 * `scroll.ts` calcula el progreso (0 = N1 completo, 1 = N2 completo) y lo notifica aquí. Esta
 * función lo refleja en el DOM: `data-caida` y `data-caida-menu` en el body y el destello crema.
 * Sigue el scroll con un `scroll` de la ventana, sin ScrollTrigger (D2).
 */

export type OyenteCaida = (progreso: number) => void;

const oyentes = new Set<OyenteCaida>();
let ultimoProgreso = 0;

/**
 * Avisa a quien quiera seguir la caída (el home: la tinta y el lavado) sin abrir otro listener de
 * scroll. Llama al oyente de una vez con el progreso actual y devuelve la función para soltarlo.
 */
export function suscribirProgresoCaida(oyente: OyenteCaida): () => void {
  oyentes.add(oyente);
  oyente(ultimoProgreso);
  return () => {
    oyentes.delete(oyente);
  };
}

/**
 * Notifica el progreso actual del scroll y actualiza los efectos de la caída.
 * Invocado por el controlador de scroll de la película.
 */
export function notificarProgresoCaida(progreso: number): void {
  const normalizado = Math.max(0, Math.min(1, progreso));
  ultimoProgreso = normalizado;
  oyentes.forEach((oyente) => oyente(normalizado));

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
}
