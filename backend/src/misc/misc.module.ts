import { Module } from '@nestjs/common';
import { MiscController } from './misc.controller.js';

@Module({ controllers: [MiscController] })
export class MiscModule {}
