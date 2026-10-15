/**
 * El formulario de contacto (T45, K22 y K23): la piel y el comportamiento del RSVP de Tonami con los campos de T35
 * (`name`, `company`, `email`, `message`, `autorizacion`) y el envío a Web3Forms con `fetch`, sin recargar.
 *
 *   · Validación (K22): al salir de cada campo (`blur`) y, mientras se escribe, solo si el campo ya está en error. Al
 *     salir se normaliza: `trim` y el dominio del correo en minúsculas. Error: `aria-invalid="true"`, subrayado y mensaje
 *     en el color de error; válido: `aria-invalid="false"` y `data-valido`.
 *   · Enviar con errores: ninguna petición, todos los inválidos marcados, el resumen `[data-sm-resumen]`
 *     (`aria-live="assertive"`) dice cuántos hay y a cuál se llevó el foco, y el foco va al primero (K23).
 *   · Borrador (K23): lo escrito se guarda en `sessionStorage` `sm-borrador` y se recupera si se vuelve en menos de
 *     30 min; se borra al enviar bien.
 *   · Envío (K23, sin ventana de confirmar): `form[data-estado]` ∈ reposo · enviando · enviado · error, con tres
 *     `<dialog>` nativos: «enviando» (el botón `disabled` y `aria-busy`), «gracias» y «fallo» (con reintentar). Tope
 *     de 15 s. Mientras un diálogo está abierto, Lenis se detiene.
 * En las pruebas el envío se intercepta: nada de esto manda correos.
 */
import { obtenerLenis } from '@/lib/pelicula/lenis';
import type { Contexto, Modulo } from './contexto';
import { ORDEN_CAMPOS, errorDeCampo, validarTodo, type CampoValidable, type DatosFormulario } from './validacion';
import { buscar, buscarTodos } from './util';

export type EstadoFormulario = 'reposo' | 'enviando' | 'enviado' | 'error';

/** Toda espera tiene salida: si Web3Forms no responde en este tiempo, el envío se da por fallido (K23). */
const ESPERA_MAXIMA_ENVIO_MS = 15_000;
/** K23: el borrador vale 30 minutos. */
const VIGENCIA_BORRADOR_MS = 30 * 60 * 1000;
const CLAVE_BORRADOR = 'sm-borrador';
/** El resumen se vuelve a escribir un instante después de vaciarlo, para que el lector de pantalla lo anuncie siempre. */
const RETRASO_RESUMEN_MS = 40;

interface Borrador {
  t: number;
  name: string;
  company: string;
  email: string;
  message: string;
}

const esBorrador = (x: unknown): x is Borrador =>
  typeof x === 'object' &&
  x !== null &&
  'name' in x &&
  'company' in x &&
  'email' in x &&
  'message' in x &&
  't' in x &&
  typeof x.t === 'number' &&
  typeof x.name === 'string' &&
  typeof x.company === 'string' &&
  typeof x.email === 'string' &&
  typeof x.message === 'string';

/** ¿La respuesta de Web3Forms dice que el mensaje salió? Solo `success: true` cuenta. */
function esExito(cuerpo: unknown): boolean {
  return typeof cuerpo === 'object' && cuerpo !== null && 'success' in cuerpo && cuerpo.success === true;
}

/** El dominio del correo va en minúsculas; lo de antes de la arroba se respeta. */
function normalizarCorreo(valor: string): string {
  const limpio = valor.trim();
  const arroba = limpio.lastIndexOf('@');
  return arroba < 0 ? limpio : `${limpio.slice(0, arroba)}@${limpio.slice(arroba + 1).toLowerCase()}`;
}

