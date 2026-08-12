import { Controller, Get } from '@nestjs/common';

import type { AssetsResponseDto } from '../dto/assets.dto';
import { AssetsService } from '../services/assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  list(): Promise<AssetsResponseDto> {
    return this.assetsService.list();
  }
}
