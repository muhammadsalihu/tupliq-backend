import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

// Gates hackathon/invite-code management endpoints behind a shared secret
// header, mirroring the Firestore rule "manage from the console or an admin
// app with elevated credentials" — there's no per-user admin role, just a
// key that only trusted tooling (an admin dashboard, a script) should hold.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-admin-key'];
    const expected = this.config.get<string>('ADMIN_API_KEY');

    if (!expected || provided !== expected) {
      throw new UnauthorizedException('Invalid or missing admin key');
    }
    return true;
  }
}
