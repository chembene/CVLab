import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { CareerAdvice } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ProfileService } from '../profile/profile.service';
import { MasterResumeService } from '../master-resume/master-resume.service';
import { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import { JobTargetService } from '../job-target/job-target.service';
import { ResumeVariantService } from '../resume-variant/resume-variant.service';
import { ApplicationService } from '../application/application.service';
import { AtsReportRepository } from '../ats/ats-report.repository';
import { InterviewService } from '../interview/interview.service';
import { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { CareerAdvisorPromptInput } from './prompt/career-advisor-prompt-builder';
import { CareerAdvisorResponseParser } from './prompt/career-advisor-response.parser';
import { CareerAdvisorRepository } from './career-advisor.repository';
import type { CreateAdviceDto } from './dto/create-advice.dto';
import type {
  CareerAdviceContext,
  CareerAdviceContextSnapshot,
} from './interfaces/career-advice-context.interface';

/**
 * Orchestrates the Career Advisor flow per docs/architecture/career-advisor-engine.md:
 * best-effort context gathering (every source optional, never invented) →
 * AI Orchestration → Prompt Builder → AI Provider → persisted CareerAdvice
 * row. Never calls a provider or the credit ledger directly — every AI call
 * goes through AiOrchestrationService.execute(), the only thing allowed to
 * touch CreditService/AiRequestTrackingService. No parallel architecture:
 * this mirrors CoverLetterService/ResumeOptimizationService exactly.
 */
@Injectable()
export class CareerAdvisorService {
  constructor(
    private readonly repository: CareerAdvisorRepository,
    private readonly profileService: ProfileService,
    private readonly masterResumeService: MasterResumeService,
    private readonly resumeSectionsService: ResumeSectionsService,
    private readonly jobTargetService: JobTargetService,
    private readonly resumeVariantService: ResumeVariantService,
    private readonly applicationService: ApplicationService,
    private readonly atsReportRepository: AtsReportRepository,
    private readonly interviewService: InterviewService,
    private readonly aiOrchestrationService: AiOrchestrationService,
  ) {}

  async requestAdvice(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateAdviceDto,
  ): Promise<CareerAdvice> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const context = await this.buildContext(requestingUser, targetUserId);
    const snapshot = this.buildContextSnapshot(context);

    const promptInput: CareerAdvisorPromptInput = { question: dto.question, context };

    const result = await this.aiOrchestrationService.execute({
      userId: targetUserId,
      feature: AIFeature.CAREER_ADVISOR,
      input: promptInput,
      idempotencyKey: `career-advisor:${targetUserId}:${randomUUID()}`,
      options: {
        responseFormat: 'json',
        responseValidator: (generateResult) => {
          CareerAdvisorResponseParser.parse(generateResult.text);
        },
      },
    });

    const parsed = CareerAdvisorResponseParser.parse(result.text);

    return this.repository.create(targetUserId, {
      question: dto.question,
      summary: parsed.summary,
      currentAssessment: parsed.currentAssessment,
      strengths: parsed.strengths,
      gaps: parsed.gaps,
      recommendations: parsed.recommendations,
      nextSteps: parsed.nextSteps,
      contextSnapshot: snapshot,
      creditsUsed: result.creditsCharged,
      aiRequestId: result.aiRequestId,
    });
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<CareerAdvice[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<CareerAdvice> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const advice = await this.repository.findById(id);
    if (!advice || advice.userId !== targetUserId) {
      throw new NotFoundException('Career advice not found.');
    }
    return advice;
  }

  /**
   * Gathers every optional data source in the brief's exact priority order.
   * Every read is independently optional — a user with none of this data
   * still gets a fully valid, all-empty context, never a thrown error.
   * ResumeSectionsService.list() throws NotFoundException when no
   * MasterResume exists, so sections are only fetched when one does.
   */
  private async buildContext(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<CareerAdviceContext> {
    const [
      profile,
      masterResume,
      jobTargets,
      resumeVariants,
      applications,
      atsReports,
      interviewSessions,
    ] = await Promise.all([
      this.profileService.getForUser(requestingUser, targetUserId),
      this.masterResumeService.getForUser(requestingUser, targetUserId),
      this.jobTargetService.list(requestingUser, targetUserId),
      this.resumeVariantService.list(requestingUser, targetUserId),
      this.applicationService.list(requestingUser, targetUserId),
      this.atsReportRepository.findAllByUserId(targetUserId),
      this.interviewService.list(requestingUser, targetUserId),
    ]);

    const [workExperience, education, skills] = masterResume
      ? await Promise.all([
          this.resumeSectionsService.list('work-experience', requestingUser, targetUserId),
          this.resumeSectionsService.list('education', requestingUser, targetUserId),
          this.resumeSectionsService.list('skills', requestingUser, targetUserId),
        ])
      : [[], [], []];

    const jobTargetTitleById = new Map(jobTargets.map((jt) => [jt.id, jt.title]));

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
            completionPercentage: masterResume.completionPercentage,
          }
        : null,
      // SectionRecord's index signature is `unknown` — these three section
      // types' own field shapes (WorkExperience/Education/Skill in
      // prisma/schema.prisma) are stable and well known, so a direct cast
      // here is the same trade-off ResumeSectionsRepository itself already
      // makes for generic per-section dispatch.
      workExperience: workExperience.map((w) => ({
        position: w.position as string,
        company: w.company as string,
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
      jobTargets: jobTargets.map((jt) => ({
        title: jt.title,
        company: jt.company,
        status: jt.status,
      })),
      resumeVariants: resumeVariants.map((v) => ({ title: v.title })),
      applications: applications.map((a) => ({
        jobTargetTitle: jobTargetTitleById.get(a.jobTargetId) ?? '(job target)',
        status: a.status,
      })),
      atsReports: atsReports.map((r) => ({
        overallScore: r.overallScore,
        missingKeywordsCount: r.missingKeywords.length,
      })),
      interviewSessions: interviewSessions.map((s) => ({
        mode: s.mode,
        type: s.type,
        difficulty: s.difficulty,
      })),
    };
  }

  private buildContextSnapshot(context: CareerAdviceContext): CareerAdviceContextSnapshot {
    return {
      hasProfile: context.profile !== null,
      hasMasterResume: context.masterResume !== null,
      workExperienceCount: context.workExperience.length,
      educationCount: context.education.length,
      skillsCount: context.skills.length,
      jobTargetsCount: context.jobTargets.length,
      resumeVariantsCount: context.resumeVariants.length,
      applicationsCount: context.applications.length,
      atsReportsCount: context.atsReports.length,
      interviewSessionsCount: context.interviewSessions.length,
    };
  }
}
