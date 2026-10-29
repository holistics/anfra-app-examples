import { AppWindowMac, Check } from 'lucide-react';
import type { AppEntry } from '@/lib/host';
import { iconOf } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface Props {
  app: AppEntry;
  className?: string;
  /** For the check, as its ring: the colour of what the icon sits on. */
  checkClassName?: string;
}

/** A Data App's icon, from the manifest, with a green check when it is endorsed. */
export function AppIcon({ app, className, checkClassName }: Props) {
  const Icon = iconOf(app.icon, AppWindowMac);
  if (!app.endorsed) return <Icon className={className} />;
  return (
    // The check sits on the icon's bottom right, ringed in the surface's colour so it reads over it.
    <span className="relative flex shrink-0">
      <Icon className={cn('size-4', className)} />
      <span
        role="img"
        aria-label="Endorsed"
        title="Endorsed"
        className={cn(
          'absolute -right-1 -bottom-1 flex size-2.5 items-center justify-center rounded-full bg-green-500 text-white ring-2 ring-sidebar',
          checkClassName,
        )}
      >
        <Check className="size-1.5 stroke-[5]" />
      </span>
    </span>
  );
}
