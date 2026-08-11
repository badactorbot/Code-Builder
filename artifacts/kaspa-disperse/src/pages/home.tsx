import React, { useState, useEffect, useRef } from 'react';
import { 
  Wallet, Upload, Send, CheckCircle2, AlertCircle, X, Download, 
  ExternalLink, Loader2, FileText, Layers, ShieldCheck 
} from 'lucide-react';

// ==========================================
// KASPA WALLETS CONFIGURATION
// ==========================================
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
    getProvider: () => typeof window !== 'undefined' ? ((window as any).bitgetWallet?.kaspa || (window as any).bitget?.kaspa) : null,
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
  {
    id: 'kaspa-web',
    name: 'Kaspa Web Wallet',
    icon: 'https://wallet.kaspanet.io/favicon.ico',
    type: 'web',
    getProvider: null,
    downloadUrl: 'https://wallet.kaspanet.io/',
  },
];

const BATCH_SIZE = 50;
const PLATFORM_FEE_KAS = 0;
const TREASURY_ADDRESS = 'kaspa:qpzpfwcsqsxhxwup26r55fd0ghqlhyugz8cp6y3wxuddc02vcxtjg75pspnwz';

interface Recipient {
  address: string;
  amount: number;
  sompi: bigint;
}

interface BatchStatus {
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

export default function Home() {
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [walletError, setWalletError] = useState('');
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});

  const [rawInput, setRawInput] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState<Recipient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [batches, setBatches] = useState<Recipient[][]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchStatuses, setBatchStatuses] = useState<BatchStatus[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkProviders = () => {
      const map: Record<string, boolean> = {};
      KASPA_WALLETS.forEach((wallet) => {
        if (wallet.type === 'extension' && wallet.getProvider) {
          map[wallet.id] = !!wallet.getProvider();
        }
      });
      setInstalledMap(map);
    };

    checkProviders();
    const timer = setTimeout(checkProviders, 600);
    return () => clearTimeout(timer);
  }, [isWalletModalOpen]);

  const handleConnectWallet = async (wallet: typeof KASPA_WALLETS[0]) => {
    setWalletError('');
    setWalletLoading(wallet.id);

    try {
      if (wallet.type === 'extension') {
        const provider = wallet.getProvider ? wallet.getProvider() : null;
        if (!provider) {
          throw new Error(`${wallet.name} is not installed in your browser.`);
        }

        let accounts: any[] = [];
        if (typeof provider.requestAccounts === 'function') {
          accounts = await provider.requestAccounts();
        } else if (typeof provider.connect === 'function') {
          accounts = await provider.connect();
        } else if (typeof provider.getAccounts === 'function') {
          accounts = await provider.getAccounts();
        }

        if (accounts && accounts.length > 0) {
          const selectedAddr = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
          setAccount({
            address: selectedAddr,
            walletId: wallet.id,
            walletName: wallet.name,
            provider,
          });
          setIsWalletModalOpen(false);
        } else {
          throw new Error('No account returned from wallet.');
        }
      } else {
        window.open(wallet.downloadUrl, '_blank');
      }
    } catch (err: any) {
      setWalletError(err.message || 'Failed to connect wallet.');
    } finally {
      setWalletLoading(null);
    }
  };

  const handleParseInput = (text: string) => {
    setRawInput(text);
    const lines = text.split('\n');
    const recipients: Recipient[] = [];
    const errors: string[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const parts = trimmed.split(/[\s,=]+/);
      if (parts.length >= 2) {
        const address = parts[0].trim();
        const amountStr = parts[1].trim();
        const amount = parseFloat(amountStr);
        const isValidAddress = address.startsWith('kaspa:') || address.startsWith('kaspatest:');

        if (!isValidAddress) {
          errors.push(`Line ${index + 1}: Invalid Kaspa address format (${address.slice(0, 12)}...)`);
        } else if (isNaN(amount) || amount <= 0) {
          errors.push(`Line ${index + 1}: Invalid amount "${amountStr}"`);
        } else {
          recipients.push({ address, amount, sompi: BigInt(Math.round(amount * 1e8)) });
        }
      } else if (trimmed.length > 0) {
        errors.push(`Line ${index + 1}: Could not parse address and amount`);
      }
    });

    setParsedRecipients(recipients);
    setParseErrors(errors);

    const chunked: Recipient[][] = [];
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      chunked.push(recipients.slice(i, i + BATCH_SIZE));
    }
    setBatches(chunked);
    setBatchStatuses(chunked.map(() => ({ status: 'pending', txId: '' })));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      handleParseInput(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const totalKasToSend = parsedRecipients.reduce((sum, r) => sum + r.amount, 0);

  const handleExecuteDisperse = async () => {
    if (!account) {
      setIsWalletModalOpen(true);
      return;
    }
    if (batches.length === 0) return;

    setIsProcessing(true);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      setBatchStatuses((prev) => {
        const copy = [...prev];
        copy[i] = { ...copy[i], status: 'signing' };
        return copy;
      });

      try {
        const provider = account.provider;

        const sendOutputs = batch.map((r) => ({
          toAddr: r.address,
          amount: Math.round(r.amount * 1e8),
        }));

        if (PLATFORM_FEE_KAS > 0) {
          sendOutputs.push({
            toAddr: TREASURY_ADDRESS,
            amount: Math.round(PLATFORM_FEE_KAS * 1e8),
          });
        }

        let txId = '';

        if (provider && typeof provider.sendKaspa === 'function') {
          txId = await provider.sendKaspa(sendOutputs);
        } else if (provider && typeof provider.sendTransaction === 'function') {
          txId = await provider.sendTransaction({ outputs: sendOutputs });
        } else {
          for (const recipient of batch) {
            txId = await provider.sendKaspa(recipient.address, Math.round(recipient.amount * 1e8));
          }
        }

        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = { status: 'sent', txId: typeof txId === 'string' ? txId : (txId as any)?.txId || 'SUCCESS' };
          return copy;
        });
      } catch (err: any) {
        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = { status: 'failed', txId: '', error: err.message || 'Rejected or Failed' };
          return copy;
        });
        setIsProcessing(false);
        return;
      }
    }

    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      
      {/* HEADER NAV */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="h-full w-full bg-zinc-950 rounded-[10px] flex items-center justify-center font-black text-emerald-400 text-lg">
              K
            </div>
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-white flex items-center gap-2">
              Kaspa Disperse <span className="text-[10px] bg-emerald-950 border border-emerald-800/60 text-emerald-400 px-2 py-0.5 rounded-full uppercase">L1 Native</span>
            </h1>
            <p className="text-xs text-zinc-400">Bulk KAS payment batcher for high-speed BlockDAG distribution</p>
          </div>
        </div>

        <div>
          {account ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-zinc-200">
                  {account.address.slice(0, 10)}...{account.address.slice(-6)}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 uppercase">
                  {account.walletName}
                </span>
              </div>
              <button
                onClick={() => setAccount(null)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-red-400 transition"
                title="Disconnect"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs font-bold text-black transition shadow-lg shadow-emerald-500/10"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN */}
        <section className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                Recipient Addresses &amp; Amounts
              </label>
              <div>
                <input
                  type="file"
                  accept=".csv, .txt"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 px-3 py-1.5 rounded-lg transition"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload CSV
                </button>
              </div>
            </div>

            <textarea
              rows={10}
              value={rawInput}
              onChange={(e) => handleParseInput(e.target.value)}
              placeholder={`kaspa:qq2... 150.5\nkaspa:qr8... 200\nkaspa:qz7... 50`}
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-4 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none"
            />

            <div className="text-xs text-zinc-500 flex justify-between">
              <span>Format: One entry per line (<code className="text-zinc-400">address amount</code> or <code className="text-zinc-400">address,amount</code>)</span>
              <span>Outputs capped at {BATCH_SIZE}/batch</span>
            </div>

            {parseErrors.length > 0 && (
              <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-4 space-y-1 text-xs text-red-300">
                <div className="font-semibold flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Formatting Alerts ({parseErrors.length})
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 max-h-24 overflow-y-auto">
                  {parseErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN */}
        <section className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-xl space-y-6 sticky top-24">
            
            <h2 className="text-base font-semibold border-b border-zinc-800 pb-3 flex items-center justify-between">
              <span>Disperse Summary</span>
              <Layers className="h-4 w-4 text-emerald-400" />
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5">
                <div className="text-xs text-zinc-400">Total Recipients</div>
                <div className="text-xl font-bold text-white mt-1">{parsedRecipients.length}</div>
              </div>

              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5">
                <div className="text-xs text-zinc-400">Total KAS</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {totalKasToSend.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </div>
              </div>

              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5 col-span-2 flex justify-between items-center">
                <div>
                  <div className="text-xs text-zinc-400">Batch Structure</div>
                  <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                    {batches.length} Batch{batches.length === 1 ? '' : 'es'} (~{BATCH_SIZE} outputs/tx)
                  </div>
                </div>
                <ShieldCheck className="h-5 w-5 text-zinc-500" />
              </div>
            </div>

            {batches.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div className="text-xs font-medium text-zinc-400">Batch Queue</div>
                {batches.map((b, idx) => {
                  const status = batchStatuses[idx] || { status: 'pending' };
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-zinc-200">Batch #{idx + 1} ({b.length} outputs)</div>
                        {status.txId && (
                          <a
                            href={`https://explorer.kaspa.org/txs/${status.txId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
                          >
                            Tx: {status.txId.slice(0, 12)}... <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {status.error && (
                          <span className="text-[11px] text-red-400 block mt-0.5">{status.error}</span>
                        )}
                      </div>

                      <div>
                        {status.status === 'pending' && <span className="text-zinc-500">Pending</span>}
                        {status.status === 'signing' && (
                          <span className="text-amber-400 flex items-center gap-1">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing
                          </span>
                        )}
                        {status.status === 'sent' && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Sent
                          </span>
                        )}
                        {status.status === 'failed' && (
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

            <button
              disabled={isProcessing || parsedRecipients.length === 0}
              onClick={handleExecuteDisperse}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                isProcessing || parsedRecipients.length === 0
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing Batches...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Execute Disperse
                </>
              )}
            </button>
          </div>
        </section>
      </main>

      {/* WALLET CONNECT MODAL */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-400" />
                <h2 className="text-lg font-semibold">Select Kaspa Wallet</h2>
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

            <div className="mt-4 space-y-2 max-h-80 overflow-y-auto pr-1">
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
                            ? isInstalled
                              ? 'Browser Extension'
                              : 'Not Installed'
                            : `${wallet.type.toUpperCase()} Wallet`}
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
