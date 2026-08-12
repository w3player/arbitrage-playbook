import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { ScanService } from '../services/scan.service';

interface ScanTriggerResponse {
  status: 'started' | 'already_running';
}

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  trigger(): ScanTriggerResponse {
    return {
      status: this.scanService.triggerScan() ? 'started' : 'already_running',
    };
  }
}
