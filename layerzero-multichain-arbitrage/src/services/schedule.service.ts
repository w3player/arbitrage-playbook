import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ScanService } from './scan.service';
import { PriceScanService } from './price-scan.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly scanService: ScanService,
    private readonly priceScanService: PriceScanService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runScan(): Promise<void> {
    try {
      await this.scanService.scan();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`LayerZero OFT scan failed: ${message}`);
    }
  }

  @Cron('0 */10 * * * *')
  async runAuthenticatedPriceScan(): Promise<void> {
    if (!this.priceScanService.isAuthenticated()) return;
    await this.runPrices();
  }

  @Cron('0 0 */3 * * *')
  async runAnonymousPriceScan(): Promise<void> {
    if (this.priceScanService.isAuthenticated()) return;
    await this.runPrices();
  }

  private async runPrices(): Promise<void> {
    try {
      await this.priceScanService.scan();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cross-chain price scan failed: ${message}`);
    }
  }
}
