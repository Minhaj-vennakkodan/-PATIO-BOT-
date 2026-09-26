import { prisma } from '../database/client';

export type ModAction = 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN' | 'UNBAN' | 'CHATBAN';
export type ModSource = 'MANUAL' | 'AUTOMOD' | 'SYSTEM';

export interface CreateCaseData {
  guildId: string;
  userId: string;
  moderatorId: string;
  action: ModAction;
  reason?: string;
  source: ModSource;
  duration?: number;
  metadata?: string;
}

export async function createCase(data: CreateCaseData) {
  const reasonStr = data.reason ? data.reason.substring(0, 500) : 'No reason provided';
  
  // Atomically increment the case number sequence for the guild
  const config = await prisma.guildConfig.upsert({
    where: { guildId: data.guildId },
    update: { nextCaseNumber: { increment: 1 } },
    create: { guildId: data.guildId, nextCaseNumber: 2 } // Returns 2, so our case will be 1
  });

  const caseNumber = config.nextCaseNumber - 1;

  const modCase = await prisma.moderationCase.create({
    data: {
      guildId: data.guildId,
      caseNumber,
      userId: data.userId,
      moderatorId: data.moderatorId,
      action: data.action,
      reason: reasonStr,
      source: data.source,
      duration: data.duration,
      metadata: data.metadata,
      active: true,
    }
  });

  return modCase;
}

export async function getCaseByNumber(guildId: string, caseNumber: number) {
  return await prisma.moderationCase.findUnique({
    where: { guildId_caseNumber: { guildId, caseNumber } }
  });
}

export async function getUserHistory(guildId: string, userId: string, limit = 10, skip = 0) {
  return await prisma.moderationCase.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip
  });
}

export async function getRecentGuildCases(guildId: string, limit = 10) {
  return await prisma.moderationCase.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export async function updateCase(guildId: string, caseNumber: number, updateData: { reason?: string; active?: boolean }) {
  return await prisma.moderationCase.update({
    where: { guildId_caseNumber: { guildId, caseNumber } },
    data: updateData
  });
}

export async function deactivateCase(guildId: string, caseNumber: number) {
  return await prisma.moderationCase.update({
    where: { guildId_caseNumber: { guildId, caseNumber } },
    data: { active: false }
  });
}
