import { type ReactNode } from 'react';
import { Shield, Layers, Wallet } from 'lucide-react';
import { LandingLayout } from '@/components/dispenser/landing-layout';
import { DispenserLogo } from '@/components/dispenser/brand-logo';
import { SERVICE_FEE_ADDRESS } from '@/lib/dispenser/constants';

const BURN_ADDRESS =
  'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

const INGESTION = [
  'Manually entered Kaspa target addresses',
  'KRC-20 token-holder verified snapshots',
  'KCC-20 token-holder snapshots, including live bonding-curve KRON tokens',
];

const RISKS = [
  'Address transcription corruption and duplicate payments',
  'Unintentional omissions and inconsistent payment allocations',
  'Exceeding strict Kaspa transaction storage mass limits',
  'Failure states that obscure partial completion tracking',
];

const WORKFLOW = [
  'User connects a compatible KasWare wallet.',
  'Recipient source is selected, ingested, and validated.',
  'Addresses are deduplicated and purged of ineligible records.',
  'Recipients are batched into groups of 90.',
  'Transactions are sequentially constructed, signed via KasWare, and broadcast with an automated 100 KAS service fee per batch.',
];

const PRINCIPLES = [
  {
    icon: Shield,
    title: 'Non-Custodial Authorization',
    body: 'Zero private key exposure; absolute user sovereignty via KasWare.',
  },
  {
    icon: Layers,
    title: 'Mass-Safe Batching',
    body: 'Capping batches at 90 prevents storage mass limit overflows (for example, historical 100-recipient mass spikes past 500,000).',
  },
  {
    icon: Wallet,
    title: 'Sequential UTXO Management',
    body: 'Prevents double-spending by updating the UTXO state after every individual transaction broadcast.',
  },
];

const BATCH_ROWS = [
  ['1 – 90', '90', '1', '100 KAS'],
  ['91 – 180', '90', '2', '200 KAS'],
  ['181 – 270', '90', '3', '300 KAS'],
  ['901 – 990', '90', '11', '1,100 KAS'],
];

const REVENUE_ROWS = [
  ['50 Recipients', '1', '100 KAS'],
  ['250 Recipients', '3', '300 KAS'],
  ['1,000 Recipients', '12', '1,200 KAS'],
  ['5,000 Recipients', '56', '5,600 KAS'],
  ['10,000 Recipients', '112', '11,200 KAS'],
];

const ROADMAP = [
  {
    phase: '01',
    title: 'Core Distribution',
    body: 'Native-KAS distribution, KasWare integration, 90-recipient batching, and sequential UTXO handling.',
  },
  {
    phase: '02',
    title: 'Token Intelligence',
    body: 'Full KCC-20 pagination, KRON pre-graduation support, and burn-address security hardening.',
  },
  {
    phase: '03',
    title: 'Campaign Tools',
    body: 'Advanced campaign management, saved templates, CSV export, and weighted allocations.',
  },
  {
    phase: '04',
    title: 'Professional Tiers',
    body: 'Professional subscriptions, multi-wallet treasury approval workflows, and role-based permissions.',
  },
  {
    phase: '05',
    title: 'Enterprise',
    body: 'Enterprise infrastructure, white-label portals, and Merkle-based proof attestations.',
  },
];

