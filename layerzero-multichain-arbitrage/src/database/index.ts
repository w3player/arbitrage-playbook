import { AssetEntity } from './entities/asset.entity';
import { DeploymentEntity } from './entities/deployment.entity';
import { MarketQuoteEntity } from './entities/market-quote.entity';
import { ScanStateEntity } from './entities/scan-state.entity';

export { AssetEntity } from './entities/asset.entity';
export { DeploymentEntity } from './entities/deployment.entity';
export { MarketQuoteEntity } from './entities/market-quote.entity';
export { ScanStateEntity } from './entities/scan-state.entity';

export const ALL_ENTITIES = [
  AssetEntity,
  DeploymentEntity,
  MarketQuoteEntity,
  ScanStateEntity,
];
