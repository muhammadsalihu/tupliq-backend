import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { InviteCodesService } from '../invite-codes/invite-codes.service';
import { HackathonsService } from './hackathons.service';
import { CreateHackathonDto } from './dto/create-hackathon.dto';
import { UpdateHackathonDto } from './dto/update-hackathon.dto';
import { JoinHackathonDto } from './dto/join-hackathon.dto';

@ApiTags('hackathons')
@Controller('hackathons')
export class HackathonsController {
  constructor(
    private readonly hackathonsService: HackathonsService,
    private readonly inviteCodesService: InviteCodesService,
  ) {}

  @Get()
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  findAll() {
    return this.hackathonsService.findAll();
  }

  @Get(':id')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.hackathonsService.findOne(id);
  }

  @Post()
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateHackathonDto) {
    return this.hackathonsService.create(dto);
  }

  @Patch(':id')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateHackathonDto) {
    return this.hackathonsService.update(id, dto);
  }

  @Delete(':id')
  @ApiSecurity('admin-key')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.hackathonsService.remove(id);
  }

  @Post(':id/join')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  join(
    @Param('id') hackathonId: string,
    @Body() dto: JoinHackathonDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inviteCodesService.redeem(dto.code, hackathonId, user.id);
  }

  @Post(':id/leave')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id') hackathonId: string, @CurrentUser() user: RequestUser) {
    await this.hackathonsService.leave(user.id, hackathonId);
    return { ok: true };
  }

  @Post('lessons/:lessonId/toggle')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  toggleLesson(@Param('lessonId') lessonId: string, @CurrentUser() user: RequestUser) {
    return this.hackathonsService.toggleLesson(user.id, lessonId);
  }
}
