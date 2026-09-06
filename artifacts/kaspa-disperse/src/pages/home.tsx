import { ArrowRight, Shield } from 'lucide-react';
import { LandingLayout } from '@/components/dispenser/landing-layout';
import { DispenserLogo } from '@/components/dispenser/brand-logo';
import { TokenDistributionChart } from '@/components/dispenser/token-distribution-chart';
import { DISTRO_APP_URL, SERVICE_FEE_KAS } from '@/lib/dispenser/constants';

const STEPS = [
  { num: '01', title: 'Connect', body: 'Link your Kaspa wallet.' },
  { num: '02', title: 'Add wallets', body: 'Paste addresses or upload a CSV.' },
  { num: '03', title: 'Set amounts', body: 'Same amount for all, or custom per wallet.' },
  { num: '04', title: 'Review', body: 'See recipients, total KAS, and fees.' },
  { num: '05', title: 'Send', body: 'Approve once and distribute.' },
];

export default function Home() {
  return (
    <LandingLayout>
      <section className="relative min-h-[min(72dvh,640px)] flex flex-col items-center justify-center px-4 sm:px-6 py-16 text-center">
        <DispenserLogo size="hero" className="mb-8" />
        <h1 className="max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-bold text-zinc-900 tracking-tight leading-[1.1]">
          Reward Your Community in{' '}
          <span className="kd-gradient-text">KAS</span>
        </h1>
        <p className="mt-5 text-lg text-zinc-600 max-w-2xl">
          Bulk-send KAS to many wallets in one flow. You approve every transfer.
        </p>
        <a
          href="#distro"
          className="kd-btn mt-8 inline-flex items-center justify-center gap-2 text-black font-bold rounded-xl uppercase tracking-wide px-10 py-4 text-sm"
        >
          Open Distro <ArrowRight className="h-4 w-4" />
        </a>
      </section>

      <section id="how-it-works" className="border-t border-cyan-900/10 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 text-center">How to use it</h2>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-5 gap-3">
            {STEPS.map((step) => (
              <div key={step.num} className="kd-glass rounded-2xl p-4">
                <span className="text-cyan-700 font-mono text-xs font-bold">{step.num}</span>
                <h3 className="text-sm font-semibold text-zinc-900 mt-1">{step.title}</h3>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-zinc-600 flex items-center justify-center gap-2">
            <Shield className="h-4 w-4 text-cyan-700" />
            {SERVICE_FEE_KAS} KAS flat service fee, plus network fees. Totals show before you confirm.
          </p>
        </div>
      </section>

      <section id="distro" className="border-t border-cyan-900/10 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl overflow-hidden border border-cyan-900/15 shadow-[0_20px_60px_rgba(15,48,64,0.12)] bg-[#060a0e]">
            <iframe
              src={DISTRO_APP_URL}
              title="KASDISTRO Distro"
              className="w-full h-[min(92dvh,1100px)] bg-[#060a0e] border-0"
              allow="clipboard-write; clipboard-read"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      </section>

      <section id="token-distribution" className="border-t border-cyan-900/10 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-zinc-900">Token Distribution</h2>
          </div>
          <div className="max-w-3xl mx-auto kd-glass-strong rounded-2xl p-8">
            <TokenDistributionChart />
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
