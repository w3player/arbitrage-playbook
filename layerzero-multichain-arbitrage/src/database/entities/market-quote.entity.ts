import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { MarketQuoteSide, MarketQuoteStatus } from '../../config/enums';

@Entity({ name: 'market_quotes' })
@Index('IDX_market_quotes_deployment_side_received', [
  'deploymentId',
  'side',
  'receivedAt',
])
@Index('IDX_market_quotes_asset_received', ['assetId', 'receivedAt'])
@Index('IDX_market_quotes_run_status', ['runId', 'status'])
export class MarketQuoteEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'run_id' })
  runId!: string;

  @Column({ name: 'asset_id' })
  assetId!: number;

  @Column({ name: 'deployment_id' })
  deploymentId!: number;

  @Column({ name: 'chain_name' })
  chainName!: string;

  @Column({ name: 'chain_id', type: 'integer' })
  chainId!: number;

  @Column({ type: 'varchar' })
  side!: MarketQuoteSide;

  @Column({ name: 'trade_token_address' })
  tradeTokenAddress!: string;

  @Column({ name: 'settlement_token_address' })
  settlementTokenAddress!: string;

  @Column({ name: 'settlement_symbol' })
  settlementSymbol!: string;

  @Column({ name: 'token_amount_raw', nullable: true, type: 'varchar' })
  tokenAmountRaw!: string | null;

  @Column({ name: 'token_decimals', type: 'integer' })
  tokenDecimals!: number;

  @Column({ name: 'settlement_decimals', type: 'integer' })
  settlementDecimals!: number;

  @Column({ name: 'from_amount_raw', nullable: true, type: 'varchar' })
  fromAmountRaw!: string | null;

  @Column({ name: 'to_amount_raw', nullable: true, type: 'varchar' })
  toAmountRaw!: string | null;

  @Column({ name: 'to_amount_min_raw', nullable: true, type: 'varchar' })
  toAmountMinRaw!: string | null;

  @Column({ name: 'gas_cost_usd_micros', default: '0' })
  gasCostUsdMicros!: string;

  @Column({ name: 'included_fee_usd_micros', default: '0' })
  includedFeeUsdMicros!: string;

  @Column({ name: 'extra_fee_usd_micros', default: '0' })
  extraFeeUsdMicros!: string;

  @Column({ nullable: true, type: 'varchar' })
  tool!: string | null;

  @Column({ name: 'requested_at', type: 'datetime' })
  requestedAt!: Date;

  @Column({ name: 'received_at', type: 'datetime' })
  receivedAt!: Date;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs!: number;

  @Column({ name: 'valid_until', type: 'datetime' })
  validUntil!: Date;

  @Column({ type: 'varchar' })
  status!: MarketQuoteStatus;

  @Column({ name: 'error_code', nullable: true, type: 'varchar' })
  errorCode!: string | null;

  @Column({ name: 'error_message', nullable: true, type: 'text' })
  errorMessage!: string | null;

  @Column({ name: 'raw_json', type: 'simple-json', default: '{}' })
  raw!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
