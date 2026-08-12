import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { CrosschainAssetType, DeploymentScanStatus } from '../../config/enums';
import { AssetEntity } from './asset.entity';

export interface PeerSnapshot {
  endpointId: number;
  peer: string;
  reversePeer: boolean | null;
  status: 'active' | 'one_way' | 'unknown';
}

export interface DeploymentEvidence {
  metadataUrl: string;
  metadataType: string;
  metadata: Record<string, unknown>;
  metadataHash?: string;
  metadataMissingCount?: number;
  lastMetadataSeenAt?: string;
  blockNumber?: string;
  oftVersion?: { interfaceId: string; version: string };
}

@Entity({ name: 'deployments' })
@Unique('UQ_deployments_chain_oft', ['chainName', 'oftAddress'])
export class DeploymentEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'asset_id' })
  assetId!: number;

  @ManyToOne(() => AssetEntity, (asset) => asset.deployments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'asset_id' })
  asset!: AssetEntity;

  @Column({ name: 'chain_name' })
  chainName!: string;

  @Column({ name: 'chain_id', nullable: true, type: 'integer' })
  chainId!: number | null;

  @Column({ name: 'endpoint_id', nullable: true, type: 'integer' })
  endpointId!: number | null;

  @Column({ name: 'oft_address' })
  oftAddress!: string;

  @Column({ name: 'token_address', nullable: true, type: 'varchar' })
  tokenAddress!: string | null;

  @Column({ name: 'implementation_address', nullable: true, type: 'varchar' })
  implementationAddress!: string | null;

  @Column({ name: 'admin_address', nullable: true, type: 'varchar' })
  adminAddress!: string | null;

  @Column({ name: 'endpoint_address', nullable: true, type: 'varchar' })
  endpointAddress!: string | null;

  @Column({ nullable: true, type: 'varchar' })
  name!: string | null;

  @Column({ nullable: true, type: 'varchar' })
  symbol!: string | null;

  @Column({ name: 'local_decimals', nullable: true, type: 'integer' })
  localDecimals!: number | null;

  @Column({ name: 'shared_decimals', nullable: true, type: 'integer' })
  sharedDecimals!: number | null;

  @Column({ name: 'asset_type', nullable: true, type: 'varchar' })
  assetType!: CrosschainAssetType | null;

  @Column({ name: 'approval_required', nullable: true, type: 'boolean' })
  approvalRequired!: boolean | null;

  @Column({ nullable: true, type: 'varchar' })
  owner!: string | null;

  @Column({ nullable: true, type: 'boolean' })
  paused!: boolean | null;

  @Column({ name: 'bytecode_hash', nullable: true, type: 'varchar' })
  bytecodeHash!: string | null;

  @Column({ name: 'peers_json', type: 'simple-json', default: '{}' })
  peers!: Record<string, PeerSnapshot>;

  @Column({ name: 'quote_json', type: 'simple-json', default: '{}' })
  quote!: Record<string, unknown>;

  @Column({ name: 'evidence_json', type: 'simple-json', default: '{}' })
  evidence!: DeploymentEvidence;

  @Column({ name: 'config_hash', nullable: true, type: 'varchar' })
  configHash!: string | null;

  @Column({
    name: 'scan_status',
    default: DeploymentScanStatus.DISCOVERED,
    type: 'varchar',
  })
  scanStatus!: DeploymentScanStatus;

  @Column({ name: 'error_reason', nullable: true, type: 'text' })
  errorReason!: string | null;

  @Column({ name: 'last_scanned_block', nullable: true, type: 'varchar' })
  lastScannedBlock!: string | null;

  @Column({ name: 'last_scanned_at', nullable: true, type: 'datetime' })
  lastScannedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
