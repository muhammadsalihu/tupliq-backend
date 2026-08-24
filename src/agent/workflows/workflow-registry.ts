import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { WorkflowDefinition } from './types';
import { clientFollowupWorkflow } from './client-followup.workflow';
import { proposalGeneratorWorkflow } from './proposal-generator.workflow';
import { meetingToTasksWorkflow } from './meeting-to-tasks.workflow';
import { dailyPlannerWorkflow } from './daily-planner.workflow';
import { researchAssistantWorkflow } from './research-assistant.workflow';
import { contentRepurposerWorkflow } from './content-repurposer.workflow';
import { generalAssistantWorkflow } from './general-assistant.workflow';

const WORKFLOWS: WorkflowDefinition[] = [
  clientFollowupWorkflow,
  proposalGeneratorWorkflow,
  meetingToTasksWorkflow,
  dailyPlannerWorkflow,
  researchAssistantWorkflow,
  contentRepurposerWorkflow,
];

@Injectable()
export class WorkflowRegistry {
  private readonly byKey = new Map<string, WorkflowDefinition>(
    [...WORKFLOWS, generalAssistantWorkflow].map((w) => [w.key, w]),
  );

  all(): WorkflowDefinition[] {
    return [...WORKFLOWS];
  }

  get(key: string): WorkflowDefinition | undefined {
    return this.byKey.get(key);
  }

  require(key: string): WorkflowDefinition {
    const workflow = this.byKey.get(key);
    if (!workflow) throw new NotFoundException(`Unknown workflow "${key}"`);
    return workflow;
  }
}
