import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbModule } from './db/db.module.js';
import { CommonModule } from './common/common.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { TrucksModule } from './trucks/trucks.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { RoutesModule } from './routes/routes.module.js';
import { MiscModule } from './misc/misc.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env.example'] }),
    DbModule,
    CommonModule,
    AuthModule,
    UsersModule,
    TrucksModule,
    OrdersModule,
    RoutesModule,
    MiscModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
