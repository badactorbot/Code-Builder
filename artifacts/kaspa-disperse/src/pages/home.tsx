import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { LandingLayout } from '@/components/dispenser/landing-layout';
import { DispenserLogo } from '@/components/dispenser/brand-logo';
import { TokenDistributionChart } from '@/components/dispenser/token-distribution-chart';
import KineticGrid from '@/components/ui/kinetic-grid';

export default function Home() {
  return (
    <LandingLayout>
      <KineticGrid className="h-dvh min-h-dvh">
        <div className="flex h-full min-h-full flex-col items-center justify-center px-4 sm:px-6 py-24 text-center">
          <DispenserLogo size="hero" className="mb-8" />
          <p className="mb-6 rounded-full border border-cyan-500/25 bg-cyan-500/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/90">
            KASDISTRO
          </p>
          <h1 className="max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1]">
            Reward Your Community in{' '}
            <span className="kd-gradient-text">KAS</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-white/55 max-w-2xl">
            One tool. Multiple wallets. One transaction flow.
          </p>
          <p className="mt-4 text-base text-white/40 max-w-3xl leading-relaxed">
            KASDISTRO gives projects, creators, communities, and teams an easy way to
            distribute KAS rewards to multiple wallet addresses at once.
          </p>
          <p className="mt-6 text-cyan-300/90 font-medium">
            Load your list. Set your rewards. Send the KAS.
          </p>
          <div className="mt-10">
            <Link
              href="/dispenser"
              className="kd-btn inline-flex items-center justify-center gap-2 text-black font-bold rounded-xl uppercase tracking-wide px-10 py-4 text-sm"
            >
              Launch KASDISTRO <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </KineticGrid>

      <section id="token-distribution" className="border-t border-cyan-900/20 py-20 sm:py-24 bg-[#070b10]/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Token Distribution</h2>
            <p className="mt-3 text-zinc-500 max-w-xl mx-auto">
              A clear split: burn, dev, team, marketing, and community.
            </p>
          </div>
          <div className="max-w-3xl mx-auto kd-glass-strong rounded-2xl p-8">
            <TokenDistributionChart />
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
