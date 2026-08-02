import { Injectable } from '@nestjs/common';
import type {
  JobTarget,
  JobTargetKeyword,
  JobTargetLanguage,
  JobTargetSkill,
  JobTargetStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface JobTargetWithChildren extends JobTarget {
  keywords: JobTargetKeyword[];
  skills: JobTargetSkill[];
  languages: JobTargetLanguage[];
}

export interface JobTargetData {
  title?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  seniority?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  jobUrl?: string;
  jobDescription?: string;
  source?: string;
  status?: JobTargetStatus;
  notes?: string;
}

const CHILDREN_INCLUDE = { keywords: true, skills: true, languages: true } as const;

/** Only Prisma access for `job_targets` and its three child collections lives here. */
@Injectable()
export class JobTargetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByUserId(userId: string): Promise<JobTargetWithChildren[]> {
    return this.prisma.jobTarget.findMany({
      where: { userId, deletedAt: null },
      include: CHILDREN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<JobTargetWithChildren | null> {
    return this.prisma.jobTarget.findFirst({
      where: { id, deletedAt: null },
      include: CHILDREN_INCLUDE,
    });
  }

  create(userId: string, data: JobTargetData & { title: string }): Promise<JobTarget> {
    return this.prisma.jobTarget.create({ data: { userId, ...data } });
  }

  update(id: string, data: JobTargetData): Promise<JobTarget> {
    return this.prisma.jobTarget.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<JobTarget> {
    return this.prisma.jobTarget.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Fully replaces the job target's keyword set — the whole collection is small and untracked individually, so replace-on-write is simpler than diffing. */
  async replaceKeywords(
    jobTargetId: string,
    keywords: { keyword: string; weight?: number }[],
  ): Promise<void> {
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.jobTargetKeyword.deleteMany({ where: { jobTargetId } }),
    ];
    if (keywords.length > 0) {
      ops.push(
        this.prisma.jobTargetKeyword.createMany({
          data: keywords.map((k) => ({ jobTargetId, keyword: k.keyword, weight: k.weight })),
        }),
      );
    }
    await this.prisma.$transaction(ops);
  }

  async replaceSkills(
    jobTargetId: string,
    skills: { skill: string; required?: boolean }[],
  ): Promise<void> {
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.jobTargetSkill.deleteMany({ where: { jobTargetId } }),
    ];
    if (skills.length > 0) {
      ops.push(
        this.prisma.jobTargetSkill.createMany({
          data: skills.map((s) => ({ jobTargetId, skill: s.skill, required: s.required ?? false })),
        }),
      );
    }
    await this.prisma.$transaction(ops);
  }

  async replaceLanguages(
    jobTargetId: string,
    languages: { language: string; level?: string }[],
  ): Promise<void> {
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.jobTargetLanguage.deleteMany({ where: { jobTargetId } }),
    ];
    if (languages.length > 0) {
      ops.push(
        this.prisma.jobTargetLanguage.createMany({
          data: languages.map((l) => ({ jobTargetId, language: l.language, level: l.level })),
        }),
      );
    }
    await this.prisma.$transaction(ops);
  }
}
