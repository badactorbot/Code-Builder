import { type ReactNode } from 'react';
import KineticGrid from '@/components/ui/kinetic-grid';

const LINKS = [
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Distro', href: '/#distro' },
  { label: 'Features', href: '/#features' },
  { label: 'Fees', href: '/#fees' },
  { label: 'Token Distribution', href: '/#token-distribution' },
];

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh text-zinc-100">
      <KineticGrid pinned>
        <header className="sticky top-0 z-50 border-b border-cyan-900/20 bg-[#060a0e]/55 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-8">
            <nav className="hidden md:flex items-center gap-8">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm text-zinc-400 hover:text-white transition"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <a
              href="/#distro"
              className="kd-btn ml-auto inline-flex items-center gap-2 text-black font-semibold text-sm px-5 py-2.5 rounded-xl"
            >
              Open Distro
            </a>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-cyan-900/20 bg-[#070b10]/55 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-zinc-500">KASDISTRO</div>
            <div className="flex items-center gap-6 text-xs text-zinc-500">
              <a href="/#how-it-works" className="hover:text-zinc-300">How It Works</a>
              <a href="/#distro" className="hover:text-cyan-400">Distro</a>
              <a href="/#token-distribution" className="hover:text-zinc-300">Token Distribution</a>
            </div>
          </div>
        </footer>
      </KineticGrid>
    </div>
  );
}
