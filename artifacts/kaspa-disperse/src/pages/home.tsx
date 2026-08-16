import React, { useState, useEffect, useRef } from 'react';
import {
  Wallet, Upload, Send, CheckCircle2, AlertCircle, X,
  Download, ExternalLink, Loader2, FileText, Layers,
} from 'lucide-react';

// ── Wallets ───────────────────────────────────────────────────────────────────
const KASPA_WALLETS = [
  {
    id: 'kasware',
    name: 'KasWare Wallet',
    icon: 'https://www.kasware.xyz/logo.png',
    type: 'extension',
    getProvider: () => typeof window !== 'undefined' ? (window as any).kasware : null,
    downloadUrl: 'https://chromewebstore.google.com/detail/kasware-wallet/hklhheigdmpoolooomdihmhlpjjdbklf',
  },
  {
    id: 'kastle',
    name: 'Kastle Wallet',
    icon: 'https://kastle.forbole.com/favicon.ico',
    type: 'extension',
    getProvider: () => typeof window !== 'undefined' ? (window as any).kastle : null,
    downloadUrl: 'https://chromewebstore.google.com/detail/kastle/oambclflhjfppdmkghokjmpppmaebego',
  },
  {
    id: 'nightly',
    name: 'Nightly Wallet',
    icon: 'https://nightly.app/favicon.ico',
    type: 'extension',
    getProvider: () => typeof window !== 'undefined' ? (window as any).nightly?.kaspa : null,
    downloadUrl: 'https://nightly.app/',
  },
  {
    id: 'bitget',
    name: 'Bitget Wallet',
    icon: 'https://web3.bitget.com/favicon.ico',
    type: 'extension',
    getProvider: () => typeof window !== 'undefined'
      ? ((window as any).bitgetWallet?.kaspa || (window as any).bitget?.kaspa)
      : null,
    downloadUrl: 'https://web3.bitget.com/',
  },
  {
    id: 'kaspium',
    name: 'Kaspium Mobile',
    icon: 'https://kaspium.io/favicon.ico',
    type: 'mobile',
    getProvider: null,
    downloadUrl: 'https://kaspium.io/',
  },
];

const BATCH_SIZE = 50;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Recipient {
  address: string;
  amount: number; // KAS
}

interface TransferStatus {
  status: 'pending' | 'signing' | 'sent' | 'failed';
  txId: string;
  error?: string;
}

