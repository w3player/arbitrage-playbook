import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  AssetStatus,
  CrosschainAssetType,
  TrustGrade,
} from '../../config/enums';
import { DeploymentEntity } from './deployment.entity';

@Entity({ name: 'assets' })
export class AssetEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'source_key', unique: true })
  sourceKey!: string;

  @Column()
  name!: string;

  @Column()
  symbol!: string;

  @Column({ name: 'crosschain_type', nullable: true, type: 'varchar' })
  crosschainType!: CrosschainAssetType | null;

  @Column({ name: 'trust_grade', default: TrustGrade.C, type: 'varchar' })
  trustGrade!: TrustGrade;

  @Column({ default: AssetStatus.PENDING, type: 'varchar' })
  status!: AssetStatus;

  @CreateDateColumn({ name: 'first_discovered_at' })
  firstDiscoveredAt!: Date;

  @Column({ name: 'last_verified_at', nullable: true, type: 'datetime' })
  lastVerifiedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => DeploymentEntity, (deployment) => deployment.asset)
  deployments!: DeploymentEntity[];
}
