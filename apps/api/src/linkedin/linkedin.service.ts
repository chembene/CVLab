import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { LinkedInProfile } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ProfileService } from '../profile/profile.service';
import { MasterResumeService } from '../master-resume/master-resume.service';
import { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import { JobTargetService } from '../job-target/job-target.service';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { LinkedInPromptInput } from './prompt/linkedin-prompt-builder';
import { LinkedInResponseParser } from './prompt/linkedin-response.parser';
import { LinkedInRepository } from './linkedin.repository';
import type { CreateLinkedInProfileDto } from './dto/create-linkedin-profile.dto';
import type {
  LinkedInProfileContext,
  LinkedInProfileContextSnapshot,
} from './interfaces/linkedin-profile-context.interface';

/**
 * Orchestrates the LinkedIn Profile flow per docs/architecture/linkedin-engine.md:
 * best-effort context gathering (every source optional, never invented) →
 * AI Orchestration → Prompt Builder → AI Provider → persisted
 * LinkedInProfile row. Never calls a provider or the credit ledger directly
 * — every AI call goes through AiOrchestrationService.execute(), the only
 * thing allowed to touch CreditService/AiRequestTrackingService. No
 * parallel architecture: this mirrors CareerAdvisorService (FASE 18)
 * exactly, narrowed to this feature's own context scope (no Applications/ATS
 * Reports/Interview history — see linkedin-engine.md §3).
 */
@Injectable()
export class LinkedInService {
  constructor(
    private readonly repository: LinkedInRepository,
    private readonly profileService: ProfileService,
    private readonly masterResumeService: MasterResumeService,
    private readonly resumeSectionsService: ResumeSectionsService,
    private readonly jobTargetService: JobTargetService,
    private readonly aiOrchestrationService: AiOrchestrationService,
  ) {}

  async generateProfile(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateLinkedInProfileDto,
  ): Promise<LinkedInProfile> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const context = await this.buildContext(requestingUser, targetUserId);
    const snapshot = this.buildContextSnapshot(context);

    const promptInput: LinkedInPromptInput = { targetRole: dto.targetRole ?? null, context };

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: AIFeature.LINKEDIN,
      input: promptInput,
      idempotencyKey: `linkedin:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          LinkedInResponseParser.parse(generateResult.text);
        },
      },
    });

    const parsed = LinkedInResponseParser.parse(result.text);

    return this.repository.create(targetUserId, {
      targetRole: dto.targetRole,
      headline: parsed.headline,
      about: parsed.about,
      skills: parsed.skills,
      experienceSuggestions: parsed.experienceSuggestions,
      recommendations: parsed.recommendations,
      contextSnapshot: snapshot,
      creditsUsed: result.creditsCharged,
      aiRequestId: result.aiRequestId,
    });
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<LinkedInProfile[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<LinkedInProfile> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const profile = await this.repository.findById(id);
    if (!profile || profile.userId !== targetUserId) {
      throw new NotFoundException('LinkedIn profile not found.');
    }
    return profile;
  }

  /**
   * Gathers every optional data source this feature uses. Every read is
   * independently optional — a user with none of this data still gets a
   * fully valid, all-empty context, never a thrown error.
   * ResumeSectionsService.list() throws NotFoundException when no
   * MasterResume exists, so sections are only fetched when one does — same
   * gotcha as CareerAdvisorService.buildContext() (FASE 18).
   */
  private async buildContext(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<LinkedInProfileContext> {
    const [profile, masterResume, jobTargets] = await Promise.all([
      this.profileService.getForUser(requestingUser, targetUserId),
      this.masterResumeService.getForUser(requestingUser, targetUserId),
      this.jobTargetService.list(requestingUser, targetUserId),
    ]);

    const [workExperience, education, skills] = masterResume
      ? await Promise.all([
          this.resumeSectionsService.list('work-experience', requestingUser, targetUserId),
          this.resumeSectionsService.list('education', requestingUser, targetUserId),
          this.resumeSectionsService.list('skills', requestingUser, targetUserId),
        ])
      : [[], [], []];

    return {
      profile: profile
        ? {
            firstName: profile.firstName,
            lastName: profile.lastName,
            headline: profile.headline,
            city: profile.city,
            country: profile.country,
          }
        : null,
      masterResume: masterResume
        ? {
            title: masterResume.title,
            summary: masterResume.summary,
            careerLevel: masterResume.careerLevel,
            yearsExperience: masterResume.yearsExperience,
            desiredPosition: masterResume.desiredPosition,
          }
        : null,
      // SectionRecord's index signature is `unknown` — these three section
      // types' own field shapes (WorkExperience/Education/Skill in
      // prisma/schema.prisma) are stable and well known, same trade-off
      // CareerAdvisorService already makes (FASE 18).
      workExperience: workExperience.map((w) => ({
        position: w.position as string,
        company: w.company as string,
        description: w.description as string | null,
        achievements: (w.achievements as string[] | null) ?? [],
        currentlyWorking: w.currentlyWorking as boolean,
      })),
      education: education.map((e) => ({
        degree: e.degree as string | null,
        institution: e.institution as string,
        field: e.field as string | null,
      })),
      skills: skills.map((s) => ({
        name: s.name as string,
        level: s.level as string | null,
      })),
      jobTargets: jobTargets.map((jt) => ({ title: jt.title, company: jt.company })),
    };
  }

  private buildContextSnapshot(context: LinkedInProfileContext): LinkedInProfileContextSnapshot {
    return {
      hasProfile: context.profile !== null,
      hasMasterResume: context.masterResume !== null,
      workExperienceCount: context.workExperience.length,
      educationCount: context.education.length,
      skillsCount: context.skills.length,
      jobTargetsCount: context.jobTargets.length,
    };
  }
}
