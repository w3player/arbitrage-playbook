import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { ScanService } from './scan.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private running = false;

  constructor(private readonly scanService: ScanService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runScan(): Promise<void> {
    if (this.running) {
      this.logger.warn('Skipping OFT scan because the previous run is active');
      return;
    }

    this.running = true;
    try {
      await this.scanService.scan();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`LayerZero OFT scan failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
