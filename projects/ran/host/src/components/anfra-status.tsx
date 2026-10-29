import { useEffect, useState } from 'react';
import { type Health, health } from '@/lib/host';
import { cn } from '@/lib/utils';

/** How often to ask again, so the dot turns red when anfra stops answering. */
const interval = 30_000;

/** anfra's version, with a dot for whether it answers: green when it does, red when it does not. */
export function AnfraStatus() {
  const [state, setState] = useState<Health | 'unreachable'>();

  useEffect(() => {
    let live = true;
    const check = () =>
      health().then(
        (next) => live && setState(next),
        () => live && setState('unreachable'),
      );
    check();
    const timer = setInterval(check, interval);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const anfra = typeof state === 'object' ? state.anfra : null;
  const text = !state ? 'anfra' : anfra ? `anfra v${anfra}` : 'anfra is not answering';
  const title =
    typeof state === 'object' ? `host ${state.host}` : state ? 'The host is not answering' : undefined;
  return (
    <span className="flex min-w-0 items-center gap-2 px-2 text-sm text-muted-foreground" title={title}>
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          !state ? 'bg-muted-foreground/40' : anfra ? 'bg-green-500' : 'bg-destructive',
        )}
      />
      <span className="truncate">{text}</span>
    </span>
  );
}
