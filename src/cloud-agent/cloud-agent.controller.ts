import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { CloudAgentService } from './cloud-agent.service';
import { ProvisionDto, NotifyDto } from './dto/cloud-agent.dto';
import { BotsService } from './bots/bots.service';
import { CreateBotDto, UpdateBotDto } from './bots/dto/bots.dto';
@ApiTags('cloud-agent')
@ApiBearerAuth('bearer')
@Controller('cloud-agent')
@UseGuards(JwtAuthGuard)
export class CloudAgentController {
  constructor(
    private readonly cloudAgent: CloudAgentService,
    private readonly botsService: BotsService,
  ) {}

  // ── Instance ────────────────────────────────────────────────────

  @Get('status')
  status(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.getStatus(user.id);
  }

  @Get('access')
  access(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.getAccessUrls(user.id);
  }

  @Post('provision')
  provision(@CurrentUser() user: RequestUser, @Body() dto: ProvisionDto) {
    return this.cloudAgent.provision(user.id, dto.name);
  }

  @Delete()
  @HttpCode(200)
  deprovision(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.deprovision(user.id);
  }

  // ── Simple chat (legacy, single-agent) ────────────────────────────

  @Post('chat')
  async chat(
    @CurrentUser() user: RequestUser,
    @Body('input') input: string,
    @Body('sessionId') sessionId?: string,
  ) {
    return this.cloudAgent.sendMessage(user.id, input, sessionId);
  }

  @Post('chat/stream')
  async chatStream(
    @CurrentUser() user: RequestUser,
    @Body('input') input: string,
    @Body('sessionId') sessionId: string | undefined,
    @Res() res: Response,
  ) {
    this.sseSetup(res);
    const send = (event: string, data: unknown) => res.write(`event: ${event}\\ndata: ${JSON.stringify(data)}\\n\\n`);
    try {
      const result = await this.cloudAgent.sendMessageStream(user.id, input, sessionId, send);
      send('done', { sessionId: result.sessionId });
    } catch (err: any) { send('error', { message: err?.message ?? 'Stream failed' }); }
    finally { res.end(); }
  }

