import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Turns raw Postgres driver errors into actionable API messages.
 * In particular, undefined_column (42703) means the live database is missing
 * a migration (e.g. routes.dispatch_left_photo_url from
 * supabase/migrations/0002_dispatch_photo.sql). Without this filter Nest
 * returns a bare "Internal server error" with no hint at the real cause.
 */
@Catch()
export class PostgresErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    const code = (exception as { code?: unknown })?.code;
    if (code === '42703') {
      // Security Playbook: never print column names to clients in production.
      if (process.env.NODE_ENV === 'production') {
        const body = {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        };
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
        return;
      }
      const detail =
        exception instanceof Error ? exception.message : 'undefined_column';
      const column = /column "([^"]+)"/.exec(detail)?.[1] ?? 'a required column';
      const body = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: `Database is missing column ${column}. Run the pending Supabase migration (e.g. supabase/migrations/0002_dispatch_photo.sql) and restart the API.`,
      };
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      res.status(status).send(typeof payload === 'string' ? { statusCode: status, message: payload } : payload);
      return;
    }

    const body = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(body);
  }
}
