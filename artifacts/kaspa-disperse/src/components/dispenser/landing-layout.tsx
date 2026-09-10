import { type ReactNode } from 'react';
import KineticGrid from '@/components/ui/kinetic-grid';
import { KRON_CHART_URL } from '@/lib/dispenser/constants';

const LINKS = [
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Distro', href: '/#distro' },
  { label: 'Features', href: '/#features' },
  { label: 'Token Distribution', href: '/#token-distribution' },
  { label: 'Chart', href: '/#chart' },
  { label: 'Holder Rewards', href: '/#holder-rewards' },
];

const SOCIALS = [
  {
    label: 'X',
    href: 'https://x.com/KasDistro',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.726-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

function SocialLinks({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'md' | 'lg';
}) {
  const iconBox = size === 'lg' ? 'h-7 w-7' : 'h-4 w-4';
  const hit = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {SOCIALS.map((social) => (
        <a
          key={social.href}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={social.label}
          title={social.label}
          className={`inline-flex ${hit} items-center justify-center rounded-xl text-cyan-200 transition hover:bg-white/5 hover:text-white`}
        >
          <span className={iconBox}>{social.icon}</span>
        </a>
      ))}
    </div>
  );
}

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh text-zinc-100">
      <KineticGrid pinned>
        <header className="sticky top-0 z-50 border-b border-cyan-900/20 bg-[#060a0e]/55 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center gap-10">
            <nav className="hidden md:flex items-center gap-8">
              {LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-lg font-medium text-cyan-200 hover:text-white transition"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <SocialLinks size="lg" />
              <a
                href={KRON_CHART_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="kd-btn inline-flex items-center gap-2 text-black font-semibold text-base px-6 py-3 rounded-xl"
              >
                Buy
              </a>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-cyan-900/20 bg-[#070b10]/55 backdrop-blur-xl">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-cyan-200">KASDISTRO</div>
            <div className="flex items-center gap-6 text-xs text-cyan-200">
              <a href="/#how-it-works" className="hover:text-cyan-100">How It Works</a>
              <a href="/#distro" className="hover:text-cyan-100">Distro</a>
              <a href="/#token-distribution" className="hover:text-cyan-100">Token Distribution</a>
              <a href="/#chart" className="hover:text-cyan-100">Chart</a>
              <a href="/#holder-rewards" className="hover:text-cyan-100">Holder Rewards</a>
            </div>
            <SocialLinks />
          </div>
        </footer>
      </KineticGrid>
    </div>
  );
}
