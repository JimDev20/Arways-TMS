import { Module } from '@nestjs/common';
import { TrucksController } from './trucks.controller.js';

@Module({ controllers: [TrucksController] })
export class TrucksModule {}
