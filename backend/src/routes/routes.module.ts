import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller.js';

@Module({ controllers: [RoutesController] })
export class RoutesModule {}
