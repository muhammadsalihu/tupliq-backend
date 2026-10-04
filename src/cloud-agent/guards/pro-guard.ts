import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../../billing/billing.service';

export const PRO_GATED_KEY = 'isProGated';

/** Marks an endpoint (or controller class) as Pro-only. See ProGuard. */
export const ProOnly = () => SetMetadata(PRO_GATED_KEY, true);

/**
 * Pro-gate for the cloud agent surface.
 *
 * Gate is SERVER-SIDE: the mobile app hides the Cloud Agent module unless the
 * user is Pro, but hiding a tab must not be the security boundary — a free
 * user with the API base URL and a valid JWT could otherwise call
 * /cloud-agent/* directly and get a free Agent37 instance.
 *
 * Free users hitting a gated endpoint get 402 with an upgrade message the
 * client can show directly.
 */
@Injectable()
export class ProGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isProGated =
      this.reflector.getAllAndOverride<boolean>(PRO_GATED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;
    if (!isProGated) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) {
      // Not authenticated — JwtAuthGuard handles rejection; nothing to gate.
      return true;
    }

    const isPro = await this.billing.isPro(user.id);
    if (isPro) return true;

    // 402 Payment Required — the client shows the upgrade message verbatim.
    const response = context.switchToHttp().getResponse();
    response.status(402);
    return false;
  }
}

export const PRO_UPGRADE_MESSAGE =
  'Cloud Agent is a Pro feature. Upgrade to Tupliq Pro to get your own cloud computer.';
