import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as schema from './schema.js';

export const DB = 'DB';
export const SUPABASE = 'SUPABASE';

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PostgresJsDatabase<typeof schema> => {
        const url = config.get<string>('DATABASE_URL') ?? '';
        const client = postgres(url, { max: 20 });
        return drizzle(client, { schema });
      },
    },
    {
      provide: SUPABASE,
      inject: [ConfigService],
      // Lazy: createClient throws on empty URL, so defer until first use.
      // Lets the API boot (e.g. /api/health) before Supabase env is set.
      useFactory: (config: ConfigService): SupabaseClient => {
        let real: SupabaseClient | null = null;
        const load = (): SupabaseClient => {
          if (!real) {
            const url = config.get<string>('SUPABASE_URL') ?? '';
            const key =
              config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
              config.get<string>('SUPABASE_ANON_KEY') ??
              '';
            if (!url || !key) throw new Error('Supabase env not configured');
            real = createClient(url, key);
          }
          return real;
        };
        return new Proxy({} as SupabaseClient, {
          get: (_t, p) => {
            const v = (load() as any)[p];
            return typeof v === 'function' ? v.bind(load()) : v;
          },
        });
      },
    },
  ],
  exports: [DB, SUPABASE],
})
export class DbModule {}
