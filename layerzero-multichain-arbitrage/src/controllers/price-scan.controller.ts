import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import type {
  PriceScanStatusDto,
  PriceScanTriggerDto,
} from '../dto/prices.dto';
import { PriceScanService } from '../services/price-scan.service';

@Controller('price-scans')
export class PriceScanController {
  constructor(private readonly priceScanService: PriceScanService) {}

  @Get('status')
  status(): PriceScanStatusDto {
    return this.priceScanService.getStatus();
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  trigger(): PriceScanTriggerDto {
    const result = this.priceScanService.triggerScan();
    return {
      status: result.started ? 'started' : 'already_running',
      runId: result.runId,
    };
  }
}
