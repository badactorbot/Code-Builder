import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { type ReactNode } from 'react';

export function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="kd-app relative h-dvh overflow-hidden text-zinc-100">
      <header className="absolute top-0 inset-x-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-end">
          <Link
            href="/dispenser"
            className="kd-btn inline-flex items-center gap-2 text-black font-semibold text-sm px-5 py-2.5 rounded-xl"
          >
            Launch KASDISTRO <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <main className="h-full">{children}</main>
    </div>
  );
}
