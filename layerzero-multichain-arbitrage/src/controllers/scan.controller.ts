import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';

import type {
  ScanStatusResponseDto,
  ScanTriggerResponseDto,
} from '../dto/scan.dto';
import { ScanService } from '../services/scan.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Get('status')
  status(): ScanStatusResponseDto {
    return this.scanService.getStatus();
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  trigger(): ScanTriggerResponseDto {
    return {
      status: this.scanService.triggerScan() ? 'started' : 'already_running',
    };
  }
}
