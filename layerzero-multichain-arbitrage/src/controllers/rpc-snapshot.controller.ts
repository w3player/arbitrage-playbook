import { BadRequestException, Body, Controller, Post } from '@nestjs/common';

import type {
  RpcSnapshotRequestDto,
  RpcSnapshotResponseDto,
} from '../dto/rpc-snapshot.dto';
import { RpcSnapshotService } from '../services/rpc-snapshot.service';

@Controller('rpc-snapshots')
export class RpcSnapshotController {
  constructor(private readonly rpcSnapshotService: RpcSnapshotService) {}

  @Post()
  create(@Body() body: unknown): Promise<RpcSnapshotResponseDto> {
    return this.rpcSnapshotService.create(this.parseRequest(body));
  }

  private parseRequest(body: unknown): RpcSnapshotRequestDto {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('request body is required');
    }
    const input = body as Record<string, unknown>;
    if (!Number.isSafeInteger(input.assetId) || Number(input.assetId) <= 0) {
      throw new BadRequestException('assetId must be a positive integer');
    }
    if (
      typeof input.buyChainName !== 'string' ||
      !input.buyChainName.trim() ||
      typeof input.sellChainName !== 'string' ||
      !input.sellChainName.trim()
    ) {
      throw new BadRequestException(
        'buyChainName and sellChainName are required',
      );
    }
    if (input.buyChainName === input.sellChainName) {
      throw new BadRequestException('buy and sell chains must differ');
    }
    return {
      assetId: Number(input.assetId),
      buyChainName: input.buyChainName,
      sellChainName: input.sellChainName,
    };
  }
}
