import { AppWindowMac } from 'lucide-react';
import type { MouseEvent } from 'react';
import { type AppEntry, type Entry, urlOf } from '@/lib/host';
import { iconOf } from '@/lib/icons';
import { cn } from '@/lib/utils';

/** Every Data App, in the manifest's order, folders flattened: Ran has a handful, one tab each. */
export function appsOf(entries: Entry[]): AppEntry[] {
  return entries.flatMap((entry) => (entry.kind === 'app' ? [entry] : appsOf(entry.children)));
}

interface Props {
  entries: Entry[] | undefined;
  selected: string | undefined;
  onSelect: (path: string) => void;
  className?: string;
}

/** The Data Apps as tabs in the top header, in place of the upstream host's sidebar. */
export function AppTabs({ entries, selected, onSelect, className }: Props) {
  const apps = entries ? appsOf(entries) : [];
  // Links, so a middle click or Cmd/Ctrl+click opens a tab of its own; a plain click stays in the page.
  const open = (event: MouseEvent, path: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onSelect(path);
  };
  return (
    <nav aria-label="Pages" className={cn('flex min-w-0 items-center gap-1 overflow-x-auto', className)}>
      {apps.map((app) => {
        const Icon = iconOf(app.icon, AppWindowMac);
        const current = app.path === selected;
        return (
          <a
            key={app.path}
            href={urlOf(app.path)}
            aria-current={current ? 'page' : undefined}
            onClick={(event) => open(event, app.path)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
              current
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            {app.label}
          </a>
        );
      })}
    </nav>
  );
}
