import { type ReactNode } from 'react';
import KineticGrid from '@/components/ui/kinetic-grid';

const LINKS = [
  { label: 'How It Works', href: '/#how-it-works' },
  { label: 'Distro', href: '/#distro' },
  { label: 'Features', href: '/#features' },
  { label: 'Fees', href: '/#fees' },
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
  {
    label: 'Kron Discord',
    href: 'https://discord.gg/n8HN7y6yg',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full fill-current">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
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
                href="/#distro"
                className="kd-btn inline-flex items-center gap-2 text-black font-semibold text-base px-6 py-3 rounded-xl"
              >
                Open Distro
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
