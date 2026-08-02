import { Injectable, NotImplementedException } from '@nestjs/common';

export interface AtsCalculationResult {
  atsScore: number;
  keywordsMatched: string[];
  keywordsMissing: string[];
}

/**
 * Stub surface for the AI-driven Job Target operations that ship in a later
 * phase (ATS scoring, resume suggestions, cover letter generation — see
 * prompts/14-development-roadmap.md Phases 6-8, and job_target_analysis in
 * prisma/schema.prisma). Every method throws NotImplementedException; this
 * class exists only so the *shape* of these future calls is fixed now — the
 * future AI module codes against a stable interface instead of one invented
 * ad hoc later. No route calls this service in Phase 2B.
 *
 * Deliberately a Service, not a Repository: prompts/01-coding-standards.md
 * reserves repositories for database operations only ("Repositories: Only
 * database operations"), and these four methods are business/AI-
 * orchestration operations, not data access — so they live one layer up
 * from where the Phase 2B brief's literal wording ("Repository interfaces")
 * placed them. Documented here as a deliberate, disclosed deviation.
 */
@Injectable()
export class JobTargetAnalysisService {
  // async (rather than a bare synchronous throw) so every method
  // consistently returns a rejected Promise matching its Promise<T> return
  // type — callers can always `await`/`.catch()` uniformly instead of
  // needing a try/catch for some calls and a .catch() for others.
  async extractKeywords(_jobDescription: string): Promise<string[]> {
    throw new NotImplementedException('Keyword extraction is not implemented yet.');
  }

  async calculateATS(_jobTargetId: string): Promise<AtsCalculationResult> {
    throw new NotImplementedException('ATS scoring is not implemented yet.');
  }

  async generateResumeSuggestions(_jobTargetId: string): Promise<string[]> {
    throw new NotImplementedException('Resume suggestion generation is not implemented yet.');
  }

  async generateCoverLetter(_jobTargetId: string): Promise<string> {
    throw new NotImplementedException('Cover letter generation is not implemented yet.');
  }
}
