import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from './types/user-profile.type';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        joinedHackathons: { select: { hackathonId: true } },
        completedLessons: { select: { lesson: { select: { id: true, hackathonId: true } } } },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      onboardingComplete: user.onboardingComplete,
      selectedInterests: user.selectedInterests,
      joinedHackathonIds: user.joinedHackathons.map((h) => h.hackathonId),
      completedLessonKeys: user.completedLessons.map(
        (c) => `${c.lesson.hackathonId}-${c.lesson.id}`,
      ),
      agentsExplored: user.agentsExplored,
      notificationsOn: user.notificationsOn,
      darkModeOn: user.darkModeOn,
    };
  }

  async completeOnboarding(userId: string, selectedInterests: string[]): Promise<UserProfile> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { onboardingComplete: true, selectedInterests },
    });
    return this.getProfile(userId);
  }

  async updateInterests(userId: string, selectedInterests: string[]): Promise<UserProfile> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedInterests },
    });
    return this.getProfile(userId);
  }

  async updateSettings(
    userId: string,
    settings: { notificationsOn?: boolean; darkModeOn?: boolean },
  ): Promise<UserProfile> {
    await this.prisma.user.update({
      where: { id: userId },
      data: settings,
    });
    return this.getProfile(userId);
  }

  async markAgentExplored(userId: string, agentId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { agentsExplored: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!user.agentsExplored.includes(agentId)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { agentsExplored: { push: agentId } },
      });
    }

    return this.getProfile(userId);
  }
}
