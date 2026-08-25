import { BadRequestException } from '@nestjs/common';

import type { RpcSnapshotService } from '../services/rpc-snapshot.service';
import { RpcSnapshotController } from './rpc-snapshot.controller';

describe('RpcSnapshotController', () => {
  it('passes a valid directional request to the snapshot service', async () => {
    const create = jest.fn().mockResolvedValue({ mode: 'rpc_snapshot' });
    const controller = new RpcSnapshotController({
      create,
    } as unknown as RpcSnapshotService);
    const request = {
      assetId: 42,
      buyChainName: 'base',
      sellChainName: 'ethereum',
    };

    await controller.create(request);

    expect(create).toHaveBeenCalledWith(request);
  });

  it.each([
    null,
    {},
    { assetId: 0, buyChainName: 'base', sellChainName: 'ethereum' },
    { assetId: 1, buyChainName: 'base', sellChainName: 'base' },
  ])('rejects invalid request %#', (request) => {
    const controller = new RpcSnapshotController({
      create: jest.fn(),
    } as unknown as RpcSnapshotService);

    expect(() => controller.create(request)).toThrow(BadRequestException);
  });
});
