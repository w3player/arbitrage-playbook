import { Controller, Get } from '@nestjs/common';

import type { PricesResponseDto } from '../dto/prices.dto';
import { PriceQueryService } from '../services/price-query.service';

@Controller('prices')
export class PricesController {
  constructor(private readonly priceQueryService: PriceQueryService) {}

  @Get()
  list(): Promise<PricesResponseDto> {
    return this.priceQueryService.list();
  }
}