function Section({
  num,
  title,
  children,
}: {
  num: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-28">
      <div className="mb-6 flex items-baseline gap-4">
        <span className="font-mono text-sm font-bold text-cyan-400">{num}</span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{title}</h2>
      </div>
      <div className="space-y-5 text-base leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

function PaperTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-cyan-900/30">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-cyan-900/30 bg-cyan-500/5">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 font-semibold uppercase tracking-wider text-cyan-300"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('-')} className="border-b border-cyan-900/15 last:border-0">
              {row.map((cell, index) => (
                <td
                  key={`${row[0]}-${index}`}
                  className={`px-4 py-3 ${index === row.length - 1 ? 'font-medium text-white' : 'text-zinc-300'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Kaspaper() {
  return (
    <LandingLayout showGrid={false}>
      <article className="relative">
        <header className="px-4 sm:px-6 pt-16 sm:pt-24 pb-14 text-center">
          <DispenserLogo size="lg" className="mx-auto mb-8" />
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300/90">
            KasDistro Protocol · White Paper v1.0
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-white">
            Enterprise-Grade Native{' '}
            <span className="kd-gradient-text">KAS</span> Distribution
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            The definitive architecture for non-custodial multi-recipient distribution
            on Kaspa. September 2026.
          </p>
        </header>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-8">
          <blockquote className="kd-glass-strong rounded-2xl px-6 py-7 text-center">
            <p className="text-lg sm:text-xl font-medium leading-relaxed text-white">
              KasDistro revenue = completed transactions × 100 KAS.
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              Simple, transparent, and protocol-native.
            </p>
          </blockquote>
        </div>

        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16 space-y-20">
          <Section num="01" title="Executive Summary">
            <p>
              KasDistro is a non-custodial bulk distribution platform engineered specifically
              for the Kaspa ecosystem. It empowers projects, communities, token issuers,
              mining operations, and decentralized organizations to distribute native KAS to
              massive recipient lists without manual transaction construction or compromised
              security.
            </p>
            <p>KasDistro supports three primary recipient ingestion vectors:</p>
            <ul className="grid gap-3">
              {INGESTION.map((item) => (
                <li
                  key={item}
                  className="kd-glass rounded-xl px-4 py-3 text-sm text-zinc-300"
                >
                  {item}
                </li>
              ))}
            </ul>
            <p>
              Large recipient cohorts are intelligently partitioned into sequential, mass-safe
              batches of up to 90 recipients per transaction. Every transaction is independently
              verified and authorized through KasWare Wallet without relinquishing private key
              custody.
            </p>
          </Section>

          <Section num="02" title="The Problem">
            <p>
              Ecosystem participants regularly encounter complex disbursement challenges — from
              token rewards and mining pool distributions to DAO treasuries and airdrops.
              Manual distribution introduces severe systemic risks:
            </p>
            <ul className="space-y-2">
              {RISKS.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="kd-glass-strong rounded-2xl p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
                The Completeness Principle
              </p>
              <p className="mt-3 text-white leading-relaxed">
                A list that appears valid can easily be incomplete or omit critical exclusions.
                KasDistro enforces a strict operational invariant: a holder import must be
                complete, or it must be rejected outright. Capped top-holder API responses are
                never silently converted into incomplete distribution runs.
              </p>
            </div>
          </Section>

          <Section num="03" title="Product Overview">
            <p>
              KasDistro delivers a guided, highly reliable workflow converting raw recipient
              sets into structured transaction sequences:
            </p>
            <ol className="space-y-3">
              {WORKFLOW.map((step, index) => (
                <li key={step} className="flex gap-4 rounded-xl kd-glass p-4">
                  <span className="font-mono text-sm font-bold text-cyan-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-zinc-300">{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm">
              Service-fee destination:{' '}
              <span className="mt-1 block break-all font-mono text-xs text-cyan-300">
                {SERVICE_FEE_ADDRESS}
              </span>
            </p>
          </Section>

          <Section num="04" title="Architectural Principles">
            <div className="grid gap-4">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="kd-glass-strong rounded-2xl p-6 flex gap-4">
                  <div className="h-11 w-11 shrink-0 rounded-xl border border-cyan-500/20 bg-cyan-500/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <p>
              Universal safeguards hardcoded across all distribution paths purge the canonical
              burn address and contract-owned covenant inventory (<span className="font-mono text-cyan-300">covenant:</span>).
            </p>
            <p className="break-all font-mono text-xs text-cyan-300/80">{BURN_ADDRESS}</p>
            <PaperTable
              headers={['Recipient Range', 'Max Batch', 'Transactions', 'Service Fee']}
              rows={BATCH_ROWS}
            />
          </Section>

          <Section num="05" title="Revenue Model">
            <p>
              KasDistro captures sustainable protocol revenue through a hybrid architecture
              combining per-transaction service fees, professional tiers, and enterprise
              white-label licensing.
            </p>
            <PaperTable
              headers={['Campaign Scale', 'Transactions', 'Gross Protocol Revenue']}
              rows={REVENUE_ROWS}
            />
          </Section>

          <Section num="06" title="Strategic Roadmap">
            <div className="relative space-y-4 before:absolute before:left-[1.15rem] before:top-4 before:bottom-4 before:w-px before:bg-cyan-500/20">
              {ROADMAP.map((item) => (
                <div key={item.phase} className="relative grid grid-cols-[2.3rem_1fr] gap-4">
                  <div className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border border-cyan-500/30 bg-[#070b10] font-mono text-xs font-bold text-cyan-300">
                    {item.phase}
                  </div>
                  <div className="kd-glass rounded-2xl p-5">
                    <h3 className="font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section num="07" title="Conclusion">
            <p>
              KasDistro solves the fundamental infrastructure bottleneck of native KAS
              distribution. By uniting unbreakable non-custodial safety, rigorous token
              intelligence, and predictable transaction economics, KasDistro stands as the
              definitive distribution layer for the Kaspa ecosystem.
            </p>
            <p className="text-sm text-zinc-500">
              This document is a technical white paper and product proposal, not financial
              or legal advice. Revenue illustrations are hypothetical.
            </p>
          </Section>
        </div>
      </article>
    </LandingLayout>
  );
}
