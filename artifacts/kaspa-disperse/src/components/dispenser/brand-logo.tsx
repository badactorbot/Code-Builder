import { cn } from '@/lib/utils';

const LOGO_SRC = '/kasdistro-logo.png';

const SIZES = {
  sm: 'h-9 w-auto',
  md: 'h-12 w-auto sm:h-14',
  lg: 'h-16 w-auto',
  xl: 'h-24 w-auto',
  hero: 'h-28 w-auto sm:h-40 lg:h-48',
} as const;

export function DispenserLogo({
  className,
  size = 'md',
}: {
  className?: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <img
      src={LOGO_SRC}
      alt="KASDISTRO"
      className={cn('object-contain drop-shadow-[0_0_28px_rgba(34,211,238,0.28)]', SIZES[size], className)}
    />
  );
}

export function DispenserBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <DispenserLogo size={compact ? 'sm' : 'md'} />
      {!compact && (
        <div>
          <div className="font-semibold text-white leading-tight tracking-wide">KASDISTRO</div>
          <div className="text-[10px] text-zinc-500 leading-none mt-0.5">Reward Your Community in KAS</div>
        </div>
      )}
    </div>
  );
}
