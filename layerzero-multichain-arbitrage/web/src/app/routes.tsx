import { Boxes, LayoutDashboard, Orbit, Radio, Route as RouteIcon } from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, Route, Routes, useLocation } from 'react-router';

import { useScanner } from '@/features/scanner/scanner-provider';
import { StatusBadge } from '@/features/scanner/status-badge';
import { formatDateTime } from '@/lib/format';
import { AssetsPage } from '@/pages/assets-page';
import { DashboardPage } from '@/pages/dashboard-page';

const navigation = [
  { to: '/', label: '操作总览', icon: LayoutDashboard, end: true },
  { to: '/assets', label: '跨链资产池', icon: Boxes, end: false },
];

function RootLayout() {
  const location = useLocation();
  const { assets, scanStatus } = useScanner();
  const pageTitle = location.pathname === '/assets' ? '跨链资产池' : '操作总览';

  useEffect(() => {
    document.querySelector<HTMLElement>('#main-content')?.focus();
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        href="#main-content"
      >
        跳到主要内容
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
        <Brand />
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="主导航">
          {navigation.map((item) => (
            <NavigationLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="rounded-lg bg-muted/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Scanner worker</span>
              <StatusBadge value={scanStatus?.state ?? 'idle'} />
            </div>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {assets?.summary.totalAssets ?? 0} assets · {assets?.summary.totalDeployments ?? 0} deployments
            </p>
          </div>
          <p className="mt-4 px-1 text-xs leading-5 text-muted-foreground">LayerZero V2 · Ethereum / BNB / Base</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-semibold">{pageTitle}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                Last scan: {formatDateTime(scanStatus?.completedAt ?? null)}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radio
                className={`size-3.5 ${scanStatus?.state === 'running' ? 'animate-pulse text-blue-600' : 'text-emerald-600'}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">
                {scanStatus?.state === 'running' ? '后台扫描运行中' : '服务已连接'}
              </span>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t px-3 py-1 lg:hidden" aria-label="移动端主导航">
            {navigation.map((item) => (
              <NavigationLink key={item.to} {...item} mobile />
            ))}
          </nav>
        </header>

        <main className="min-h-[calc(100dvh-4rem)] outline-none" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink
      className={`flex items-center gap-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${compact ? 'rounded-md' : 'min-h-16 border-b px-5'}`}
      to="/"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Orbit className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold tracking-tight">L0 Arbitrage</span>
        {!compact ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">Cross-chain operations</span>
        ) : null}
      </span>
    </NavLink>
  );
}

interface NavigationLinkProps {
  to: string;
  label: string;
  icon: typeof RouteIcon;
  end: boolean;
  mobile?: boolean;
}

function NavigationLink({ to, label, icon: Icon, end, mobile = false }: NavigationLinkProps) {
  return (
    <NavLink
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        } ${mobile ? 'shrink-0' : 'w-full'}`
      }
      end={end}
      to={to}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<DashboardPage />} />
        <Route element={<AssetsPage />} path="assets" />
      </Route>
    </Routes>
  );
}