  // ── Bots CRUD ────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('bots')
  createBot(@CurrentUser() user: RequestUser, @Body() dto: CreateBotDto) {
    return this.botsService.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bots')
  listBots(@CurrentUser() user: RequestUser) {
    return this.botsService.list(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bots/:id')
  getBot(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.botsService.getOne(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('bots/:id')
  updateBot(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.botsService.update(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('bots/:id')
  @HttpCode(200)
  deleteBot(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.botsService.delete(user.id, id);
  }

  // ── Bot chat ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('bots/:id/chat')
  async botChat(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body('input') input: string,
    @Body('sessionId') sessionId?: string,
    @Body('model') model?: string,
  ) {
    return this.cloudAgent.sendBotMessage(user.id, id, input, sessionId, model);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bots/:id/chat/stream')
  async botChatStream(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body('input') input: string,
    @Body('sessionId') sessionId: string | undefined,
    @Body('model') model: string | undefined,
    @Res() res: Response,
  ) {
    this.sseSetup(res);
    const send = (event: string, data: unknown) => res.write(`event: ${event}\\ndata: ${JSON.stringify(data)}\\n\\n`);
    try {
      const result = await this.cloudAgent.sendBotMessageStream(user.id, id, input, sessionId, send, model);
      send('done', { sessionId: result.sessionId });
    } catch (err: any) { send('error', { message: err?.message ?? 'Stream failed' }); }
    finally { res.end(); }
  }

  // ── Chat sessions (per-bot threads created on first message) ──────

  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/sessions')
  listBotSessions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.botsService.listSessions(user.id, id);
  }

  // ── Team chat ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('team-chat')
  async teamChat(
    @CurrentUser() user: RequestUser,
    @Body('input') input: string,
    @Res() res: Response,
  ) {
    this.sseSetup(res);
    const send = (event: string, data: unknown) => res.write(`event: ${event}\\ndata: ${JSON.stringify(data)}\\n\\n`);
    try {
      await this.cloudAgent.handleTeamChat(user.id, input, send);
    } catch (err: any) { send('error', { message: err?.message ?? 'Team chat failed' }); }
    finally { res.end(); }
  }

  // ── Routines ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/routines')
  listRoutines(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cloudAgent.listRoutines(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bots/:id/routines')
  createRoutine(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: { name: string; schedule: string; timezone: string; prompt: string },
  ) {
    return this.cloudAgent.createRoutine(user.id, id, dto);
  }

  // Routed on the 12-hex cron id: Agent37 addresses crons by id, never by name.
  @UseGuards(JwtAuthGuard)
  @Delete('bots/:id/routines/:cronId')
  @HttpCode(200)
  deleteRoutine(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('cronId') cronId: string,
  ) {
    return this.cloudAgent.deleteRoutine(user.id, id, cronId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bots/:id/routines/:cronId/test')
  testRoutine(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('cronId') cronId: string,
  ) {
    return this.cloudAgent.testRoutine(user.id, id, cronId);
  }

  /** Pause/resume a routine without deleting it. */
  @UseGuards(JwtAuthGuard)
  @Patch('bots/:id/routines/:cronId')
  setRoutineEnabled(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('cronId') cronId: string,
    @Body('enabled') enabled: boolean,
  ) {
    return this.cloudAgent.setRoutineEnabled(user.id, id, cronId, enabled !== false);
  }

  /** Run history; each run carries the session it opened. */
  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/routines/:cronId/runs')
  listRoutineRuns(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('cronId') cronId: string,
  ) {
    return this.cloudAgent.listRoutineRuns(user.id, id, cronId);
  }

  /**
   * Reattach to a turn that is still running.
   *
   * `active_response_id` is returned by the session; a client that reloaded
   * mid-turn can resume streaming the remainder instead of rendering an empty
   * thread while the Bot keeps working.
   */
  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/sessions/:sessionId/responses/:responseId/stream')
  reattachResponseStream(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
    @Param('responseId') responseId: string,
    @Res() res: Response,
  ) {
    return this.cloudAgent.reattachResponseStream(
      user.id, id, sessionId, responseId, res,
    );
  }

  /** Team chat transcript for one Bot's shared group session. */
  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/team/transcript')
  getTeamTranscript(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cloudAgent.getTeamTranscript(user.id, id);
  }

  // ── Session transcript ────────────────────────────────────────────
  // Agent37 exposes GET /v1/sessions/{id} with the full `history` array.
  // (There is no /sessions/{id}/messages route.)

  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/sessions/:sessionId')
  getSessionTranscript(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.cloudAgent.getSessionTranscript(user.id, id, sessionId);
  }

  // ── Tools ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('tools/catalog')
  toolCatalog(@CurrentUser() user: RequestUser, @Req() req: Request) {
    const search = (req.query as any).search as string | undefined;
    return this.cloudAgent.listToolkits(user.id, search);
  }

  @UseGuards(JwtAuthGuard)
  @Post('tools/connect')
  connectTool(
    @CurrentUser() user: RequestUser,
    @Body('toolkit') toolkit: string,
    @Body('returnTo') returnTo?: string,
  ) {
    return this.cloudAgent.connectTool(user.id, toolkit, returnTo);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tools/connections')
  listConnections(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.listConnections(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tools/connections/:toolkit')
  @HttpCode(200)
  disconnectTool(@CurrentUser() user: RequestUser, @Param('toolkit') toolkit: string) {
    return this.cloudAgent.disconnectTool(user.id, toolkit);
  }

  // ── SOUL & notes ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('soul')
  getSoul(@CurrentUser() user: RequestUser) {
    return this.cloudAgent.getSoul(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('soul')
  updateSoul(@CurrentUser() user: RequestUser, @Body('content') content: string) {
    return this.cloudAgent.updateSoul(user.id, content);
  }

  @UseGuards(JwtAuthGuard)
  @Get('bots/:id/notes')
  getBotNotes(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cloudAgent.getBotNotes(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('bots/:id/notes')
  updateBotNotes(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body('content') content: string) {
    return this.cloudAgent.updateBotNotes(user.id, id, content);
  }

  // ── Helper ────────────────────────────────────────────────────────

  private sseSetup(res: Response) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
  }
}

/**
 * Public notify endpoint — NO JWT, NO Pro gate.
 *
 * The instance's notify.mjs calls this with its per-instance
 * GROKBOT_NOTIFY_TOKEN, so access control is the token itself, not a user
 * session. (The previous implementation sat behind JwtAuthGuard, so every
 * bot notification 401'd and bots could never proactively message users.)
 *
 * Must be its own controller class: @UseGuards applies per controller, and
 * there is no way to opt a single route out of a class-level guard.
 */
@ApiTags('cloud-agent')
@Controller('cloud-agent')
export class CloudAgentNotifyController {
  constructor(private readonly cloudAgent: CloudAgentService) {}

  @Post('notify')
  async notify(
    @Req() req: Request & { headers: Record<string, string | string[] | undefined> },
    @Body() body: NotifyDto,
  ) {
    const headerToken = req.headers['x-notify-token'];
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\\s+/i, '');
    const token = (Array.isArray(headerToken) ? headerToken[0] : headerToken) || bearer;
    if (!token) return { ok: false, reason: 'Missing notify token' };
    if (!body?.instance_id || !body?.text) {
      return { ok: false, reason: 'instance_id and text are required' };
    }
    return this.cloudAgent.deliverBotNotification({
      instanceId: body.instance_id,
      token,
      botHandle: body.bot ?? 'assistant',
      text: String(body.text).slice(0, 2000),
    });
  }
}