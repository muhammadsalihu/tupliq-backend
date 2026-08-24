import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when the user has consumed their monthly quota for the current plan.
 * HTTP 402 so clients can react by presenting the paywall.
 */
export class UsageLimitException extends HttpException {
  constructor(tier: string, limit: number) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'usage_limit_exceeded',
        message: `You have used all ${limit} monthly runs on the ${tier} plan. Upgrade to Tupliq Pro for more.`,
        tier,
        limit,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/** Thrown when every configured AI provider failed for a request. */
export class AllProvidersFailedException extends HttpException {
  constructor(detail?: string) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        code: 'all_providers_failed',
        message: 'The AI service is temporarily unavailable. Your run was not counted.',
        detail,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}