interface WalletAccount {
  address: string;
  walletId: string;
  walletName: string;
  provider: any;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [walletError, setWalletError] = useState('');
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});

  const [rawInput, setRawInput] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<TransferStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect installed wallets
  useEffect(() => {
    const check = () => {
      const map: Record<string, boolean> = {};
      KASPA_WALLETS.forEach((w) => {
        if (w.type === 'extension' && w.getProvider) map[w.id] = !!w.getProvider();
      });
      setInstalledMap(map);
    };
    check();
    const t = setTimeout(check, 600);
    return () => clearTimeout(t);
  }, [isWalletModalOpen]);

  // ── Parse input ──────────────────────────────────────────────────────────
  const handleParseInput = (text: string) => {
    setRawInput(text);
    const parsed: Recipient[] = [];
    const errors: string[] = [];

    text.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split(/[\s,=]+/);
      if (parts.length >= 2) {
        const address = parts[0].trim();
        const amount = parseFloat(parts[1].trim());
        const validAddr = address.startsWith('kaspa:') || address.startsWith('kaspatest:');
        if (!validAddr) errors.push(`Line ${i + 1}: Invalid address`);
        else if (isNaN(amount) || amount <= 0) errors.push(`Line ${i + 1}: Invalid amount`);
        else parsed.push({ address, amount });
      } else if (trimmed.length > 0) {
        errors.push(`Line ${i + 1}: Could not parse`);
      }
    });

    setRecipients(parsed);
    setParseErrors(errors);
    setStatuses(parsed.map(() => ({ status: 'pending', txId: '' })));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleParseInput(ev.target?.result as string);
    reader.readAsText(file);
  };

  // ── Connect wallet ───────────────────────────────────────────────────────
  const handleConnectWallet = async (wallet: typeof KASPA_WALLETS[0]) => {
    setWalletError('');
    setWalletLoading(wallet.id);
    try {
      if (wallet.type === 'extension') {
        const provider = wallet.getProvider ? wallet.getProvider() : null;
        if (!provider) throw new Error(`${wallet.name} is not installed.`);
        let accounts: any[] = [];
        if (typeof provider.requestAccounts === 'function') accounts = await provider.requestAccounts();
        else if (typeof provider.connect === 'function') accounts = await provider.connect();
        else if (typeof provider.getAccounts === 'function') accounts = await provider.getAccounts();
        if (!accounts?.length) throw new Error('No account returned from wallet.');
        const addr = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
        setAccount({ address: addr, walletId: wallet.id, walletName: wallet.name, provider });
        setIsWalletModalOpen(false);
      } else {
        window.open(wallet.downloadUrl, '_blank');
      }
    } catch (err: any) {
      setWalletError(err.message || 'Failed to connect.');
    } finally {
      setWalletLoading(null);
    }
  };

  // ── Execute ──────────────────────────────────────────────────────────────
  const handleExecute = async () => {
    if (!account) { setIsWalletModalOpen(true); return; }
    if (recipients.length === 0) return;

    const provider = account.provider;
    if (!provider || typeof provider.sendKaspa !== 'function') {
      alert('Connected wallet does not support sendKaspa. Please use KasWare or Kastle.');
      return;
    }

    setIsProcessing(true);
    const newStatuses: TransferStatus[] = recipients.map(() => ({ status: 'pending', txId: '' }));
    setStatuses([...newStatuses]);

    for (let i = 0; i < recipients.length; i++) {
      const { address, amount } = recipients[i];
      newStatuses[i] = { status: 'signing', txId: '' };
      setStatuses([...newStatuses]);

      // Kaspa rejects a tx that spends unconfirmed change from the previous tx
      // ("orphan disallowed"). Retry up to 5× with increasing waits to let the
      // previous transaction settle into the DAG (~1 block per second).
      const MAX_RETRIES = 5;
      let lastErr: any = null;
      let txId = '';
      let succeeded = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
          // 2 s, 4 s, 6 s, 8 s — enough for the previous UTXO to confirm
          const waitMs = attempt * 2000;
          newStatuses[i] = {
            status: 'signing',
            txId: '',
            error: `Orphan retry ${attempt}/${MAX_RETRIES - 1} — waiting ${waitMs / 1000}s…`,
          };
          setStatuses([...newStatuses]);
          await new Promise((res) => setTimeout(res, waitMs));
          newStatuses[i] = { status: 'signing', txId: '' };
          setStatuses([...newStatuses]);
        }

        try {
          const sompi = Math.round(amount * 1e8);
          const raw = await provider.sendKaspa(address, sompi);
          txId = typeof raw === 'string' ? raw : (raw?.txId ?? raw?.id ?? '');
          succeeded = true;
          break;
        } catch (err: any) {
          lastErr = err;
          const msg: string = err?.message ?? '';
          // Only retry on orphan errors; surface anything else immediately
          if (!msg.toLowerCase().includes('orphan')) break;
        }
      }

      if (succeeded) {
        newStatuses[i] = { status: 'sent', txId };
        setStatuses([...newStatuses]);
        // Brief pause between sends to let the wallet's UTXO state settle
        if (i < recipients.length - 1) await new Promise((res) => setTimeout(res, 1500));
      } else {
        newStatuses[i] = { status: 'failed', txId: '', error: lastErr?.message ?? 'Rejected' };
        setStatuses([...newStatuses]);
        setIsProcessing(false);
        return;
      }
    }

    setIsProcessing(false);
  };

  const totalKas = recipients.reduce((s, r) => s + r.amount, 0);
  const sentCount = statuses.filter(s => s.status === 'sent').length;
  const failedCount = statuses.filter(s => s.status === 'failed').length;
  const pendingCount = statuses.filter(s => s.status === 'pending').length;
  const signingIdx = statuses.findIndex(s => s.status === 'signing');

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">

      {/* NAV */}
      <nav className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Layers className="h-4 w-4 text-black" />
            </div>
            <div>
              <span className="font-bold text-sm text-white">Kaspa Disperse</span>
              <p className="text-[10px] text-zinc-500 leading-none">Bulk KAS Sender</p>
            </div>
          </div>

          {account ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-right">
                <div className="text-xs font-medium text-zinc-200">{account.walletName}</div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  {account.address.slice(0, 12)}…{account.address.slice(-6)}
                </div>
              </div>
              <button
                onClick={() => setAccount(null)}
                className="flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition"
              >
                <X className="h-3.5 w-3.5" /> Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-500/20"
            >
              <Wallet className="h-4 w-4" /> Connect Wallet
            </button>
          )}
        </div>
      </nav>

      {/* MAIN */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 grid lg:grid-cols-12 gap-6 flex-1">

        {/* LEFT — Input */}
        <section className="lg:col-span-7 space-y-6">

          {/* Recipient input */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                Recipient Addresses &amp; Amounts
              </label>
              <div>
                <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-lg transition"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload CSV
                </button>
              </div>
            </div>

            <textarea
              rows={12}
              value={rawInput}
              onChange={(e) => handleParseInput(e.target.value)}
              placeholder={`kaspa:qq2... 150.5\nkaspa:qr8... 200\nkaspa:qz7... 50`}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-4 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none"
            />

            <div className="text-xs text-zinc-500 flex justify-between">
              <span>Format: <code className="text-zinc-400">address amount</code> or <code className="text-zinc-400">address,amount</code></span>
              <span>≤{BATCH_SIZE} per batch</span>
            </div>

            {parseErrors.length > 0 && (
              <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-4 space-y-1 text-xs text-red-300">
                <div className="font-semibold flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Parse errors ({parseErrors.length})
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 max-h-24 overflow-y-auto">
                  {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — Summary + Actions */}
        <section className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-xl space-y-6 sticky top-24">

            <h2 className="text-base font-semibold border-b border-zinc-800 pb-3 flex items-center justify-between">
              <span>Disperse Summary</span>
              <Layers className="h-4 w-4 text-emerald-400" />
            </h2>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5">
                <div className="text-xs text-zinc-400">Recipients</div>
                <div className="text-xl font-bold text-white mt-1">{recipients.length}</div>
              </div>
              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5">
                <div className="text-xs text-zinc-400">Total KAS</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {totalKas.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                </div>
              </div>
            </div>

            {/* Progress during send */}
            {isProcessing && signingIdx !== -1 && (
              <div className="rounded-xl bg-amber-950/30 border border-amber-700/40 p-3 text-xs text-amber-300 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                Sending {signingIdx + 1} of {recipients.length} — approve in wallet…
              </div>
            )}

            {/* Transfer list */}
            {recipients.length > 0 && (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                <div className="text-xs font-medium text-zinc-400 flex justify-between">
                  <span>Transfers</span>
                  {sentCount > 0 && <span className="text-emerald-400">{sentCount} sent</span>}
                  {failedCount > 0 && <span className="text-red-400 ml-2">{failedCount} failed</span>}
                </div>

                {recipients.map((r, idx) => {
                  const st = statuses[idx] ?? { status: 'pending', txId: '' };
                  return (
                    <div key={idx} className="flex items-center justify-between rounded-xl bg-zinc-950 border border-zinc-800 px-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-mono text-zinc-400 truncate text-[11px]">
                          {r.address.slice(0, 16)}…{r.address.slice(-6)}
                        </div>
                        <div className="font-semibold text-zinc-200 mt-0.5">{r.amount} KAS</div>
                        {st.txId && (
                          <a
                            href={`https://explorer.kaspa.org/txs/${st.txId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            {st.txId.slice(0, 10)}… <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        {st.error && <div className="text-[10px] text-red-400 mt-0.5">{st.error}</div>}
                      </div>
                      <div className="shrink-0 ml-2">
                        {st.status === 'pending' && <span className="text-zinc-500">Pending</span>}
                        {st.status === 'signing' && (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Signing
                          </span>
                        )}
                        {st.status === 'sent' && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                          </span>
                        )}
                        {st.status === 'failed' && (
                          <span className="text-red-400 flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5" /> Failed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Send button */}
            <button
              disabled={isProcessing || recipients.length === 0}
              onClick={handleExecute}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                isProcessing || recipients.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
              }`}
            >
              {isProcessing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Sending… ({pendingCount} remaining)</>
              ) : (
                <><Send className="h-4 w-4" /> Send KAS</>
              )}
            </button>

            {recipients.length > 0 && !isProcessing && (
              <p className="text-[11px] text-zinc-500 text-center">
                Each transfer requires one wallet approval
              </p>
            )}
          </div>
        </section>
      </main>

      {/* WALLET MODAL */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Select Wallet</h2>
              </div>
              <button
                onClick={() => setIsWalletModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {walletError && (
              <div className="mt-4 rounded-lg bg-red-950/50 border border-red-800/60 p-3 text-xs text-red-300">
                {walletError}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {KASPA_WALLETS.map((wallet) => {
                const isInstalled = wallet.type !== 'extension' || installedMap[wallet.id];
                const isLoading = walletLoading === wallet.id;
                return (
                  <div
                    key={wallet.id}
                    onClick={() => isInstalled && !isLoading && handleConnectWallet(wallet)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer ${
                      isInstalled
                        ? 'border-zinc-800 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-700'
                        : 'border-zinc-800/50 bg-zinc-900/30 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-zinc-800 p-1 flex items-center justify-center border border-zinc-700/50">
                        <img
                          src={wallet.icon}
                          alt={wallet.name}
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).onerror = null;
                            (e.target as HTMLImageElement).src = 'https://kaspa.org/wp-content/uploads/2022/09/kaspa-icon.png';
                          }}
                        />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{wallet.name}</div>
                        <span className="text-[11px] text-zinc-400">
                          {wallet.type === 'extension'
                            ? (isInstalled ? 'Browser Extension' : 'Not Installed')
                            : `${wallet.type.charAt(0).toUpperCase() + wallet.type.slice(1)} Wallet`}
                        </span>
                      </div>
                    </div>
                    <div>
                      {isLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                      ) : !isInstalled ? (
                        <a
                          href={wallet.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
                        >
                          Get <Download className="h-3 w-3" />
                        </a>
                      ) : (
                        <ExternalLink className="h-4 w-4 text-zinc-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
