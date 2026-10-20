import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DB } from './db/db.module.js';

describe('AppController', () => {
  let appController: AppController;
  const db = { execute: async () => [{ '?column?': 1 }] };

  beforeEach(async () => {
    db.execute = async () => [{ '?column?': 1 }];
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: DB, useValue: db }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports db up', async () => {
      await expect(appController.health()).resolves.toMatchObject({ ok: true, db: 'up' });
    });

    it('reports degraded (never throws) when the db is down', async () => {
      db.execute = async () => {
        throw new Error('connection refused');
      };
      await expect(appController.health()).resolves.toMatchObject({ ok: false, db: 'down' });
    });
  });
});
