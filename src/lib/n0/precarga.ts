/**
 * precarga.ts — Monitor de precarga real para el preloader cinematográfico (N0).
 * Precarga fuentes críticas, assets del home, texturas del cilindro y el primer video del menú.
 * Garantiza salida con tiempo máximo de 6 s y gestión silenciosa de fallas de red.
 */

/**
 * Descarga archivos que se usarán después (los clips del outfit del N2), uno tras otro y con
 * prioridad baja. No cuenta en el progreso del preloader ni lo demora: solo los deja en la caché
 * HTTP, de donde los toma el <video> al reproducirlos. Con «ahorro de datos» no descarga nada.
 */
export async function precargarEnSegundoPlano(urls: readonly string[]): Promise<void> {
  const conexion = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conexion?.saveData) return;
  for (const url of urls) {
    try {
      const respuesta = await fetch(url, { priority: 'low' });
      // Se lee el cuerpo entero para que la entrada quede completa en la caché.
      await respuesta.blob();
    } catch {
      // Sin red: el clip se pide al reproducirse, como antes.
    }
  }
}

export interface OpcionesPrecarga {
  imagenes: readonly string[];
  videoUrl?: string;
  tiempoMaximoMs?: number;
}

export interface EstadoPrecarga {
  total: number;
  completados: number;
  progreso: number;
  finalizado: boolean;
}

export class MonitorPrecarga {
  private total = 0;
  private completados = 0;
  private finalizado = false;
  private listeners: Array<(estado: EstadoPrecarga) => void> = [];
  private temporizadorSeguridad: number | null = null;
  private elementosVideo: HTMLVideoElement[] = [];

  constructor(private opciones: OpcionesPrecarga) {
    const totalImagenes = opciones.imagenes.length;
    const tieneVideo = Boolean(opciones.videoUrl);
    // 1 para fuentes + totalImagenes + (1 si tiene video)
    this.total = 1 + totalImagenes + (tieneVideo ? 1 : 0);
  }

  public iniciar(): Promise<void> {
    return new Promise<void>((resolver) => {
      const tiempoMaximo = this.opciones.tiempoMaximoMs ?? 6000;

      // Tiempo máximo de respaldo: nunca más de 6 s
      this.temporizadorSeguridad = window.setTimeout(() => {
        if (!this.finalizado) {
          this.finalizado = true;
          this.completados = this.total;
          this.notificar();
          this.limpiar();
          resolver();
        }
      }, tiempoMaximo);

      const registrarItem = () => {
        if (this.finalizado) return;
        this.completados += 1;
        this.notificar();

        if (this.completados >= this.total) {
          this.finalizado = true;
          this.limpiar();
          resolver();
        }
      };

      // 1. Fuentes
      if ('fonts' in document && document.fonts?.ready) {
        document.fonts.ready
          .then(() => registrarItem())
          .catch(() => registrarItem());
      } else {
        registrarItem();
      }

      // 2. Imágenes (assets de home y texturas)
      this.opciones.imagenes.forEach((src) => {
        if (!src) {
          registrarItem();
          return;
        }
        const img = new Image();
        let resuelto = false;
        const terminar = () => {
          if (resuelto) return;
          resuelto = true;
          img.onload = null;
          img.onerror = null;
          registrarItem();
        };
        img.onload = terminar;
        img.onerror = terminar;
        img.src = src;
        if (img.complete) {
          terminar();
        }
      });

      // 3. Primer video del menú (sin bloquear si falla o se aborta)
      if (this.opciones.videoUrl) {
        const video = document.createElement('video');
        this.elementosVideo.push(video);
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        let resueltoVideo = false;
        const terminarVideo = () => {
          if (resueltoVideo) return;
          resueltoVideo = true;
          video.oncanplaythrough = null;
          video.onloadeddata = null;
          video.onerror = null;
          registrarItem();
        };

        video.oncanplaythrough = terminarVideo;
        video.onloadeddata = terminarVideo;
        video.onerror = terminarVideo;

        try {
          video.src = this.opciones.videoUrl;
          video.load();
        } catch {
          terminarVideo();
        }
      }
    });
  }

  public suscribir(listener: (estado: EstadoPrecarga) => void): () => void {
    this.listeners.push(listener);
    listener(this.obtenerEstado());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public obtenerEstado(): EstadoPrecarga {
    const progreso = this.total > 0 ? Math.min(1, this.completados / this.total) : 1;
    return {
      total: this.total,
      completados: this.completados,
      progreso,
      finalizado: this.finalizado,
    };
  }

  private notificar(): void {
    const estado = this.obtenerEstado();
    this.listeners.forEach((listener) => {
      try {
        listener(estado);
      } catch {
        // Protección contra excepciones en listeners
      }
    });
  }

  public limpiar(): void {
    if (this.temporizadorSeguridad !== null) {
      window.clearTimeout(this.temporizadorSeguridad);
      this.temporizadorSeguridad = null;
    }
    this.elementosVideo.forEach((v) => {
      v.oncanplaythrough = null;
      v.onloadeddata = null;
      v.onerror = null;
      v.src = '';
    });
    this.elementosVideo = [];
  }
}
