import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CONTROLLERS } from './controllers';
import { SERVICES } from './services';
import { ALL_ENTITIES } from './database';
import { CreateAssetScannerTables1723420800000 } from './database/migrations/1723420800000-CreateAssetScannerTables';
import { CreateScanState1786464000000 } from './database/migrations/1786464000000-CreateScanState';
import { CreateMarketQuotes1786550400000 } from './database/migrations/1786550400000-CreateMarketQuotes';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: configService.getOrThrow<string>('DATABASE_PATH'),
        autoLoadEntities: true,
        migrations: [
          CreateAssetScannerTables1723420800000,
          CreateScanState1786464000000,
          CreateMarketQuotes1786550400000,
        ],
        migrationsTableName: 'typeorm_migrations',
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  controllers: CONTROLLERS,
  providers: SERVICES,
})
export class AppModule {}
