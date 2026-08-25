import { AppController } from './app.controller';
import { AssetsController } from './assets.controller';
import { PriceScanController } from './price-scan.controller';
import { PricesController } from './prices.controller';
import { RpcSnapshotController } from './rpc-snapshot.controller';
import { ScanController } from './scan.controller';
import { SpotPricesController } from './spot-prices.controller';

export { AppController } from './app.controller';
export { AssetsController } from './assets.controller';
export { PriceScanController } from './price-scan.controller';
export { PricesController } from './prices.controller';
export { RpcSnapshotController } from './rpc-snapshot.controller';
export { ScanController } from './scan.controller';
export { SpotPricesController } from './spot-prices.controller';

export const CONTROLLERS = [
  AppController,
  AssetsController,
  PriceScanController,
  PricesController,
  RpcSnapshotController,
  ScanController,
  SpotPricesController,
];
