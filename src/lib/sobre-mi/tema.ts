/**
 * El tema Día / Noche de la sección (T45, K28): vive en `#act-sm[data-sm-tema]`, se decide antes de pintar
 * (`SobreMi.astro` lo escribe en el HTML) con la elección guardada en `localStorage` `sm-tema` y, si no hay, el
 * esquema del sistema, y solo cambia esta sección. El interruptor `button[data-sm-interruptor]` lleva `aria-pressed`
 * («Noche» activa) y guarda la elección.
 */

export type Tema = 'dia' | 'noche';

const CLAVE = 'sm-tema';

export interface ControladorTema {
  actual: () => Tema;
  destruir: () => void;
}

function guardado(): Tema | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'dia' || v === 'noche' ? v : null;
  } catch {
    return null;
  }
}

function delSistema(): Tema {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'noche' : 'dia';
}

export function iniciarTema(seccion: HTMLElement, alCambiar: (tema: Tema) => void): ControladorTema {
  const boton = seccion.querySelector<HTMLButtonElement>('button[data-sm-interruptor]');
  const abort = new AbortController();
  const { signal } = abort;
  let tema: Tema = guardado() ?? delSistema();

  const aplicar = (nuevo: Tema, aviso: boolean): void => {
    tema = nuevo;
    seccion.setAttribute('data-sm-tema', tema);
    boton?.setAttribute('aria-pressed', tema === 'noche' ? 'true' : 'false');
    if (aviso) alCambiar(tema);
  };
  aplicar(tema, false);

  boton?.addEventListener(
    'click',
    () => {
      const nuevo: Tema = tema === 'noche' ? 'dia' : 'noche';
      try {
        localStorage.setItem(CLAVE, nuevo);
      } catch {
        // Sin almacenamiento (ventana privada): el cambio vale solo para esta visita.
      }
      aplicar(nuevo, true);
    },
    { signal },
  );

  // Sin elección guardada, la sección sigue al sistema.
  const esquema = window.matchMedia('(prefers-color-scheme: dark)');
  esquema.addEventListener(
    'change',
    () => {
      if (guardado() === null) aplicar(delSistema(), true);
    },
    { signal },
  );

  return { actual: () => tema, destruir: () => abort.abort() };
}
