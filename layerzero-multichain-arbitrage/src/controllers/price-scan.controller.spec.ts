import { BadRequestException } from '@nestjs/common';

import { PriceScanController } from './price-scan.controller';
import type { PriceScanService } from '../services/price-scan.service';

describe('PriceScanController', () => {
  it('starts a targeted scan for a positive asset id', () => {
    const triggerScan = jest.fn().mockReturnValue({
      started: true,
      runId: 'targeted-run',
    });
    const controller = new PriceScanController({
      triggerScan,
    } as unknown as PriceScanService);

    expect(controller.trigger('42')).toEqual({
      status: 'started',
      runId: 'targeted-run',
    });
    expect(triggerScan).toHaveBeenCalledWith(42);
  });

  it('keeps the existing full-scan behavior when assetId is absent', () => {
    const triggerScan = jest.fn().mockReturnValue({
      started: true,
      runId: 'full-run',
    });
    const controller = new PriceScanController({
      triggerScan,
    } as unknown as PriceScanService);

    controller.trigger();

    expect(triggerScan).toHaveBeenCalledWith(undefined);
  });

  it.each(['0', '-1', '1.5', 'asset'])(
    'rejects invalid assetId %s',
    (assetId) => {
      const controller = new PriceScanController({
        triggerScan: jest.fn(),
      } as unknown as PriceScanService);

      expect(() => controller.trigger(assetId)).toThrow(BadRequestException);
    },
  );
});
