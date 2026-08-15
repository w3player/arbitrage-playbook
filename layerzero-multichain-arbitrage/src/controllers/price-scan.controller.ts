import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';

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
  trigger(@Query('assetId') assetId?: string): PriceScanTriggerDto {
    const targetAssetId = this.parseAssetId(assetId);
    const result = this.priceScanService.triggerScan(targetAssetId);
    return {
      status: result.started ? 'started' : 'already_running',
      runId: result.runId,
    };
  }

  private parseAssetId(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const assetId = Number(value);
    if (!Number.isSafeInteger(assetId) || assetId <= 0) {
      throw new BadRequestException('assetId must be a positive integer');
    }
    return assetId;
  }
}
