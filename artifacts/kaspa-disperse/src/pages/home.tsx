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

const SERVICE_FEE_KAS = 100;
const SERVICE_FEE_ADDRESS = 'kaspa:qz6dltvkds80wf8raac504ze4nesgnk72n24jr7krum2m8dq34khvkevr88cc';

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

interface TransactionReview {
  txJsonString: string;
  inputIndicesToSign: number[];
  recipientTotalSompi: string;
  serviceFeeSompi: string;
  networkFeeSompi: string;
  grandTotalSompi: string;
  mass: number;
  maximumMass: number;
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
  const [serviceFeeStatus, setServiceFeeStatus] = useState<TransferStatus>({ status: 'pending', txId: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [review, setReview] = useState<TransactionReview | null>(null);
  const [transactionError, setTransactionError] = useState('');

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
    setServiceFeeStatus({ status: 'pending', txId: '' });
    setReview(null);
    setTransactionError('');
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
  const handlePrepareReview = async () => {
    if (!account) { setIsWalletModalOpen(true); return; }
    if (recipients.length === 0) return;
    const provider = account.provider;
    if (account.walletId !== 'kasware' || typeof provider?.signPskt !== 'function' || typeof provider?.pushTx !== 'function') {
      setTransactionError('Single-approval dispersals currently require KasWare Wallet.');
      return;
    }
    setIsProcessing(true);
    setTransactionError('');
    try {
      const response = await fetch('/api/kaspa/build-pskt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderAddress: account.address, recipients }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not prepare transaction.');
      setReview(body);
    } catch (err: any) {
      setTransactionError(err?.message ?? 'Could not prepare transaction.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignAndBroadcast = async () => {
    if (!account || !review) return;
    setIsProcessing(true);
    setTransactionError('');
    setStatuses(recipients.map(() => ({ status: 'signing', txId: '' })));
    setServiceFeeStatus({ status: 'signing', txId: '' });
    try {
      const signed = await account.provider.signPskt({
        txJsonString: review.txJsonString,
        options: {
          signInputs: review.inputIndicesToSign.map(index => ({ index, sighashType: 1 })),
        },
      });
      const signedJson = typeof signed === 'string' ? signed : signed?.txJsonString;
      if (!signedJson) throw new Error('KasWare did not return a signed transaction.');
      const pushed = await account.provider.pushTx(signedJson);
      const txId = typeof pushed === 'string'
        ? (() => { try { return JSON.parse(pushed)?.id ?? pushed; } catch { return pushed; } })()
        : (pushed?.id ?? pushed?.txId ?? '');
      setStatuses(recipients.map(() => ({ status: 'sent', txId })));
      setServiceFeeStatus({ status: 'sent', txId });
      setReview(null);
    } catch (err: any) {
      const message = err?.message ?? 'Transaction was rejected.';
      setStatuses(recipients.map(() => ({ status: 'failed', txId: '', error: message })));
      setServiceFeeStatus({ status: 'failed', txId: '', error: message });
      setTransactionError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const totalKas = recipients.reduce((s, r) => s + r.amount, 0);
  const sentCount = statuses.filter(s => s.status === 'sent').length;
  const failedCount = statuses.filter(s => s.status === 'failed').length;
  const pendingCount = statuses.filter(s => s.status === 'pending').length;
  const signingIdx = statuses.findIndex(s => s.status === 'signing');
  const isFeeSigning = serviceFeeStatus.status === 'signing';
  const sompiToKas = (sompi: string) => (Number(sompi) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });

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
              <span>One transaction, subject to Kaspa mass limits</span>
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

            <div className="rounded-xl bg-amber-950/30 border border-amber-700/50 p-3 text-xs text-amber-300">
              <div className="flex items-center justify-between font-semibold">
                <span>Service fee</span>
                <span>{SERVICE_FEE_KAS} KAS</span>
              </div>
              <div className="text-amber-400/80 mt-1">
                 Included in the same atomic transaction as every recipient.
              </div>
            </div>

            {review && (
              <div className="rounded-xl bg-emerald-950/25 border border-emerald-700/50 p-4 text-xs space-y-2">
                <div className="font-semibold text-emerald-300">Review before signing</div>
                <div className="flex justify-between"><span className="text-zinc-400">Recipients</span><span>{sompiToKas(review.recipientTotalSompi)} KAS</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Service fee</span><span>{sompiToKas(review.serviceFeeSompi)} KAS</span></div>
                <div className="flex justify-between"><span className="text-zinc-400">Network fee</span><span>{sompiToKas(review.networkFeeSompi)} KAS</span></div>
                <div className="flex justify-between border-t border-emerald-800/60 pt-2 font-semibold"><span>Grand total</span><span>{sompiToKas(review.grandTotalSompi)} KAS</span></div>
                <div className="text-[10px] text-zinc-500">Transaction mass: {review.mass.toLocaleString()} / {review.maximumMass.toLocaleString()}</div>
              </div>
            )}

            {transactionError && (
              <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-3 text-xs text-red-300">
                {transactionError}
              </div>
            )}

            {/* Progress during send */}
            {isProcessing && (signingIdx !== -1 || isFeeSigning) && (
              <div className="rounded-xl bg-amber-950/30 border border-amber-700/40 p-3 text-xs text-amber-300 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                {isFeeSigning
                  ? 'Approve the complete dispersal once in KasWare…'
                  : `Signing all ${recipients.length} recipients in one transaction…`}
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

                <div className="flex items-center justify-between rounded-xl bg-amber-950/20 border border-amber-800/50 px-3 py-2.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-amber-300">Service fee</div>
                    <div className="font-mono text-amber-400/70 truncate text-[10px]">
                      {SERVICE_FEE_ADDRESS.slice(0, 16)}…{SERVICE_FEE_ADDRESS.slice(-6)}
                    </div>
                    {serviceFeeStatus.txId && (
                      <a
                        href={`https://explorer.kaspa.org/txs/${serviceFeeStatus.txId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 mt-0.5"
                      >
                        {serviceFeeStatus.txId.slice(0, 10)}… <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                    {serviceFeeStatus.error && (
                      <div className="text-[10px] text-red-400 mt-0.5">{serviceFeeStatus.error}</div>
                    )}
                  </div>
                  <div className="shrink-0 ml-2">
                    {serviceFeeStatus.status === 'pending' && <span className="text-zinc-500">Same transaction</span>}
                    {serviceFeeStatus.status === 'signing' && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Approve
                      </span>
                    )}
                    {serviceFeeStatus.status === 'sent' && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                      </span>
                    )}
                    {serviceFeeStatus.status === 'failed' && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Failed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Send button */}
            <button
              disabled={isProcessing || recipients.length === 0}
              onClick={review ? handleSignAndBroadcast : handlePrepareReview}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                isProcessing || recipients.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
              }`}
            >
              {isProcessing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {review ? 'Waiting for KasWare…' : 'Preparing review…'}</>
              ) : (
                <><Send className="h-4 w-4" /> {review ? 'Approve & Send Once' : `Review KAS + ${SERVICE_FEE_KAS} KAS Fee`}</>
              )}
            </button>

            {recipients.length > 0 && !isProcessing && (
              <p className="text-[11px] text-zinc-500 text-center">
                KasWare signs all recipients, the service fee, and change with one approval
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
