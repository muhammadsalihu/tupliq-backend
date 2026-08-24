import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { AgentService, SseSend } from './agent.service';
import { RunAgentDto } from './dto/run-agent.dto';

@ApiTags('agent')
@ApiBearerAuth('bearer')
@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /** Workflow catalog: keys, metadata and dynamic form fields. */
  @Get('workflows')
  workflows() {
    return { workflows: this.agentService.catalog() };
  }

  /**
   * Runs the agent pipeline and streams progress as server-sent events:
   * `step` (progress), `run` (runId), `result` (final payload) or `error`.
   */
  @Post('run')
  async run(@Body() dto: RunAgentDto, @CurrentUser() user: RequestUser, @Res() res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send: SseSend = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.agentService.runStream(dto, user, send);
    } catch {
      // runStream handles its own errors; this is a last-resort guard so the
      // stream always terminates cleanly.
      send('error', { statusCode: 500, code: 'internal_error', message: 'Something went wrong.' });
    } finally {
      res.end();
    }
  }
}
