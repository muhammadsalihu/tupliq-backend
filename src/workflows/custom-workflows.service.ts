import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import {
  CreateCustomWorkflowDto,
  CustomWorkflowFieldDto,
  UpdateCustomWorkflowDto,
} from './dto/custom-workflow.dto';

@Injectable()
export class CustomWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  list(userId: string) {
    return this.prisma.customWorkflow.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateCustomWorkflowDto) {
    await this.requirePro(userId);
    return this.prisma.customWorkflow.create({
      data: { ...this.toData(dto), name: dto.name.trim(), description: dto.description ?? '', instructions: dto.instructions, userId },
      select: this.select,
    });
  }

  async update(userId: string, id: string, dto: UpdateCustomWorkflowDto) {
    await this.requirePro(userId);
    const existing = await this.prisma.customWorkflow.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Custom workflow not found');
    return this.prisma.customWorkflow.update({
      where: { id: existing.id },
      data: this.toData(dto),
      select: this.select,
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.customWorkflow.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Custom workflow not found');
    await this.prisma.customWorkflow.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private readonly select = {
    id: true,
    name: true,
    description: true,
    inputFields: true,
    instructions: true,
    aiPreference: true,
    createdAt: true,
    updatedAt: true,
  };

  private toData(dto: CreateCustomWorkflowDto | UpdateCustomWorkflowDto) {
    const fields: CustomWorkflowFieldDto[] = (dto.inputFields ?? []).map((f) => ({
      name: f.name.trim().replace(/\s+/g, '_').toLowerCase(),
      label: f.label,
      type: f.type ?? (f.options?.length ? 'select' : 'text'),
      required: f.required ?? false,
      ...(f.options?.length ? { options: f.options } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
    }));
    return {
      name: dto.name?.trim() ?? 'Custom workflow',
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.instructions !== undefined ? { instructions: dto.instructions } : {}),
      ...(dto.aiPreference !== undefined ? { aiPreference: dto.aiPreference } : {}),
      inputFields: fields as unknown as object[],
    };
  }

  private async requirePro(userId: string): Promise<void> {
    if (!(await this.billing.isPro(userId))) {
      throw new ForbiddenException({
        code: 'pro_required',
        message: 'Creating custom workflows requires Tupliq Pro.',
      });
    }
  }
}
