import {
  getGetUserBotDashboardQueryKey,
  setBaseUrl,
  useGetUserBotDashboard,
  useLogoutWallet,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, LogOut, Github } from 'lucide-react';
import { LandingLayout } from '@/components/dispenser/landing-layout';
import { BotActivation } from '@/components/volume-bot/bot-activation';
import { BotDashboardView } from '@/components/volume-bot/bot-dashboard-view';
import { BotSetupForm } from '@/components/volume-bot/bot-setup-form';
import { WalletConnect } from '@/components/volume-bot/wallet-connect';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');
if (configuredApiBase) {
  setBaseUrl(configuredApiBase);
}

export default function VolumeBot() {
  const { data: dashboard, isLoading, error } = useGetUserBotDashboard({
    query: {
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      queryKey: getGetUserBotDashboardQueryKey(),
    },
  });

  const logout = useLogoutWallet();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
      queryClient.invalidateQueries({ queryKey: getGetUserBotDashboardQueryKey() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      toast({ title: 'Logout failed', description: message, variant: 'destructive' });
    }
  };

  const connected = Boolean(dashboard?.authenticated);

  return (
    <LandingLayout showGrid={false}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-400">
              Volume Bot
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-white">
              KasDistro Trading Bot Console
            </h1>
            <p className="mt-2 text-sm text-cyan-200">
              Connect Kasware, set a token, activate, then run the cycle from this page.{' '}
              <a
                href="https://github.com/badactorbot/kasvolume"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-100 hover:text-white"
              >
                <Github className="h-3.5 w-3.5" />
                kasvolume
              </a>
            </p>
          </div>
          {connected && dashboard?.walletAddress ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-cyan-300/80">
                  Connected Wallet
                </p>
                <p className="text-sm font-medium font-mono text-white mt-0.5">
                  {dashboard.walletAddress.slice(0, 8)}...{dashboard.walletAddress.slice(-6)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 uppercase tracking-wider text-xs font-bold"
              >
                <LogOut className="w-3.5 h-3.5 sm:mr-2" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading && !dashboard ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : error || !dashboard || !dashboard.authenticated ? (
          <div>
            {error ? (
              <p className="mb-6 text-center text-sm text-amber-200/90">
                Bot API is not reachable. Set DATABASE_URL and SESSION_SECRET on the API server, then connect Kasware.
              </p>
            ) : null}
            <WalletConnect />
          </div>
        ) : !dashboard.bot ? (
          <BotSetupForm strategy={dashboard.strategy} />
        ) : !dashboard.bot.activationPaid ? (
          <BotActivation strategy={dashboard.strategy} bot={dashboard.bot} />
        ) : (
          <BotDashboardView
            bot={dashboard.bot}
            strategy={dashboard.strategy}
            walletAddress={dashboard.walletAddress}
          />
        )}
      </div>
    </LandingLayout>
  );
}
