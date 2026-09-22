import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * Logs every HTTP request: method, path, status and duration.
 *
 * WHY THIS EXISTS
 * The API previously logged nothing per-request, so a failing client call
 * (bad token, wrong client ID, unreachable host) left no trace at all — auth
 * problems were invisible in production. Failures are logged at warn/error so
 * they stand out even when log level is raised.
 *
 * The query string is stripped (some endpoints carry tokens in query params),
 * and the Authorization header / body are never logged.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const method = req.method;
    const path = (req.originalUrl || req.url || '').split('?')[0];

    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      const status = res.statusCode;
      const line = `${method} ${path} ${status} ${duration}ms`;

      if (status >= 500) {
        this.logger.error(line);
      } else if (status >= 400) {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    });

    next();
  }
}