export function iniciarFormulario(c: Contexto): Modulo {
  const form = c.seccion.querySelector<HTMLFormElement>('form[data-sm-formulario]');
  if (!form) return { destruir: () => undefined };
  const nombre = buscar(form, '[name="name"]', HTMLInputElement);
  const empresa = buscar(form, '[name="company"]', HTMLInputElement);
  const email = buscar(form, '[name="email"]', HTMLInputElement);
  const mensaje = buscar(form, '[name="message"]', HTMLTextAreaElement);
  const autorizacion = buscar(form, '[name="autorizacion"]', HTMLInputElement);
  const trampa = buscar(form, '[name="botcheck"]', HTMLInputElement);
  const boton = buscar(form, 'button[type="submit"]', HTMLButtonElement);
  const resumen = form.querySelector<HTMLElement>('[data-sm-resumen]');
  const dEnviando = c.seccion.querySelector<HTMLDialogElement>('dialog[data-sm-dialogo="enviando"]');
  const dGracias = c.seccion.querySelector<HTMLDialogElement>('dialog[data-sm-dialogo="gracias"]');
  const dFallo = c.seccion.querySelector<HTMLDialogElement>('dialog[data-sm-dialogo="fallo"]');
  if (!nombre || !empresa || !email || !mensaje || !autorizacion || !boton || !resumen || !dEnviando || !dGracias || !dFallo) {
    return { destruir: () => undefined };
  }

  const textos = c.config.formulario;
  const control: Record<CampoValidable, HTMLInputElement | HTMLTextAreaElement> = { name: nombre, email, message: mensaje, autorizacion };
  const caja = (campo: string): HTMLElement | null => form.querySelector<HTMLElement>(`[data-sm-campo="${campo}"]`);
  const franja = (campo: string): HTMLElement | null => form.querySelector<HTMLElement>(`[data-sm-error-campo="${campo}"]`);

  const abort = new AbortController();
  const { signal } = abort;
  let envioEnCurso: AbortController | null = null;
  let temporizadorResumen: number | undefined;
  let destruido = false;

  const leer = (): DatosFormulario => ({
    name: nombre.value,
    company: empresa.value,
    email: email.value,
    message: mensaje.value,
    autorizacion: autorizacion.checked,
  });

  const fijarEstado = (estado: EstadoFormulario): void => {
    form.dataset.estado = estado;
    form.setAttribute('aria-busy', estado === 'enviando' ? 'true' : 'false');
  };

  // ---------- Borrador (K23) ----------

  const guardarBorrador = (): void => {
    try {
      const b: Borrador = { t: Date.now(), name: nombre.value, company: empresa.value, email: email.value, message: mensaje.value };
      if (!b.name && !b.company && !b.email && !b.message) sessionStorage.removeItem(CLAVE_BORRADOR);
      else sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
    } catch {
      // Sin almacenamiento: el borrador no se guarda y el formulario sigue funcionando.
    }
  };

  const borrarBorrador = (): void => {
    try {
      sessionStorage.removeItem(CLAVE_BORRADOR);
    } catch {
      // Nada que borrar.
    }
  };

  const recuperarBorrador = (): void => {
    try {
      const crudo = sessionStorage.getItem(CLAVE_BORRADOR);
      if (!crudo) return;
      const b: unknown = JSON.parse(crudo);
      if (!esBorrador(b) || Date.now() - b.t > VIGENCIA_BORRADOR_MS) {
        sessionStorage.removeItem(CLAVE_BORRADOR);
        return;
      }
      nombre.value = b.name;
      empresa.value = b.company;
      email.value = b.email;
      mensaje.value = b.message;
    } catch {
      // Un borrador ilegible se ignora.
    }
  };

  // ---------- Validación (K22) ----------

  const marcar = (campo: CampoValidable, error: string | null): void => {
    const el = control[campo];
    el.setAttribute('aria-invalid', error ? 'true' : 'false');
    const contenedor = caja(campo);
    if (contenedor) {
      if (error) contenedor.setAttribute('data-error', 'true');
      else contenedor.removeAttribute('data-error');
      contenedor.setAttribute('data-valido', error ? 'false' : 'true');
    }
    el.setAttribute('data-valido', error ? 'false' : 'true');
    const f = franja(campo);
    if (f) f.textContent = error ?? '';
  };

  const revisar = (campo: CampoValidable): string | null => {
    const error = errorDeCampo(campo, leer(), textos.errores);
    marcar(campo, error);
    return error;
  };

  /** Al salir de un campo se limpia lo escrito: sin espacios de más y con el dominio del correo en minúsculas. */
  const normalizar = (): void => {
    if (nombre.value !== nombre.value.trim()) nombre.value = nombre.value.trim();
    if (empresa.value !== empresa.value.trim()) empresa.value = empresa.value.trim();
    if (mensaje.value !== mensaje.value.trim()) mensaje.value = mensaje.value.trim();
    const correo = normalizarCorreo(email.value);
    if (email.value !== correo) email.value = correo;
  };

  const marcarEmpresa = (): void => {
    const contenedor = caja('company');
    if (!contenedor) return;
    if (empresa.value.trim().length > 0) contenedor.setAttribute('data-valido', 'true');
    else contenedor.removeAttribute('data-valido');
  };

  for (const campo of ORDEN_CAMPOS) {
    const el = control[campo];
    el.addEventListener(
      'blur',
      () => {
        if (destruido) return;
        normalizar();
        revisar(campo);
        guardarBorrador();
      },
      { signal },
    );
    const alCambiar = (): void => {
      // Mientras se escribe solo se revisa lo que ya está en error (K22).
      if (el.getAttribute('aria-invalid') === 'true') revisar(campo);
    };
    el.addEventListener('input', alCambiar, { signal });
    el.addEventListener('change', alCambiar, { signal });
  }
  empresa.addEventListener(
    'blur',
    () => {
      normalizar();
      marcarEmpresa();
    },
    { signal },
  );

  // Lo escrito se guarda en el borrador en cada tecla; escribir después de un envío vuelve el formulario a reposo.
  for (const el of [nombre, empresa, email, mensaje]) {
    el.addEventListener(
      'input',
      () => {
        if (form.dataset.estado === 'enviado') fijarEstado('reposo');
        if (form.dataset.estado !== 'enviando') guardarBorrador();
      },
      { signal },
    );
  }

  const escribirResumen = (texto: string): void => {
    if (temporizadorResumen !== undefined) window.clearTimeout(temporizadorResumen);
    resumen.textContent = '';
    if (texto === '') return;
    temporizadorResumen = window.setTimeout(() => {
      resumen.textContent = texto;
    }, RETRASO_RESUMEN_MS);
  };

  // ---------- Los diálogos ----------

  /** Mientras un diálogo está abierto Lenis se detiene (K23); sin Lenis, el documento no se desplaza. */
  const actualizarBloqueo = (): void => {
    const hay = c.seccion.querySelector('dialog[open]') !== null;
    const lenis = obtenerLenis();
    if (lenis) {
      if (hay) lenis.stop();
      else lenis.start();
    } else {
      document.documentElement.style.overflow = hay ? 'hidden' : '';
    }
  };

  const abrir = (d: HTMLDialogElement): void => {
    if (!d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    actualizarBloqueo();
  };

  const cerrar = (d: HTMLDialogElement): void => {
    if (d.open) d.close();
    actualizarBloqueo();
  };

  // «Enviando» no se puede cerrar con Escape; los otros dos, sí, y también con un clic en el velo.
  dEnviando.addEventListener('cancel', (e) => e.preventDefault(), { signal });
  for (const d of [dGracias, dFallo]) {
    d.addEventListener(
      'close',
      () => {
        actualizarBloqueo();
        // El foco vuelve al botón de enviar (si el diálogo lo dejó en el aire).
        if (!destruido && !boton.disabled) boton.focus({ preventScroll: true });
      },
      { signal },
    );
    d.addEventListener(
      'click',
      (e) => {
        if (e.target === d) cerrar(d);
      },
      { signal },
    );
    for (const b of buscarTodos(d, '[data-sm-cerrar]', HTMLButtonElement)) b.addEventListener('click', () => cerrar(d), { signal });
  }

  // ---------- El envío ----------

  const cuerpoDeEnvio = (): Record<string, string | boolean> => {
    const oculto = (n: string): string => buscar(form, `[name="${n}"]`, HTMLInputElement)?.value ?? '';
    return {
      access_key: oculto('access_key'),
      subject: oculto('subject'),
      from_name: oculto('from_name'),
      name: nombre.value.trim(),
      email: normalizarCorreo(email.value),
      company: empresa.value.trim(),
      message: mensaje.value.trim(),
      autorizacion: autorizacion.checked,
      botcheck: trampa?.checked ?? false,
    };
  };

  /** Después de un envío bien hecho el formulario queda limpio, sin marcas de validación. */
  const limpiar = (): void => {
    form.reset();
    for (const campo of ORDEN_CAMPOS) {
      control[campo].removeAttribute('aria-invalid');
      control[campo].removeAttribute('data-valido');
      caja(campo)?.removeAttribute('data-error');
      caja(campo)?.removeAttribute('data-valido');
      const f = franja(campo);
      if (f) f.textContent = '';
    }
    caja('company')?.removeAttribute('data-valido');
    escribirResumen('');
  };

  const fallar = (): void => {
    fijarEstado('error');
    boton.disabled = false;
    cerrar(dEnviando);
    abrir(dFallo);
  };

  const enviar = async (): Promise<void> => {
    escribirResumen('');
    boton.disabled = true;
    fijarEstado('enviando');
    abrir(dEnviando);

    const intento = new AbortController();
    envioEnCurso = intento;
    const limite = window.setTimeout(() => intento.abort(), ESPERA_MAXIMA_ENVIO_MS);
    try {
      const respuesta = await fetch(c.config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(cuerpoDeEnvio()),
        signal: intento.signal,
      });
      const cuerpo: unknown = await respuesta.json().catch(() => null);
      if (signal.aborted) return;
      if (respuesta.ok && esExito(cuerpo)) {
        borrarBorrador();
        boton.disabled = false;
        fijarEstado('enviado');
        cerrar(dEnviando);
        limpiar();
        abrir(dGracias);
      } else {
        fallar();
      }
    } catch {
      if (!signal.aborted) fallar();
    } finally {
      window.clearTimeout(limite);
      if (envioEnCurso === intento) envioEnCurso = null;
    }
  };

  form.addEventListener(
    'submit',
    (e) => {
      e.preventDefault();
      if (form.dataset.estado === 'enviando') return;
      normalizar();
      const errores = validarTodo(leer(), textos.errores);
      for (const campo of ORDEN_CAMPOS) marcar(campo, errores.find((x) => x.campo === campo)?.mensaje ?? null);
      marcarEmpresa();
      if (errores.length > 0) {
        // Con errores no se hace ninguna petición; el foco va al primer campo inválido y el resumen lo dice (K23).
        const primero = errores[0].campo;
        const etiqueta = textos.campos[primero] ?? primero;
        const cuantos = errores.length;
        escribirResumen(`${cuantos} ${cuantos === 1 ? textos.resumen.uno : textos.resumen.varios}. ${textos.resumen.llevar} ${etiqueta}.`);
        control[primero].focus();
        return;
      }
      void enviar();
    },
    { signal },
  );

  dFallo.querySelector<HTMLButtonElement>('[data-sm-reintentar]')?.addEventListener(
    'click',
    () => {
      cerrar(dFallo);
      void enviar();
    },
    { signal },
  );

  // K23: el borrador se recupera al volver (recargar, atrás del navegador o regreso con el router), no en una entrada nueva.
  if (c.vuelve) recuperarBorrador();

  return {
    destruir: () => {
      destruido = true;
      abort.abort();
      envioEnCurso?.abort();
      envioEnCurso = null;
      if (temporizadorResumen !== undefined) window.clearTimeout(temporizadorResumen);
      for (const d of [dEnviando, dGracias, dFallo]) if (d.open) d.close();
      document.documentElement.style.overflow = '';
      obtenerLenis()?.start();
    },
  };
}
