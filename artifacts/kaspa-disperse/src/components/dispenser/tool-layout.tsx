import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { type ReactNode } from 'react';
import { type WalletAccount } from '@/lib/dispenser/wallets';
import { DispenserLogo } from './brand-logo';

interface ToolLayoutProps {
  children: ReactNode;
  account?: WalletAccount | null;
  onConnect?: () => void;
  footerStats?: Array<{ label: string; value: string; sub?: string }>;
}

export function ToolLayout({ children, account, onConnect, footerStats }: ToolLayoutProps) {
  const connected = !!account;

  return (
    <div className="kd-app min-h-screen flex flex-col text-zinc-100">
      <header className="shrink-0 border-b border-cyan-900/20 bg-[#070b10]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
            <div className="hidden sm:block w-px h-5 bg-cyan-900/30" />
            <Link href="/dispenser">
              <DispenserLogo size="md" />
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="kd-pill text-[11px] text-emerald-400 hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Kaspa Mainnet
            </span>
            {connected ? (
              <span className="kd-pill text-[11px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={onConnect}
                className="kd-btn text-black font-semibold text-xs px-4 py-2 rounded-lg"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {footerStats && footerStats.length > 0 && (
        <footer className="shrink-0 border-t border-cyan-900/20 bg-[#070b10]/90">
          <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-x divide-cyan-900/20">
            {footerStats.map((stat) => (
              <div key={stat.label} className="px-4 sm:px-6 py-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">{stat.label}</div>
                <div className="text-lg font-bold text-white">{stat.value}</div>
                {stat.sub && <div className="text-[10px] text-zinc-500">{stat.sub}</div>}
              </div>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}

export { WalletCard } from './app-layout';
