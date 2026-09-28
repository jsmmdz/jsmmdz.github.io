/**
 * Controlador del efecto máquina de escribir (R26) para el acto N1.
 * Escribe las líneas en vivo con cursor y preserva el historial atenuado arriba.
 * Las velocidades y pausas se leen desde los tokens de duración de tokens.css.
 */

export interface OpcionesTypewriter {
  contenedor: HTMLElement;
  lineas: readonly string[];
}

export interface ControladorTypewriter {
  destruir: () => void;
}

export function iniciarTypewriter(opciones: OpcionesTypewriter): ControladorTypewriter {
  const { contenedor, lineas } = opciones;

  if (!contenedor || lineas.length === 0) {
    return { destruir: () => {} };
  }

  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let destruido = false;
  let temporizadorId: number | undefined;

  const limpiar = () => {
    destruido = true;
    if (temporizadorId !== undefined) {
      window.clearTimeout(temporizadorId);
      temporizadorId = undefined;
    }
    mediaQuery.removeEventListener('change', manejarCambioMedio);
  };

  const renderizarLineasEstaticas = () => {
    contenedor.innerHTML = '';
    lineas.forEach((texto, idx) => {
      const p = document.createElement('p');
      p.setAttribute('data-typewriter-linea', '');
      p.className = idx < lineas.length - 1 ? 'n1-linea n1-linea-historial' : 'n1-linea n1-linea-activa';
      p.textContent = texto;
      contenedor.appendChild(p);
    });
  };

  const manejarCambioMedio = (e: MediaQueryListEvent) => {
    if (e.matches) {
      if (temporizadorId !== undefined) {
        window.clearTimeout(temporizadorId);
        temporizadorId = undefined;
      }
      renderizarLineasEstaticas();
    }
  };

  mediaQuery.addEventListener('change', manejarCambioMedio);

  // Si el usuario prefiere movimiento reducido, presentar el texto completo sin animación
  if (mediaQuery.matches) {
    renderizarLineasEstaticas();
    return { destruir: limpiar };
  }

  // Leer duraciones desde los tokens de diseño de tokens.css
  const estilo = getComputedStyle(document.documentElement);
  const parsearDuracion = (propiedad: string, fallbackMs: number): number => {
    const valor = estilo.getPropertyValue(propiedad).trim();
    if (!valor) return fallbackMs;
    if (valor.endsWith('ms')) return parseFloat(valor) || fallbackMs;
    if (valor.endsWith('s')) return (parseFloat(valor) * 1000) || fallbackMs;
    return fallbackMs;
  };

  const duracionInmediata = parsearDuracion('--duracion-inmediata', 100);
  const duracionCorta = parsearDuracion('--duracion-corta', 250);

  // Paso de tipeo calculado (~25ms por letra) y pausa entre líneas (~250ms)
  const velocidadMs = Math.max(15, Math.round(duracionInmediata / 4));
  const pausaEntreLineasMs = duracionCorta;

  contenedor.innerHTML = '';

  let lineaActualIdx = 0;
  let caracterActualIdx = 0;
  let parrafoActual: HTMLParagraphElement | null = null;
  let textoNodo: Text | null = null;
  let cursorNodo: HTMLSpanElement | null = null;

  const comenzarSiguienteLinea = () => {
    if (destruido) return;

    if (lineaActualIdx >= lineas.length) {
      return;
    }

    // Al avanzar a una nueva línea, la anterior se atenúa y cede el cursor
    if (parrafoActual) {
      parrafoActual.className = 'n1-linea n1-linea-historial';
      if (cursorNodo && cursorNodo.parentNode) {
        cursorNodo.parentNode.removeChild(cursorNodo);
      }
    }

    parrafoActual = document.createElement('p');
    parrafoActual.setAttribute('data-typewriter-linea', '');
    parrafoActual.className = 'n1-linea n1-linea-activa';

    textoNodo = document.createTextNode('');
    parrafoActual.appendChild(textoNodo);

    cursorNodo = document.createElement('span');
    cursorNodo.className = 'n1-cursor';
    cursorNodo.setAttribute('aria-hidden', 'true');
    cursorNodo.textContent = '_';
    parrafoActual.appendChild(cursorNodo);

    contenedor.appendChild(parrafoActual);
    caracterActualIdx = 0;

    tipearSiguienteCaracter();
  };

  const tipearSiguienteCaracter = () => {
    if (destruido || !parrafoActual || !textoNodo) return;

    const textoCompleto = lineas[lineaActualIdx];

    if (caracterActualIdx < textoCompleto.length) {
      caracterActualIdx++;
      textoNodo.nodeValue = textoCompleto.slice(0, caracterActualIdx);
      temporizadorId = window.setTimeout(tipearSiguienteCaracter, velocidadMs);
    } else {
      lineaActualIdx++;
      if (lineaActualIdx < lineas.length) {
        temporizadorId = window.setTimeout(comenzarSiguienteLinea, pausaEntreLineasMs);
      }
    }
  };

  comenzarSiguienteLinea();

  return { destruir: limpiar };
}
