import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  KRON_CHART_URL,
  KRON_IDX_URL,
  KRON_TOKEN_TICK,
} from '@/lib/dispenser/constants';

const INTERVALS = [
  { id: '15m', label: '15m' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
] as const;

type KronInterval = (typeof INTERVALS)[number]['id'];

interface OhlcPoint {
  time: number;
  open: number;
  high: number;
  close: number;
  low: number;
  volume: number;
}

interface TokenMeta {
  tick: string;
  name?: string;
  price: number;
  change24h: number;
  volume24h: number;
}

const chartConfig = {
  close: {
    label: 'Price (KAS)',
    color: '#22d3ee',
  },
} satisfies ChartConfig;

function formatKas(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatTime(time: number, interval: KronInterval) {
  const date = new Date(time * 1000);
  if (interval === '1d') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatTooltipTime(time: number) {
  return new Date(time * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`KRON returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function KronPriceChart() {
  const [interval, setInterval] = useState<KronInterval>('1h');
  const [points, setPoints] = useState<OhlcPoint[]>([]);
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async (quiet = false) => {
      if (!quiet) {
        setLoading(true);
        setError('');
      }
      try {
        const [ohlcBody, metaBody] = await Promise.all([
          fetchJson<{ result?: OhlcPoint[] }>(
            `${KRON_IDX_URL}/v1/kcc20/token/${encodeURIComponent(KRON_TOKEN_TICK)}/ohlc?interval=${interval}`,
          ),
          fetchJson<{ result?: TokenMeta[] }>(
            `${KRON_IDX_URL}/v1/kcc20/token/${encodeURIComponent(KRON_TOKEN_TICK)}`,
          ),
        ]);
        if (cancelled) return;
        const candles = Array.isArray(ohlcBody.result) ? ohlcBody.result : [];
        const token = Array.isArray(metaBody.result) ? metaBody.result[0] ?? null : null;
        setPoints(candles);
        setMeta(token);
        setError(candles.length === 0 ? 'No KRON chart data yet.' : '');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load KRON chart.');
        if (!quiet) setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => { void load(true); }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [interval]);

  const up = (meta?.change24h ?? 0) >= 0;
  const data = points.map((point) => ({ ...point, label: formatTime(point.time, interval) }));

  return (
    <div className="kd-glass-strong rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 px-5 py-5 border-b border-cyan-900/20">
        <div>
          <div className="text-xs uppercase tracking-wider text-cyan-400">KRON</div>
          <div className="mt-1 flex items-baseline gap-3">
            <h2 className="text-2xl font-bold text-white">
              {meta?.tick ?? KRON_TOKEN_TICK}
              {meta?.name ? <span className="ml-2 text-base font-medium text-cyan-200">{meta.name}</span> : null}
            </h2>
          </div>
          {meta && (
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-xl font-semibold text-white tabular-nums">{formatKas(meta.price)} KAS</span>
              <span className={`text-sm font-medium tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                {up ? '+' : ''}{meta.change24h.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-3">
          <div className="flex rounded-xl border border-cyan-900/30 overflow-hidden">
            {INTERVALS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setInterval(item.id)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  interval === item.id
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <a
            href={KRON_CHART_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-end gap-1.5 text-sm font-medium text-cyan-300 hover:text-white transition"
          >
            Open on KRON <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="p-4 sm:p-6 min-h-[320px]">
        {loading && points.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-cyan-200 text-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading chart…
          </div>
        ) : error && points.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-zinc-400">{error}</p>
            <a
              href={KRON_CHART_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="kd-btn inline-flex items-center gap-2 text-black font-bold rounded-xl px-5 py-2.5 text-sm"
            >
              Open Chart on KRON <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="kronPriceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#164e63" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#67e8f9', fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                dataKey="close"
                domain={['auto', 'auto']}
                tickLine={false}
                axisLine={false}
                width={72}
                tick={{ fill: '#67e8f9', fontSize: 11 }}
                tickFormatter={(value: number) => formatKas(value)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => {
                      const time = payload?.[0]?.payload?.time;
                      return typeof time === 'number' ? formatTooltipTime(time) : '';
                    }}
                    formatter={(value) => [`${formatKas(Number(value))} KAS`, 'Price']}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#kronPriceFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
