import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { FromServer, PeerMsg } from '../../shared/protocol';
import { isValidToken, sanitizeToken } from '../../shared/token';
import { connectPeer } from './net/peer';
import { clearToken, connectSignaling, getDeviceId, loadToken, saveToken, type Signaling } from './net/signaling';
import { useSala } from './state/sala';
import Header, { type Pestana } from './ui/Header';
import Archivos from './screens/Archivos';
import Inicio from './screens/Inicio';
import SalaCreada, { Conectando } from './screens/SalaCreada';
// La pestaña Texto lleva highlight.js: se descarga aparte para que Inicio cargue más rápido
const Texto = lazy(() => import('./screens/Texto'));

type Pantalla = 'inicio' | 'creada' | 'conectando' | 'sala';
type Estado = 'conectando' | 'reconectando' | 'fallo';

const ESPERA_MS = 2 * 60_000; // tiempo que se espera al otro dispositivo o al servidor antes de cerrar
const LIMITE_MS = 20_000; // tiempo máximo para abrir la conexión directa tras emparejarse
const RESPUESTA_MS = 8000; // tiempo máximo para que el servidor conteste
const PAUSA_INICIAL_MS = 1000; // reintentos de reconexión: 1 s, 2 s, 4 s... hasta PAUSA_MAX_MS
const PAUSA_MAX_MS = 10_000;

const SALA_PERDIDA = 'La sala ya no existe (el servidor se reinició o caducó)';
const SIN_SERVIDOR = 'Se perdió la conexión con el servidor';
const SIN_OTRO = 'Se perdió la conexión con el otro dispositivo';
const MENSAJES: Record<string, string> = {
  not_found: SALA_PERDIDA,
  expired: SALA_PERDIDA,
  full: 'La sala ya está completa',
  rate_limited: 'Demasiados intentos, espera un minuto',
  rejected: 'El otro dispositivo rechazó la conexión',
  no_answer: 'El otro dispositivo no respondió a tiempo',
  sin_conexion: SIN_SERVIDOR,
};

