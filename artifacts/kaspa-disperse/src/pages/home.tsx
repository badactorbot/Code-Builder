import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wallet, Upload, Send, CheckCircle2, AlertCircle, X, Download,
  ExternalLink, Loader2, FileText, Layers, ShieldCheck, Coins, RefreshCw,
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
const KASPLEX_API = 'https://api.kasplex.org/v1';

// ==========================================
// TYPES
// ==========================================
interface Recipient {
  address: string;
  amount: number;
  sompi: bigint;
}

interface BatchStatus {
  status: 'pending' | 'building' | 'signing' | 'sent' | 'failed';
  txId: string;
  error?: string;
  signingProgress?: string;
  sentCount?: number;
}

interface WalletAccount {
  address: string;
  walletId: string;
  walletName: string;
  provider: any;
}

interface TokenInfo {
  tick: string;
  dec: string;   // decimal places, e.g. "8"
  state: string; // "finished" | "deployed"
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function Home() {
  // ── Wallet state ──────────────────────────────────────────────────────
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [walletLoading, setWalletLoading] = useState<string | null>(null);
  const [walletError, setWalletError] = useState('');
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});

  // ── Mode: 'kas' = native KAS, 'krc20' = KRC-20 token ─────────────────
  const [mode, setMode] = useState<'kas' | 'krc20'>('kas');

  // ── KRC-20 token state ────────────────────────────────────────────────
  const [walletTokens, setWalletTokens] = useState<{ tick: string; rawBalance: bigint }[]>([]);
  const [walletTokensLoading, setWalletTokensLoading] = useState(false);
  const [walletTokensError, setWalletTokensError] = useState('');
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenSelectLoading, setTokenSelectLoading] = useState(false);
  const [tokenWalletBalance, setTokenWalletBalance] = useState<string | null>(null);

  // ── Recipients / batches ──────────────────────────────────────────────
  const [rawInput, setRawInput] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState<Recipient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [batches, setBatches] = useState<Recipient[][]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchStatuses, setBatchStatuses] = useState<BatchStatus[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Detect installed wallets ──────────────────────────────────────────
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

  // ── Fetch all KRC-20 tokens held by the connected wallet ─────────────
  const fetchWalletTokens = useCallback(async (provider: any) => {
    if (!provider || typeof provider.getKRC20Balance !== 'function') {
      setWalletTokensError('Your wallet does not support KRC-20 balance lookup.');
      return;
    }
    setWalletTokensLoading(true);
    setWalletTokensError('');
    setWalletTokens([]);
    setTokenInfo(null);
    setTokenWalletBalance(null);
    try {
      const balances: any[] = await provider.getKRC20Balance();
      const parsed = (balances ?? [])
        .filter((b: any) => b.tick && BigInt(b.balance ?? '0') > 0n)
        .map((b: any) => ({ tick: String(b.tick).toUpperCase(), rawBalance: BigInt(b.balance ?? '0') }));
      setWalletTokens(parsed);
      if (parsed.length === 0) setWalletTokensError('No KRC-20 tokens found in this wallet.');
    } catch {
      setWalletTokensError('Failed to load KRC-20 tokens from wallet.');
    } finally {
      setWalletTokensLoading(false);
    }
  }, []);

  // ── Select a token: fetch its decimal info from Kasplex ──────────────
  const handleSelectToken = useCallback(async (tick: string, rawBalance: bigint) => {
    setTokenSelectLoading(true);
    setTokenInfo(null);
    setTokenWalletBalance(null);
    try {
      const res = await fetch(`${KASPLEX_API}/krc20/token/${encodeURIComponent(tick)}`);
      const data = await res.json();
      const info = data?.result?.[0];
      const dec = info?.dec ?? '8';
      const state = info?.state ?? '';
      setTokenInfo({ tick, dec, state });
      const decNum = parseInt(dec, 10);
      const whole = Number(rawBalance) / Math.pow(10, decNum);
      setTokenWalletBalance(whole.toLocaleString(undefined, { maximumFractionDigits: decNum }));
    } catch {
      // Still allow selection; default 8 decimals
      setTokenInfo({ tick, dec: '8', state: '' });
      const whole = Number(rawBalance) / 1e8;
      setTokenWalletBalance(whole.toLocaleString(undefined, { maximumFractionDigits: 8 }));
    } finally {
      setTokenSelectLoading(false);
    }
  }, []);

  // ── Auto-fetch wallet tokens when switching to KRC-20 mode or connecting ─
  useEffect(() => {
    if (mode === 'krc20' && account?.provider) {
      fetchWalletTokens(account.provider);
    }
    if (mode !== 'krc20') {
      setWalletTokens([]);
      setWalletTokensError('');
      setTokenInfo(null);
      setTokenWalletBalance(null);
    }
  }, [account, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect wallet ────────────────────────────────────────────────────
  const handleConnectWallet = async (wallet: typeof KASPA_WALLETS[0]) => {
    setWalletError('');
    setWalletLoading(wallet.id);
    try {
      if (wallet.type === 'extension') {
        const provider = wallet.getProvider ? wallet.getProvider() : null;
        if (!provider) throw new Error(`${wallet.name} is not installed in your browser.`);

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
          setAccount({ address: selectedAddr, walletId: wallet.id, walletName: wallet.name, provider });
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

  // ── Parse recipient list ──────────────────────────────────────────────
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
          errors.push(`Line ${index + 1}: Invalid Kaspa address (${address.slice(0, 12)}...)`);
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
    reader.onload = (event) => handleParseInput(event.target?.result as string);
    reader.readAsText(file);
  };

  const totalToSend = parsedRecipients.reduce((sum, r) => sum + r.amount, 0);
  const tokenLabel = mode === 'kas' ? 'KAS' : (tokenInfo?.tick || 'TOKEN');

  // ── Switch mode ───────────────────────────────────────────────────────
  const handleModeSwitch = (newMode: 'kas' | 'krc20') => {
    setMode(newMode);
    setTokenInfo(null);
    setTokenWalletBalance(null);
    // Re-parse to rebuild batches (same data, same logic)
    if (rawInput) handleParseInput(rawInput);
  };

  // ==========================================
  // EXECUTE DISPERSE
  // ==========================================
  const handleExecuteDisperse = async () => {
    if (!account) { setIsWalletModalOpen(true); return; }
    if (batches.length === 0) return;

    // KRC-20 mode validation
    if (mode === 'krc20') {
      if (!tokenInfo) {
        alert('Please enter and verify a valid KRC-20 token ticker first.');
        return;
      }
      if (typeof account.provider?.krc20BatchTransferTransaction !== 'function') {
        alert('Your connected wallet does not support KRC-20 batch transfers. Please use KasWare wallet (latest version).');
        return;
      }
    }

    setIsProcessing(true);

    if (mode === 'krc20') {
      await executeKrc20Disperse();
    } else {
      await executeKasDisperse();
    }

    setIsProcessing(false);
  };

  // ── KRC-20 execution: uses KasWare's krc20BatchTransferTransaction ────
  const executeKrc20Disperse = async () => {
    if (!account || !tokenInfo) return;
    const provider = account.provider;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      setBatchStatuses((prev) => {
        const copy = [...prev];
        copy[i] = { status: 'signing', txId: '', signingProgress: `0 of ${batch.length}` };
        return copy;
      });

      // Build IBatchTransfer list for this batch
      const list = batch.map((r) => ({
        tick: tokenInfo.tick,
        dec: tokenInfo.dec,
        to: r.address,
        amount: r.amount.toString(),
      }));

      try {
        // Use a Promise to wait for all krc20BatchTransferChanged events for this batch
        const batchResult = await new Promise<{ lastRevealId: string; anyFailed: boolean }>(
          (resolve, reject) => {
            let completed = 0;
            let lastRevealId = '';
            let anyFailed = false;
            const total = list.length;

            const handler = (results: any[]) => {
              for (const r of (Array.isArray(results) ? results : [results])) {
                completed++;
                if (r.status === 'success') lastRevealId = r.txId?.revealId ?? lastRevealId;
                if (r.status === 'failed') anyFailed = true;

                setBatchStatuses((prev) => {
                  const copy = [...prev];
                  copy[i] = {
                    status: completed >= total ? (anyFailed ? 'failed' : 'sent') : 'signing',
                    txId: lastRevealId,
                    signingProgress: `${completed} of ${total}`,
                    error: anyFailed ? 'Some transfers failed — check explorer' : undefined,
                  };
                  return copy;
                });

                if (completed >= total) {
                  provider.removeListener?.('krc20BatchTransferChanged', handler);
                  resolve({ lastRevealId, anyFailed });
                }
              }
            };

            provider.on?.('krc20BatchTransferChanged', handler);

            provider.krc20BatchTransferTransaction(list)
              .then(() => {
                // Promise resolves after user approves; events continue to fire as each tx completes.
                // If the wallet resolves only after all are done and no events fired, resolve now.
                if (completed >= total) {
                  provider.removeListener?.('krc20BatchTransferChanged', handler);
                  resolve({ lastRevealId, anyFailed });
                }
              })
              .catch((err: any) => {
                provider.removeListener?.('krc20BatchTransferChanged', handler);
                reject(err);
              });
          }
        );

        if (batchResult.anyFailed) { setIsProcessing(false); return; }
      } catch (err: any) {
        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = {
            status: 'failed',
            txId: '',
            error: err?.message ?? 'Batch transfer rejected or failed',
          };
          return copy;
        });
        setIsProcessing(false);
        return;
      }
    }
  };

  // ── KAS execution: multi-output path with server-built tx ─────────────
  const executeKasDisperse = async () => {
    if (!account) return;
    const provider = account.provider;

    const canMultiSign = provider && typeof provider.signKaspaTransaction === 'function';
    console.log('[KaspaDisperse] provider methods:', {
      signKaspaTransaction: typeof provider?.signKaspaTransaction,
      pushTx: typeof provider?.pushTx,
      sendKaspa: typeof provider?.sendKaspa,
      canMultiSign,
    });

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // ── MULTI-OUTPUT PATH ────────────────────────────────────────────
      if (canMultiSign) {
        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = { status: 'building', txId: '' };
          return copy;
        });

        let pendingTxs: { id: string; txJson: string; paymentAmount: string; feeAmount: string }[];
        try {
          const recipients = PLATFORM_FEE_KAS > 0
            ? [...batch.map((r) => ({ address: r.address, amount: r.amount })), { address: TREASURY_ADDRESS, amount: PLATFORM_FEE_KAS }]
            : batch.map((r) => ({ address: r.address, amount: r.amount }));

          const res = await fetch('/api/kaspa/build-tx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderAddress: account.address, recipients }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`);
          pendingTxs = body.pendingTxs;
        } catch (err: any) {
          setBatchStatuses((prev) => {
            const copy = [...prev];
            copy[i] = { status: 'failed', txId: '', error: err.message ?? 'Failed to build transaction' };
            return copy;
          });
          setIsProcessing(false);
          return;
        }

        let lastTxId = '';
        let txFailed = false;

        for (let t = 0; t < pendingTxs.length; t++) {
          const { txJson } = pendingTxs[t];

          setBatchStatuses((prev) => {
            const copy = [...prev];
            copy[i] = {
              status: 'signing',
              txId: '',
              signingProgress: pendingTxs.length > 1 ? `tx ${t + 1} of ${pendingTxs.length}` : undefined,
            };
            return copy;
          });

          try {
            const signedJson = await provider.signKaspaTransaction(txJson, ['All']);

            let pushRaw: any;
            if (typeof provider.pushTx === 'function') {
              pushRaw = await provider.pushTx({ rawtx: signedJson });
            } else {
              const pushRes = await fetch('/api/kaspa/push-tx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signedTxJson: signedJson }),
              });
              const pushBody = await pushRes.json();
              if (!pushRes.ok) throw new Error(pushBody.error ?? `Broadcast failed ${pushRes.status}`);
              pushRaw = pushBody.txId ?? pushBody.transactionId ?? '';
            }
            lastTxId = typeof pushRaw === 'string' ? pushRaw : (pushRaw?.txId ?? pendingTxs[t].id);
          } catch (err: any) {
            setBatchStatuses((prev) => {
              const copy = [...prev];
              copy[i] = { status: 'failed', txId: '', error: err?.message ?? 'Signing or submission failed' };
              return copy;
            });
            txFailed = true;
            break;
          }
        }

        if (txFailed) { setIsProcessing(false); return; }

        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = { status: 'sent', txId: lastTxId };
          return copy;
        });
        continue;
      }

      // ── SINGLE-OUTPUT FALLBACK ───────────────────────────────────────
      if (!provider || typeof provider.sendKaspa !== 'function') {
        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = { status: 'failed', txId: '', error: 'Connected wallet does not expose a send method.' };
          return copy;
        });
        setIsProcessing(false);
        return;
      }

      const recipientsInBatch =
        PLATFORM_FEE_KAS > 0
          ? [...batch, { address: TREASURY_ADDRESS, amount: PLATFORM_FEE_KAS }]
          : batch;

      let lastTxId = '';
      let outputFailed = false;

      for (let j = 0; j < recipientsInBatch.length; j++) {
        const recipient = recipientsInBatch[j];
        setBatchStatuses((prev) => {
          const copy = [...prev];
          copy[i] = { ...copy[i], status: 'signing', signingProgress: `${j + 1} of ${recipientsInBatch.length}` };
          return copy;
        });

        try {
          const raw = await provider.sendKaspa(recipient.address, Math.round(recipient.amount * 1e8));
          lastTxId = typeof raw === 'string' ? raw : (raw?.txId ?? raw?.id ?? '');
        } catch (err: any) {
          setBatchStatuses((prev) => {
            const copy = [...prev];
            copy[i] = { status: 'failed', txId: '', error: err?.message ?? 'Transaction rejected or failed' };
            return copy;
          });
          outputFailed = true;
          break;
        }
      }

      if (outputFailed) { setIsProcessing(false); return; }

      setBatchStatuses((prev) => {
        const copy = [...prev];
        copy[i] = { status: 'sent', txId: lastTxId, sentCount: recipientsInBatch.length };
        return copy;
      });
    }
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">

      {/* HEADER */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="h-full w-full bg-zinc-950 rounded-[10px] flex items-center justify-center font-black text-emerald-400 text-lg">K</div>
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-white flex items-center gap-2">
              Kaspa Disperse
              <span className="text-[10px] bg-emerald-950 border border-emerald-800/60 text-emerald-400 px-2 py-0.5 rounded-full uppercase">
                {mode === 'kas' ? 'L1 Native' : 'KRC-20'}
              </span>
            </h1>
            <p className="text-xs text-zinc-400">Bulk payment batcher for KAS &amp; KRC-20 tokens</p>
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

      {/* MAIN */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT COLUMN */}
        <section className="lg:col-span-7 space-y-6">

          {/* MODE TOGGLE */}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 shadow-xl">
            <div className="flex items-center gap-1 bg-zinc-950 rounded-xl p-1">
              <button
                onClick={() => handleModeSwitch('kas')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
                  mode === 'kas'
                    ? 'bg-emerald-500 text-black shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Native KAS
              </button>
              <button
                onClick={() => handleModeSwitch('krc20')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${
                  mode === 'krc20'
                    ? 'bg-violet-500 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Coins className="h-4 w-4" />
                KRC-20 Token
              </button>
            </div>
          </div>

          {/* KRC-20 TOKEN SELECTOR */}
          {mode === 'krc20' && (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Coins className="h-4 w-4 text-violet-400" />
                  Select Token
                </label>
                {account?.provider && (
                  <button
                    onClick={() => fetchWalletTokens(account.provider)}
                    disabled={walletTokensLoading}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-300 transition disabled:opacity-50"
                    title="Refresh token list"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${walletTokensLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                )}
              </div>

              {/* Not connected */}
              {!account && (
                <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-6 text-center text-sm text-zinc-500">
                  Connect your wallet to see your KRC-20 tokens
                </div>
              )}

              {/* Loading */}
              {account && walletTokensLoading && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  Loading tokens from wallet…
                </div>
              )}

              {/* Error */}
              {account && !walletTokensLoading && walletTokensError && (
                <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-3 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {walletTokensError}
                </div>
              )}

              {/* Token grid */}
              {account && !walletTokensLoading && walletTokens.length > 0 && (
                <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {walletTokens.map(({ tick, rawBalance }) => {
                    const isSelected = tokenInfo?.tick === tick;
                    const displayBalance = (Number(rawBalance) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 4 });
                    return (
                      <button
                        key={tick}
                        onClick={() => !tokenSelectLoading && handleSelectToken(tick, rawBalance)}
                        disabled={tokenSelectLoading}
                        className={`text-left rounded-xl border p-3 transition ${
                          isSelected
                            ? 'border-violet-500 bg-violet-950/40 ring-1 ring-violet-500/40'
                            : 'border-zinc-800 bg-zinc-950 hover:border-violet-700/60 hover:bg-violet-950/20'
                        } ${tokenSelectLoading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-sm text-zinc-100 tracking-wide">{tick}</span>
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-violet-400 shrink-0" />}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate">{displayBalance}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected token info */}
              {tokenSelectLoading && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
                  Loading token details…
                </div>
              )}

              {tokenInfo && !tokenSelectLoading && (
                <div className="rounded-xl bg-violet-950/30 border border-violet-800/40 p-3 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-violet-400" />
                      <span className="text-sm font-bold text-violet-200">{tokenInfo.tick}</span>
                      {tokenInfo.state && (
                        <span className="text-[10px] bg-violet-900/60 border border-violet-700/40 text-violet-400 px-2 py-0.5 rounded-full uppercase">
                          {tokenInfo.state}
                        </span>
                      )}
                    </div>
                    {tokenWalletBalance !== null && (
                      <div className="text-xs text-zinc-400 pl-5.5">
                        Balance: <span className="text-violet-300 font-semibold">{tokenWalletBalance} {tokenInfo.tick}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">dec: {tokenInfo.dec}</div>
                </div>
              )}
            </div>
          )}

          {/* RECIPIENT INPUT */}
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
                  <Upload className="h-3.5 w-3.5" />
                  Upload CSV
                </button>
              </div>
            </div>

            <textarea
              rows={10}
              value={rawInput}
              onChange={(e) => handleParseInput(e.target.value)}
              placeholder={
                mode === 'kas'
                  ? `kaspa:qq2... 150.5\nkaspa:qr8... 200\nkaspa:qz7... 50`
                  : `kaspa:qq2... 1000\nkaspa:qr8... 500\nkaspa:qz7... 250`
              }
              className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-4 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none"
            />

            <div className="text-xs text-zinc-500 flex justify-between">
              <span>
                Format: <code className="text-zinc-400">address amount</code> or <code className="text-zinc-400">address,amount</code>
                {mode === 'krc20' && <span className="text-violet-400"> — amounts in whole {tokenLabel} units</span>}
              </span>
              <span>≤{BATCH_SIZE} outputs/batch</span>
            </div>

            {parseErrors.length > 0 && (
              <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-4 space-y-1 text-xs text-red-300">
                <div className="font-semibold flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" /> Formatting Alerts ({parseErrors.length})
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 max-h-24 overflow-y-auto">
                  {parseErrors.map((err, idx) => <li key={idx}>{err}</li>)}
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
              <Layers className={`h-4 w-4 ${mode === 'krc20' ? 'text-violet-400' : 'text-emerald-400'}`} />
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5">
                <div className="text-xs text-zinc-400">Total Recipients</div>
                <div className="text-xl font-bold text-white mt-1">{parsedRecipients.length}</div>
              </div>

              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5">
                <div className="text-xs text-zinc-400">Total {tokenLabel}</div>
                <div className={`text-xl font-bold mt-1 ${mode === 'krc20' ? 'text-violet-400' : 'text-emerald-400'}`}>
                  {totalToSend.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                </div>
              </div>

              <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3.5 col-span-2 flex justify-between items-center">
                <div>
                  <div className="text-xs text-zinc-400">Signing Model</div>
                  <div className="text-xs font-semibold text-zinc-200 mt-0.5">
                    {mode === 'kas'
                      ? `${batches.length} Batch${batches.length === 1 ? '' : 'es'} — 1 approval each`
                      : `${batches.length} Batch${batches.length === 1 ? '' : 'es'} — commit-reveal per recipient`}
                  </div>
                </div>
                {mode === 'krc20'
                  ? <Coins className="h-5 w-5 text-violet-500" />
                  : <ShieldCheck className="h-5 w-5 text-zinc-500" />}
              </div>
            </div>

            {/* KRC-20 note */}
            {mode === 'krc20' && (
              <div className="rounded-xl bg-violet-950/20 border border-violet-800/30 p-3 text-xs text-violet-300 space-y-1">
                <div className="font-semibold">How KRC-20 transfers work</div>
                <div className="text-zinc-400 leading-relaxed">
                  Each recipient gets a commit + reveal transaction pair. Approve once per batch — the wallet handles all commit-reveal pairs automatically.
                </div>
              </div>
            )}

            {batches.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div className="text-xs font-medium text-zinc-400">Batch Queue</div>
                {batches.map((b, idx) => {
                  const status = batchStatuses[idx] || { status: 'pending' };
                  const accentColor = mode === 'krc20' ? 'text-violet-400' : 'text-emerald-400';
                  const explorerBase = mode === 'krc20'
                    ? 'https://explorer.kaspa.org/txs/'
                    : 'https://explorer.kaspa.org/txs/';

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-zinc-950 border border-zinc-800 p-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-zinc-200">
                          Batch #{idx + 1} ({b.length} {mode === 'krc20' ? 'transfers' : 'outputs'})
                        </div>
                        {status.txId && (
                          <a
                            href={`${explorerBase}${status.txId}`}
                            target="_blank"
                            rel="noreferrer"
                            className={`text-[11px] ${accentColor} hover:underline flex items-center gap-1 mt-0.5`}
                          >
                            Tx: {status.txId.slice(0, 12)}… <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {status.error && (
                          <span className="text-[11px] text-red-400 block mt-0.5">{status.error}</span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        {status.status === 'pending' && <span className="text-zinc-500">Pending</span>}
                        {status.status === 'building' && (
                          <span className="text-sky-400 flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building…
                          </span>
                        )}
                        {status.status === 'signing' && (
                          <span className={`${mode === 'krc20' ? 'text-violet-400' : 'text-amber-400'} flex items-center gap-1.5`}>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {status.signingProgress
                              ? (mode === 'krc20' ? `${status.signingProgress} done` : `Signing ${status.signingProgress}`)
                              : (mode === 'krc20' ? 'Approve in wallet' : 'Approve in wallet')}
                          </span>
                        )}
                        {status.status === 'sent' && (
                          <span className={`${accentColor} flex items-center gap-1`}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {status.sentCount && status.sentCount > 1 ? `${status.sentCount} sent` : 'Sent'}
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
              disabled={
                isProcessing ||
                parsedRecipients.length === 0 ||
                (mode === 'krc20' && !tokenInfo)
              }
              onClick={handleExecuteDisperse}
              className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                isProcessing || parsedRecipients.length === 0 || (mode === 'krc20' && !tokenInfo)
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : mode === 'krc20'
                    ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {mode === 'krc20'
                    ? (tokenInfo ? `Disperse ${tokenInfo.tick}` : 'Select Token First')
                    : 'Execute Disperse'}
                </>
              )}
            </button>
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
                <h2 className="text-lg font-semibold">Select Kaspa Wallet</h2>
              </div>
              <button onClick={() => setIsWalletModalOpen(false)} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {walletError && (
              <div className="mt-4 rounded-lg bg-red-950/50 border border-red-800/60 p-3 text-xs text-red-300">{walletError}</div>
            )}

            {mode === 'krc20' && (
              <div className="mt-4 rounded-lg bg-violet-950/30 border border-violet-800/40 p-3 text-xs text-violet-300">
                KRC-20 batch transfers require <span className="font-semibold">KasWare Wallet</span> (latest version).
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
                            ? isInstalled ? 'Browser Extension' : 'Not Installed'
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
