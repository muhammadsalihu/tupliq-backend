import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudAgentService } from './cloud-agent.service';
import { ProvisionDto } from './dto/cloud-agent.dto';

@ApiTags('cloud-agent')
@ApiBearerAuth('bearer')
@Controller('cloud-agent')
@UseGuards(JwtAuthGuard)
export class CloudAgentController {
  constructor(private readonly cloudAgent: CloudAgentService) {}

  /** Get instance status (or { provisioned: false } if none). */
  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.getStatus(user.id);
  }

  /** Provision a new cloud agent instance for the user. */
  @Post('provision')
  provision(@CurrentUser() user: RequestUser, @Body() dto: ProvisionDto) {
    return this.cloudAgent.provision(user.id, dto.name);
  }

  /** Delete the user's cloud agent instance. */
  @Delete()
  @HttpCode(200)
  deprovision(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.deprovision(user.id);
  }

  /** Send a message and get a full response. */
  @Post('chat')
  async chat(
    @CurrentUser() user: RequestUser,
    @Body('input') input: string,
    @Body('sessionId') sessionId?: string,
  ) {
    return this.cloudAgent.sendMessage(user.id, input, sessionId);
  }

  /** Stream a message via SSE. */
  @Post('chat/stream')
  async chatStream(
    @CurrentUser() user: RequestUser,
    @Body('input') input: string,
    @Body('sessionId') sessionId: string | undefined,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await this.cloudAgent.sendMessageStream(
        user.id,
        input,
        sessionId,
        send,
      );
      send('done', { sessionId: result.sessionId });
    } catch (err: any) {
      send('error', { message: err?.message ?? 'Stream failed' });
    } finally {
      res.end();
    }
  }
}
