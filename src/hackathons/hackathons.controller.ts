import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InviteCodesService } from '../invite-codes/invite-codes.service';
import { HackathonsService } from './hackathons.service';
import { CreateHackathonDto } from './dto/create-hackathon.dto';
import { UpdateHackathonDto } from './dto/update-hackathon.dto';

@ApiTags('hackathons')
@Controller('hackathons')
export class HackathonsController {
  constructor(
    private readonly hackathonsService: HackathonsService,
    private readonly inviteCodesService: InviteCodesService,
  ) {}

  @Get()
  findAll() {
    return this.hackathonsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hackathonsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateHackathonDto) {
    return this.hackathonsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHackathonDto) {
    return this.hackathonsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hackathonsService.remove(id);
  }
}
