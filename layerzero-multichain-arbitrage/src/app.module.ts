import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CONTROLLERS } from './controllers';
import { SERVICES } from './services';
import { ALL_ENTITIES } from './database';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        type: 'better-sqlite3',
        database: cs.getOrThrow<string>('DATABASE_PATH'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature(ALL_ENTITIES),
  ],
  controllers: CONTROLLERS,
  providers: [...SERVICES],
})
export class AppModule {}
