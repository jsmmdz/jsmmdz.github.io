/**
 * La entrada de los textos del home (T36): las columnas, las cifras, el botón y los enlaces suben desde su
 * máscara, uno tras otro, como las líneas de noth.in (ficha T33, K5: yPercent 100 → 0, 1 s power4.inOut,
 * stagger 0,05). Las cifras entran igual que el texto: no cuentan.
 *
 * Lo que sube lleva `data-n1-sube` y está dentro de una envoltura (`.n1-envoltura`). La envoltura solo recorta
 * mientras dura la entrada (`#act-n1[data-n1-entrando]`): después no recorta nada, para que el foco y los
 * subrayados no queden cortados. Sin esta entrada (movimiento reducido, sin WebGL, o el home ya visto) los
 * textos están en su sitio desde el primer cuadro.
 */
import gsap from 'gsap';

const ENTRADA = {
  desdeYPercent: 110,
  duracion: 1,
  curva: 'power4.inOut',
  cadaTexto: 0.05,
  // Sale junto con las letras del titular (lib/n1/titular.ts: retardo 0,2).
  retardo: 0.2,
} as const;

function textosDe(seccion: HTMLElement): HTMLElement[] {
  return Array.from(seccion.querySelectorAll<HTMLElement>('[data-n1-sube]'));
}

/** Deja los textos fuera de su máscara, listos para la entrada. */
export function esconderTextos(seccion: HTMLElement): void {
  seccion.setAttribute('data-n1-entrando', '');
  gsap.set(textosDe(seccion), { yPercent: ENTRADA.desdeYPercent });
}

/** Deja los textos enteros y sin transformaciones, y quita el recorte de las envolturas. */
export function mostrarTextos(seccion: HTMLElement): void {
  const textos = textosDe(seccion);
  gsap.killTweensOf(textos);
  gsap.set(textos, { clearProps: 'transform' });
  seccion.removeAttribute('data-n1-entrando');
}

/** La entrada de los textos. Devuelve la función que la cancela (y deja los textos a la vista). */
export function animarTextos(seccion: HTMLElement): () => void {
  const textos = textosDe(seccion);
  seccion.setAttribute('data-n1-entrando', '');
  const tween = gsap.fromTo(
    textos,
    { yPercent: ENTRADA.desdeYPercent },
    {
      yPercent: 0,
      duration: ENTRADA.duracion,
      ease: ENTRADA.curva,
      stagger: ENTRADA.cadaTexto,
      delay: ENTRADA.retardo,
      onComplete: () => mostrarTextos(seccion),
    },
  );
  return () => {
    tween.kill();
    mostrarTextos(seccion);
  };
}
