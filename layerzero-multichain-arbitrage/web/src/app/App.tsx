import { AppRoutes } from '@/app/routes';
import { ScannerProvider } from '@/features/scanner/scanner-provider';

export function App() {
  return (
    <ScannerProvider>
      <AppRoutes />
    </ScannerProvider>
  );
}
