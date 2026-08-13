import { LayoutGrid, Orbit, Radio } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router';

import { getNavigationItem, navigationItems } from '@/app/navigation';
import type { NavigationItem } from '@/app/navigation';
import { ScannerProvider } from '@/features/scanner/scanner-provider';
import { useScanner } from '@/features/scanner/scanner-provider';
import { StatusBadge } from '@/features/scanner/status-badge';
import { formatDateTime } from '@/lib/format';
import { HomePage, ScenarioPage } from '@/pages/hub';
import { AssetsPage, ExecutionPage, PriceScanPage, SpotPricePage } from '@/pages/scenarios/layerzero';

function LayerZeroLayout() {
  const location = useLocation();
  const { assets, scanStatus } = useScanner();
  const pageTitle = getNavigationItem(location.pathname)?.label ?? '资产管理';

  useEffect(() => {
    document.querySelector<HTMLElement>('#main-content')?.focus();
  }, [location.pathname]);

  return (
    <div className="grid min-h-dvh min-w-[1100px] grid-cols-[14.5rem_minmax(0,1fr)] bg-background text-foreground">
      <a
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        href="#main-content"
      >
        跳到主要内容
      </a>

      <aside className="sticky top-0 flex h-dvh flex-col border-r bg-card">
        <Brand />
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="LayerZero 场景导航">
          <NavLink
            className="mb-3 flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            to="/"
          >
            <LayoutGrid className="size-3.5" aria-hidden="true" />
            所有套利场景
          </NavLink>
          <div className="space-y-1">
            {navigationItems.map((item) => (
              <NavigationLink key={item.to} item={item} />
            ))}
          </div>
        </nav>
        <div className="border-t px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <p className="text-[11px] font-medium">资产扫描器</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                {assets?.summary.verifiedAssets ?? 0} verified
              </p>
            </div>
            <StatusBadge value={scanStatus?.state ?? 'idle'} />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <div className="flex min-h-12 items-center justify-between gap-4 px-5">
            <div className="flex items-baseline gap-3">
              <p className="text-sm font-semibold">{pageTitle}</p>
              <p className="font-mono text-[10px] text-muted-foreground">
                Last scan · {formatDateTime(scanStatus?.completedAt ?? null)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-800">
                READ ONLY
              </span>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Radio
                  className={`size-3.5 ${scanStatus?.state === 'running' ? 'animate-pulse text-blue-600' : 'text-emerald-600'}`}
                  aria-hidden="true"
                />
                <span>{scanStatus?.state === 'running' ? '扫描运行中' : '服务已连接'}</span>
              </div>
            </div>
          </div>
        </header>
        <main className="min-h-[calc(100dvh-3rem)] outline-none" id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <NavLink
      className="flex min-h-12 items-center gap-2.5 border-b px-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      to="/"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
        <Orbit className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold tracking-tight">LayerZero 套利</span>
        <span className="block text-[9px] text-muted-foreground">Arbitrage Playbook · Scenario</span>
      </span>
    </NavLink>
  );
}

function NavigationLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      className={({ isActive }) =>
        `flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
      }
      to={item.to}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{item.label}</span>
        <span className="block truncate text-[9px] opacity-70">{item.description}</span>
      </span>
      {item.stage ? <span className="ms-auto font-mono text-[9px] opacity-70">{item.stage}</span> : null}
    </NavLink>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<HomePage />} index />
      <Route element={<ScenarioPage />} path="scenarios/:scenarioId" />
      <Route
        element={
          <ScannerProvider>
            <LayerZeroLayout />
          </ScannerProvider>
        }
        path="layerzero"
      >
        <Route index element={<Navigate replace to="/layerzero/assets" />} />
        <Route element={<AssetsPage />} path="assets" />
        <Route element={<SpotPricePage />} path="market-prices" />
        <Route element={<PriceScanPage />} path="prices" />
        <Route element={<ExecutionPage />} path="execution" />
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
