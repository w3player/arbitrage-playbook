import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface LayerZeroMessageScanState {
  windowStart?: string;
  windowEnd?: string;
  nextToken?: string;
  lastCompletedAt?: string;
}

@Entity({ name: 'scan_state' })
export class ScanStateEntity {
  @PrimaryColumn()
  key!: string;

  @Column({ name: 'value_json', type: 'simple-json', default: '{}' })
  value!: LayerZeroMessageScanState;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
