import { Controller, Get } from '@nestjs/common';

import type { SpotPricesResponseDto } from '../dto/spot-prices.dto';
import { SpotPriceService } from '../services/spot-price.service';

@Controller('spot-prices')
export class SpotPricesController {
  constructor(private readonly spotPriceService: SpotPriceService) {}

  @Get()
  list(): Promise<SpotPricesResponseDto> {
    return this.spotPriceService.list();
  }
}
