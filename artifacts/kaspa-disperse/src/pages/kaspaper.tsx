import { Download } from 'lucide-react';
import { LandingLayout } from '@/components/dispenser/landing-layout';

const PDF_FILE = 'KasDistro_White_Paper_v1.0.pdf';
const pdfSrc = `${import.meta.env.BASE_URL}${PDF_FILE}`;

export default function Kaspaper() {
  return (
    <LandingLayout>
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/90">
                White Paper
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                Kaspaper
              </h1>
              <p className="mt-3 max-w-2xl text-base text-cyan-300/90">
                KasDistro Protocol White Paper v1.0 — enterprise-grade native KAS
                distribution architecture.
              </p>
            </div>
            <a
              href={pdfSrc}
              download={PDF_FILE}
              className="kd-btn inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-black"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl border border-cyan-900/30 bg-[#070b10]/80 shadow-[0_0_40px_rgba(8,47,73,0.35)]">
            <iframe
              title="KasDistro White Paper"
              src={pdfSrc}
              className="h-[min(85dvh,1100px)] w-full border-0 bg-white"
            />
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
