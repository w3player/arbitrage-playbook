import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { getAssets, getScanStatus, triggerScan as requestScan } from './api';
import type { AssetsResponse, ScanStatus, ScanTriggerResponse } from './types';

interface ScannerContextValue {
  assets: AssetsResponse | null;
  scanStatus: ScanStatus | null;
  loading: boolean;
  triggering: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  triggerScan: () => Promise<ScanTriggerResponse>;
}

const ScannerContext = createContext<ScannerContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [assets, setAssets] = useState<AssetsResponse | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousScanState = useRef<ScanStatus['state'] | null>(null);

  const loadAssets = useCallback(async () => {
    const response = await getAssets();
    setAssets(response);
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await getScanStatus();
    const completed = previousScanState.current === 'running' && response.state !== 'running';
    previousScanState.current = response.state;
    setScanStatus(response);
    setError(null);
    if (completed) {
      await loadAssets();
    }
  }, [loadAssets]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      await Promise.all([loadAssets(), loadStatus()]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [loadAssets, loadStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const delay = scanStatus?.state === 'running' ? 3_000 : 15_000;
    const timer = window.setInterval(() => {
      void loadStatus().catch((requestError: unknown) => setError(errorMessage(requestError)));
    }, delay);
    return () => window.clearInterval(timer);
  }, [loadStatus, scanStatus?.state]);

  const triggerScan = useCallback(async () => {
    setTriggering(true);
    setError(null);
    try {
      const response = await requestScan();
      await loadStatus();
      return response;
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    } finally {
      setTriggering(false);
    }
  }, [loadStatus]);

  const value = useMemo<ScannerContextValue>(
    () => ({ assets, scanStatus, loading, triggering, error, refresh, triggerScan }),
    [assets, error, loading, refresh, scanStatus, triggerScan, triggering],
  );

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
}

export function useScanner(): ScannerContextValue {
  const context = useContext(ScannerContext);
  if (!context) {
    throw new Error('useScanner must be used inside ScannerProvider');
  }
  return context;
}
