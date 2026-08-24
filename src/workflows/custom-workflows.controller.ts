import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { CustomWorkflowsService } from './custom-workflows.service';
import { CreateCustomWorkflowDto, UpdateCustomWorkflowDto } from './dto/custom-workflow.dto';

@ApiTags('workflows')
@ApiBearerAuth('bearer')
@Controller('workflows')
@UseGuards(JwtAuthGuard)
export class CustomWorkflowsController {
  constructor(private readonly service: CustomWorkflowsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.service.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomWorkflowDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomWorkflowDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(user.id, id);
  }
}
