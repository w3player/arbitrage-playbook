import { AppService } from './app.service';
import { AssetsService } from './assets.service';
import { PriceQueryService } from './price-query.service';
import { PriceScanService } from './price-scan.service';
import { ScanService } from './scan.service';
import { ScheduleService } from './schedule.service';

export { AppService } from './app.service';
export { AssetsService } from './assets.service';
export { PriceQueryService } from './price-query.service';
export { PriceScanService } from './price-scan.service';
export { ScanService } from './scan.service';
export { ScheduleService } from './schedule.service';

export const SERVICES = [
  AppService,
  AssetsService,
  PriceQueryService,
  PriceScanService,
  ScanService,
  ScheduleService,
];