function Sala({ channel, onSalir }: { channel: RTCDataChannel; onSalir(): void }) {
  const sala = useSala(channel);
  const [pestana, setPestana] = useState<Pestana>('archivos');

  // Salir cierra la sala para los dos: si hay algo transfiriéndose, se pide confirmación
  function salir() {
    if (Object.keys(sala.transfers).length > 0 && !confirm('Hay transferencias en curso y se cancelarán. ¿Salir de la sala?')) return;
    onSalir();
  }

  return (
    <div className="min-h-dvh">
      <Header pestana={pestana} onPestana={setPestana} connected={sala.connected} onSalir={salir} />
      <main className="gutter mx-auto w-full max-w-2xl pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* Las dos pestañas siguen montadas para no perder lo que se esté escribiendo */}
        <div id="panel-archivos" role="tabpanel" aria-labelledby="tab-archivos" hidden={pestana !== 'archivos'}>
          <Archivos sala={sala} />
        </div>
        <div id="panel-texto" role="tabpanel" aria-labelledby="tab-texto" hidden={pestana !== 'texto'}>
          <Suspense fallback={null}>
            <Texto sala={sala} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  // Si hay un token guardado (se recargó la página), se intenta volver a esa sala
  const [guardado] = useState(loadToken);
  const [pantalla, setPantalla] = useState<Pantalla>(guardado ? 'conectando' : 'inicio');
  const [estado, setEstado] = useState<Estado>('reconectando');
  const [token, setToken] = useState('');
  const [channel, setChannel] = useState<RTCDataChannel | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false); // me he unido y espero a que el creador me acepte
  const [solicitud, setSolicitud] = useState(false); // alguien pide unirse a mi sala

  // Copias en refs: las conexiones guardan funciones antiguas y necesitan ver el estado actual
  const pantallaRef = useRef<Pantalla>(guardado ? 'conectando' : 'inicio');
  const sig = useRef<Signaling | null>(null); // conexión con el servidor en uso
  const pendiente = useRef<Signaling | null>(null); // conexión que aún espera la respuesta del servidor
  const enCurso = useRef<Promise<string | null> | null>(null);
  const chRef = useRef<RTCDataChannel | null>(null);
  const tokenRef = useRef<string | null>(guardado);
  const intento = useRef<AbortController | null>(null); // intento de conexión directa en marcha
  const peerActivo = useRef(false); // connectPeer ya está escuchando las señales
  const cola = useRef<FromServer[]>([]); // señales que llegan antes de que exista connectPeer
  const espera = useRef<number | undefined>(undefined);
  const limite = useRef<number | undefined>(undefined);
  const pausa = useRef<number | undefined>(undefined);
  const generacion = useRef(0); // cambia al cerrar o reintentar: los bucles antiguos se detienen
  const arrancado = useRef(false);
  const cancelando = useRef(false); // el usuario retiró su solicitud: el cierre de la conexión no es un fallo

  function ir(p: Pantalla) {
    pantallaRef.current = p;
    setPantalla(p);
  }

  // Detiene temporizadores e intento de conexión directa
  function parar() {
    clearTimeout(espera.current);
    clearTimeout(limite.current);
    clearTimeout(pausa.current);
    espera.current = limite.current = pausa.current = undefined;
    intento.current?.abort();
    intento.current = null;
    peerActivo.current = false;
  }

  // Vuelve a Inicio y lo deja todo limpio
  function cerrar(mensaje: string | null) {
    generacion.current++;
    parar();
    const p = pendiente.current;
    pendiente.current = null;
    p?.close();
    const s = sig.current;
    sig.current = null;
    if (s) {
      s.send({ t: 'leave' });
      s.close();
    }
    const ch = chRef.current;
    chRef.current = null;
    ch?.close();
    tokenRef.current = null;
    clearToken();
    cola.current = [];
    setChannel(null);
    setToken('');
    setSolicitud(false);
    setAviso(mensaje);
    ir('inicio');
  }

  function salir() {
    const ch = chRef.current;
    if (ch?.readyState === 'open') {
      ch.send(JSON.stringify({ t: 'bye' } satisfies PeerMsg));
      chRef.current = null;
      setTimeout(() => ch.close(), 500); // deja salir el aviso antes de cortar
    }
    cerrar(null);
  }

  // La conexión directa no se abrió a tiempo: se cierra todo y se ofrece reintentar
  function fallo() {
    generacion.current++;
    parar();
    const s = sig.current;
    sig.current = null;
    s?.close();
    cola.current = [];
    setEstado('fallo');
    ir('conectando');
  }

  // El otro dispositivo no está: se espera un tiempo y, si no vuelve, se cierra
  function perdido() {
    if (espera.current !== undefined) return;
    espera.current = window.setTimeout(() => cerrar(sig.current ? SIN_OTRO : SIN_SERVIDOR), ESPERA_MS);
  }

  function abrirSala(ch: RTCDataChannel) {
    const anterior = chRef.current;
    chRef.current = ch;
    if (anterior && anterior !== ch) anterior.close();
    parar();
    generacion.current++;
    cola.current = [];
    ch.addEventListener('message', (e) => {
      if (typeof e.data !== 'string') return;
      try {
        if ((JSON.parse(e.data) as PeerMsg).t === 'bye') cerrar('El otro dispositivo cerró la sala');
      } catch {
        // mensaje que no es de control
      }
    });
    ch.addEventListener('close', () => {
      if (chRef.current !== ch) return;
      perdido();
      // Sin sala a la que volver (el servidor la perdió) no hay nada que esperar
      if (!tokenRef.current) cerrar(SALA_PERDIDA);
      else void recuperar();
    });
    setChannel(ch);
    ir('sala');
  }

  // Empieza (o reinicia) la conexión directa. Se llama al emparejarse y cada vez que el otro vuelve.
  function emparejar(s: Signaling, iniciador: boolean) {
    intento.current?.abort();
    const ac = new AbortController();
    intento.current = ac;
    peerActivo.current = false;
    if (iniciador) cola.current = [];
    if (tokenRef.current) saveToken(tokenRef.current);
    if (pantallaRef.current !== 'sala') {
      clearTimeout(limite.current);
      limite.current = window.setTimeout(fallo, LIMITE_MS);
      setEstado('conectando');
      ir('conectando');
    }
    // Crear la primera RTCPeerConnection bloquea la página un momento: se deja pintar "Conectando…" antes.
    // Las señales que lleguen mientras tanto se guardan en la cola.
    setTimeout(() => {
      if (ac.signal.aborted) return;
      peerActivo.current = true;
      connectPeer(s, iniciador, { signal: ac.signal, pendientes: cola.current.splice(0) })
        .then((ch) => {
          if (ac.signal.aborted) return ch.close();
          intento.current = null;
          peerActivo.current = false;
          abrirSala(ch);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
          intento.current = null;
          peerActivo.current = false;
          if (pantallaRef.current === 'conectando') fallo();
          else perdido();
        });
    }, 50);
  }

  // Mensajes del servidor una vez la conexión está en uso
  function manejar(m: FromServer, s: Signaling) {
    if (m.t === 'peer-joined') {
      setSolicitud(false);
      if (m.direct && chRef.current?.readyState === 'open') {
        // El otro solo recuperó la conexión con el servidor y la directa sigue viva: no se reempareja
        clearTimeout(espera.current);
        espera.current = undefined;
      } else {
        // Si él cree que el canal sigue vivo y el mío no, le pido que ofrezca de nuevo
        if (m.direct) s.send({ t: 'signal', data: { repair: true } });
        // El otro se ha unido (o ha vuelto): yo respondo, él ofrece
        emparejar(s, false);
      }
    } else if (m.t === 'peer-left') {
      // Con el canal directo abierto no hace falta esperar: si el otro se fue de verdad, el latido lo cortará
      if (pantallaRef.current === 'sala' && chRef.current?.readyState !== 'open') perdido();
    } else if (m.t === 'join-request') {
      setSolicitud(true);
    } else if (m.t === 'join-cancelled') {
      setSolicitud(false);
    } else if (m.t === 'signal') {
      const datos = m.data as { repair?: unknown } | null;
      if (datos && typeof datos === 'object' && datos.repair === true) {
        // El otro perdió el canal directo que yo daba por abierto: ofrezco una conexión nueva
        if (!peerActivo.current) emparejar(s, true);
        return;
      }
      // Si connectPeer aún no escucha, la señal se guarda para entregársela al empezar
      if (!peerActivo.current && chRef.current?.readyState !== 'open' && cola.current.length < 50) cola.current.push(m);
    }
  }

  // El creador responde a quien pide unirse
  function responder(acepta: boolean) {
    sig.current?.send({ t: acepta ? 'accept' : 'reject' });
    setSolicitud(false);
  }

  // El que pidió unirse se arrepiente mientras espera
  function cancelarUnion() {
    const p = pendiente.current;
    if (!p) return;
    cancelando.current = true;
    p.send({ t: 'leave' });
    p.close();
  }

  // `s` pasa a ser la conexión con el servidor
  function adoptar(s: Signaling) {
    const vieja = sig.current;
    sig.current = s;
    vieja?.close();
  }

  // Se ha cortado la conexión con el servidor
  function caida() {
    sig.current = null;
    const p = pantallaRef.current;
    if (p === 'inicio' || p === 'creada') {
      // Una sala sin emparejar desaparece con su creador: no hay a qué volver
      cerrar(SIN_SERVIDOR);
      return;
    }
    // Con la conexión directa abierta la sesión sigue; si no, se espera al otro dispositivo
    if (p === 'sala' && chRef.current?.readyState !== 'open') perdido();
    void recuperar('reconectando');
  }

  // Vuelve a entrar en la sala con espera creciente entre intentos, dentro del tiempo de gracia del servidor
  async function recuperar(inicial: Estado = 'reconectando') {
    const mia = ++generacion.current;
    clearTimeout(pausa.current);
    clearTimeout(limite.current); // el límite de 20 s vuelve a contar cuando se reempareje
    limite.current = undefined;
    if (pantallaRef.current === 'conectando') setEstado(inicial);
    const hasta = Date.now() + ESPERA_MS;
    let espera_ = PAUSA_INICIAL_MS;
    while (generacion.current === mia && tokenRef.current) {
      const codigo = await entrar(tokenRef.current);
      if (generacion.current !== mia || codigo === null) return;
      if (codigo !== 'sin_conexion') {
        if (pantallaRef.current === 'sala' && chRef.current?.readyState === 'open' && MENSAJES[codigo] === SALA_PERDIDA) {
          // El servidor perdió la sala pero la conexión directa sigue: se puede seguir sin él
          tokenRef.current = null;
          clearToken();
        } else {
          cerrar(MENSAJES[codigo] ?? SIN_SERVIDOR);
        }
        return;
      }
      if (Date.now() + espera_ > hasta) {
        cerrar(SIN_SERVIDOR);
        return;
      }
      await new Promise<void>((r) => {
        pausa.current = window.setTimeout(r, espera_);
      });
      espera_ = Math.min(espera_ * 2, PAUSA_MAX_MS);
    }
  }

  // Abre una conexión con el servidor y espera su primera respuesta (`esperado`).
  // Devuelve null si todo va bien o el código de error. Una segunda llamada mientras tanto reutiliza la primera.
  function conectar(inicio: (s: Signaling) => void, esperado: 'created' | 'joined', alExito: (m: FromServer, s: Signaling) => void) {
    if (enCurso.current) return enCurso.current;
    const promesa = new Promise<string | null>((resolve) => {
      const s = connectSignaling();
      pendiente.current = s;
      cola.current = [];
      cancelando.current = false;
      let respondido = false;
      const fin = (resultado: string | null) => {
        if (respondido) return;
        respondido = true;
        clearTimeout(tRespuesta);
        if (pendiente.current === s) pendiente.current = null;
        resolve(resultado);
      };
      const tRespuesta = window.setTimeout(() => {
        fin('sin_conexion');
        s.close();
      }, RESPUESTA_MS);
      s.onClose(() => {
        if (!respondido) fin(cancelando.current ? 'cancelado' : 'sin_conexion');
        else if (sig.current === s) caida();
      });
      s.on((m) => {
        if (respondido) {
          if (sig.current === s) manejar(m, s);
        } else if (m.t === 'error') {
          fin(m.code);
          s.close();
        } else if (m.t === 'pending') {
          // El creador tiene que aceptar: puede tardar más que RESPUESTA_MS (el servidor corta a los ~60 s)
          clearTimeout(tRespuesta);
          setEsperando(true);
        } else if (m.t === 'signal') {
          cola.current.push(m);
        } else if (m.t === esperado) {
          adoptar(s);
          alExito(m, s);
          fin(null);
        }
      });
      inicio(s);
    }).finally(() => {
      enCurso.current = null;
      setEsperando(false);
    });
    enCurso.current = promesa;
    return promesa;
  }

  function crear(): Promise<string | null> {
    setAviso(null);
    return conectar(
      (s) => s.send({ t: 'create', deviceId: getDeviceId() }),
      'created',
      (m) => {
        if (m.t !== 'created') return;
        // Aún no se guarda: una sala sin emparejar no sobrevive a recargar
        tokenRef.current = m.token;
        setToken(m.token);
        ir('creada');
      },
    );
  }

  // Sirve para Unirme y también para volver a una sala (tras una caída o recargar)
  function entrar(texto: string): Promise<string | null> {
    setAviso(null);
    const t = sanitizeToken(texto);
    if (!isValidToken(t)) return Promise.resolve('not_found'); // ni se llega a enviar al servidor
    return conectar(
      (s) => s.send({ t: 'join', token: t, deviceId: getDeviceId(), direct: chRef.current?.readyState === 'open' }),
      'joined',
      (_m, s) => {
        tokenRef.current = t;
        if (chRef.current?.readyState === 'open') {
          // Solo se recuperó la conexión con el servidor: el canal directo sigue vivo y se conserva
          clearTimeout(espera.current);
          espera.current = undefined;
          saveToken(t);
          return;
        }
        // Quien se une ofrece la conexión
        emparejar(s, true);
      },
    );
  }

  function crearOtro() {
    void crear().then((f) => {
      if (f) cerrar(MENSAJES[f] ?? SIN_SERVIDOR);
    });
  }

  function reintentar() {
    if (tokenRef.current) void recuperar('conectando');
    else cerrar(null);
  }

  useEffect(() => {
    if (arrancado.current) return; // StrictMode ejecuta los efectos dos veces
    arrancado.current = true;
    if (tokenRef.current) void recuperar('reconectando');
  }, []);

  if (pantalla === 'sala' && channel) return <Sala channel={channel} onSalir={salir} />;
  if (pantalla === 'creada') {
    return (
      <SalaCreada
        token={token}
        solicitud={solicitud}
        onAceptar={() => responder(true)}
        onRechazar={() => responder(false)}
        onCancelar={() => cerrar(null)}
        onCrearOtro={crearOtro}
      />
    );
  }
  if (pantalla === 'conectando') return <Conectando estado={estado} onReintentar={reintentar} onCancelar={() => cerrar(null)} />;
  return <Inicio aviso={aviso} esperando={esperando} onCancelarEspera={cancelarUnion} onCrear={crear} onUnirse={entrar} />;
}
