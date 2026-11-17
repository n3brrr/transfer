export type Pestana = 'archivos' | 'texto';

type Props = {
  pestana: Pestana;
  onPestana(p: Pestana): void;
  connected: boolean;
  onSalir(): void;
};

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'archivos', texto: 'Archivos' },
  { id: 'texto', texto: 'Texto' },
];

export default function Header({ pestana, onPestana, connected, onSalir }: Props) {
  // Flechas izquierda/derecha cambian de pestaña, como en cualquier tablist
  function teclas(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const otra = PESTANAS.find((p) => p.id !== pestana)!.id;
    onPestana(otra);
    document.getElementById(`tab-${otra}`)?.focus();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-borde/60 bg-crema pt-[max(0.5rem,env(safe-area-inset-top))] pb-3">
      <div className="gutter mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div
          role="tablist"
          aria-label="Secciones"
          className="order-2 grid w-full grid-cols-2 gap-1 rounded-xl border border-borde bg-superficie p-1 sm:order-1 sm:w-56"
          onKeyDown={teclas}
        >
          {PESTANAS.map(({ id, texto }) => {
            const activa = pestana === id;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                role="tab"
                type="button"
                aria-selected={activa}
                aria-controls={`panel-${id}`}
                tabIndex={activa ? 0 : -1}
                className={`min-h-11 rounded-lg px-4 font-medium transition-colors ${activa ? 'bg-tinta text-crema' : 'text-tinta hover:bg-borde/30 active:bg-borde/50'}`}
                onClick={() => onPestana(id)}
              >
                {texto}
              </button>
            );
          })}
        </div>

        <div className="order-1 flex flex-1 items-center justify-between gap-3 sm:order-2 sm:flex-none sm:justify-end">
          <span role="status" className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? 'bg-ok' : 'animate-pulse bg-acento'}`}
            />
            {connected ? 'Conectado' : 'Reconectando…'}
          </span>
          <button type="button" className="btn btn-secundario px-4 text-sm" onClick={onSalir}>
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
