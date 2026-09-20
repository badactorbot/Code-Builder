import { ExternalLink, Github } from 'lucide-react';
import { LandingLayout } from '@/components/dispenser/landing-layout';
import { VOLUME_BOT_URL } from '@/lib/dispenser/constants';

export default function VolumeBot() {
  return (
    <LandingLayout showGrid={false}>
      <div className="border-b border-cyan-900/20 bg-[#070b10]/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              Volume Bot
            </p>
            <p className="mt-1 text-sm text-cyan-200">
              Live kasvolume console. Connect Kasware, set a token, activate, then run cycles.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://github.com/badactorbot/kasvolume"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-cyan-100 hover:text-white"
            >
              <Github className="h-4 w-4" />
              kasvolume
            </a>
            <a
              href={VOLUME_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/20 hover:text-white"
            >
              Open full console
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
      <iframe
        title="Volume Bot console"
        src={VOLUME_BOT_URL}
        className="block h-[calc(100dvh-12rem)] w-full border-0 bg-[#0b1014]"
        allow="clipboard-read; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </LandingLayout>
  );
}
