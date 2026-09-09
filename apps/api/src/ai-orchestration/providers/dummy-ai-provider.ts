import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type {
  AIProvider,
  CostEstimate,
  GenerateRequest,
  GenerateResult,
  ProviderHealthStatus,
  StreamChunk,
} from '../interfaces/ai-provider.interface';
import { extractArrayCount } from '../prompt/array-count-instruction.util';
import { extractEntityIds } from '../prompt/entity-id-extraction.util';

const QUESTION_CATEGORIES = [
  'BEHAVIORAL',
  'TECHNICAL',
  'SITUATIONAL',
  'CULTURE',
  'LEADERSHIP',
  'COMMUNICATION',
] as const;

const SUPPORTED_MODELS = ['dummy-v1', 'dummy-v1-fast'] as const;
/** Fake, fixed per-token rate for deterministic cost estimates — never a real provider's pricing. */
const DUMMY_COST_PER_TOKEN = 0.000001;

/**
 * The sole registered AIProvider in this phase. Never calls any external
 * API — every response is derived deterministically from the input prompt
 * via a SHA-256 digest, so the same prompt always produces the same
 * response, token counts, and cost estimate (required for deterministic
 * tests, per this phase's brief). Mirrors the disclosed-placeholder pattern
 * already established by MpesaBillingProvider (Phase 5): real behavior,
 * zero real external calls.
 */
@Injectable()
export class DummyAIProvider implements AIProvider {
  readonly name = 'dummy';

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const model = request.model ?? SUPPORTED_MODELS[0];
    const text =
      request.responseFormat === 'json'
        ? this.buildDeterministicJson(request.prompt)
        : this.buildDeterministicText(request.prompt);
    const inputTokens = await this.countTokens(request.prompt);
    const outputTokens = await this.countTokens(text);

    return {
      text,
      provider: this.name,
      model,
      tokenUsage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      finishReason: 'stop',
      requestId: `dummy-${this.hash(request.prompt).slice(0, 16)}`,
    };
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamChunk> {
    const result = await this.generate(request);
    const words = result.text.split(' ');
    for (const word of words) {
      yield { delta: `${word} `, done: false };
    }
    yield { delta: '', done: true };
  }

  async health(): Promise<ProviderHealthStatus> {
    return { provider: this.name, available: true, checkedAt: new Date() };
  }

  async countTokens(text: string): Promise<number> {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async estimateCost(request: GenerateRequest): Promise<CostEstimate> {
    const model = request.model ?? SUPPORTED_MODELS[0];
    const inputTokens = await this.countTokens(request.prompt);
    const outputTokens = request.maxTokens ?? inputTokens;
    const totalTokens = inputTokens + outputTokens;

    return {
      provider: this.name,
      model,
      estimatedCost: Number((totalTokens * DUMMY_COST_PER_TOKEN).toFixed(6)),
      currency: 'USD',
      tokenUsage: { inputTokens, outputTokens, totalTokens },
    };
  }

  supportedModels(): string[] {
    return [...SUPPORTED_MODELS];
  }

  private buildDeterministicText(prompt: string): string {
    return `[DUMMY AI RESPONSE ${this.hash(prompt).slice(0, 12)}] This is a deterministic placeholder response for testing. No external AI provider was called.`;
  }

  /**
   * A generic, deterministic, syntactically valid JSON object — not aware of
   * any specific feature's schema. It is a superset envelope broad enough to
   * satisfy every simple JSON-mode feature's contract at once (Resume
   * Optimization's `summary`/`predictedScore`/`suggestions`, Cover Letter's
   * `title`/`coverLetter`/`summary`, Interview Preparation's `questions`/
   * `evaluations` — Phase 9's two array fields are sized dynamically via
   * `extractArrayCount()`, Career Advisor's `currentAssessment`/`strengths`/
   * `gaps`/`recommendations`/`nextSteps` — FASE 18, LinkedIn's `headline`/
   * `about`/`skills`/`experienceSuggestions` — FASE 19, ATS AI's
   * `overallAssessment`/`priorityIssues`/`contentRecommendations`/
   * `sectionRecommendations`/`actionPlan` — FASE 20, Template
   * Recommendation's `templateRecommendations` — FASE 21, sourced from real
   * ids found in the prompt itself via `extractEntityIds()` rather than
   * fabricated, CV Import AI's `fieldSuggestions`/`unresolvedFields` — FASE
   * 22, sourced from the prompt's own embedded `ELIGIBLE_FIELDS_JSON` block
   * (see `extractCvImportEligibleFields()`) so every dummy suggestion
   * targets a real, already-extracted field instead of being rejected by
   * `validateCvImportAiSuggestions()` — deliberately named `fieldSuggestions`,
   * not `suggestions`, to avoid colliding with Resume Optimization's own
   * differently-shaped `suggestions` field in this same envelope, everything
   * else stays
   * fixed-shape), so DummyAIProvider never needs to learn which feature is
   * asking — each feature's own response parser reads only the fields it
   * cares about and ignores the rest.
   */
  private buildDeterministicJson(prompt: string): string {
    const hash = this.hash(prompt);
    const predictedScore = 60 + (parseInt(hash.slice(0, 2), 16) % 40);
    const n = extractArrayCount(prompt);
    const questions = Array.from({ length: n }, (_, i) => ({
      category: QUESTION_CATEGORIES[i % QUESTION_CATEGORIES.length],
      question: `Deterministic dummy question ${i + 1} (hash ${hash.slice(0, 8)}).`,
      idealAnswer: `Deterministic dummy ideal answer ${i + 1}.`,
      tips: `Deterministic dummy tip ${i + 1}.`,
    }));
    const evaluations = Array.from({ length: n }, (_, i) => {
      const byteHex = hash.slice((i * 2) % 60, ((i * 2) % 60) + 2) || hash.slice(0, 2);
      return {
        score: 60 + (parseInt(byteHex, 16) % 40),
        feedback: `Deterministic dummy feedback ${i + 1} (hash ${hash.slice(0, 8)}).`,
        strengths: [`Deterministic strength ${i + 1}`],
        improvements: [`Deterministic improvement ${i + 1}`],
      };
    });
    // FASE 20 — ATS AI's AtsAiRecommendation[] shape, reused across
    // priorityIssues/contentRecommendations/sectionRecommendations.
    const dummyRecommendations = Array.from({ length: n }, (_, i) => ({
      priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][i % 4],
      category: `Deterministic dummy category ${i + 1}`,
      explanation: `Deterministic dummy explanation ${i + 1} (hash ${hash.slice(0, 8)}).`,
      recommendation: `Deterministic dummy recommendation ${i + 1} (hash ${hash.slice(0, 8)}).`,
    }));
    const payload = {
      title: `Application for this role (dummy, hash ${hash.slice(0, 12)})`,
      coverLetter: `Dear Hiring Manager,\n\nThis is a deterministic placeholder cover letter (hash ${hash.slice(0, 12)}) generated for testing. No external AI provider was called.\n\nSincerely,\nThe Candidate`,
      summary: `Deterministic dummy optimization summary (hash ${hash.slice(0, 12)}).`,
      predictedScore,
      suggestions: [
        {
          type: 'GENERAL',
          section: 'summary',
          priority: 'MEDIUM',
          title: 'Deterministic dummy suggestion',
          reason:
            'Placeholder reasoning generated deterministically for testing — no real AI provider was called.',
          originalText: '',
          suggestedText: `Deterministic dummy suggested text (hash ${hash.slice(0, 12)}).`,
        },
      ],
      questions,
      evaluations,
      // FASE 18 — Career Advisor's ParsedCareerAdviceResponse shape.
      currentAssessment: `Deterministic dummy current assessment (hash ${hash.slice(0, 12)}).`,
      strengths: [`Deterministic dummy strength (hash ${hash.slice(0, 8)}).`],
      gaps: [`Deterministic dummy gap (hash ${hash.slice(0, 8)}).`],
      recommendations: [`Deterministic dummy recommendation (hash ${hash.slice(0, 8)}).`],
      nextSteps: [`Deterministic dummy next step (hash ${hash.slice(0, 8)}).`],
      // FASE 19 — LinkedIn's ParsedLinkedInProfileResponse shape. `recommendations`
      // above is reused as-is (already a string[], same field name/shape).
      headline: `Deterministic dummy headline (hash ${hash.slice(0, 12)}).`,
      about: `Deterministic dummy About section (hash ${hash.slice(0, 12)}).`,
      skills: [`Deterministic dummy skill (hash ${hash.slice(0, 8)}).`],
      experienceSuggestions: [
        `Deterministic dummy experience suggestion (hash ${hash.slice(0, 8)}).`,
      ],
      // FASE 20 — ATS AI's ParsedAtsAiResponse shape. `strengths` above is
      // reused as-is (already a string[], same field name/shape).
      overallAssessment: `Deterministic dummy overall assessment (hash ${hash.slice(0, 12)}).`,
      priorityIssues: dummyRecommendations,
      contentRecommendations: dummyRecommendations,
      sectionRecommendations: dummyRecommendations,
      actionPlan: [`Deterministic dummy action step (hash ${hash.slice(0, 8)}).`],
      // FASE 21 — Template Recommendation's ParsedTemplateRecommendationResponse
      // shape. `summary` above is reused as-is. Unlike every other field in
      // this envelope, `templateId` MUST be a real, already-existing id —
      // extractEntityIds() pulls the real ids straight out of the prompt's
      // own embedded template catalog (see
      // TemplateRecommendationPromptBuilder) — ResumeTemplate.id is a
      // stable slug, never a random uuid, so this reads the literal
      // `"id": "..."` JSON pairs rather than assuming any particular id
      // format — so the dummy response actually passes
      // TemplateRecommendationService's real-catalog validation instead of
      // being rejected outright.
      templateRecommendations: extractEntityIds(prompt, 5).map((templateId, i) => ({
        templateId,
        rank: i + 1,
        score:
          60 +
          (parseInt(hash.slice((i * 2) % 60, ((i * 2) % 60) + 2) || hash.slice(0, 2), 16) % 40),
        reason: `Deterministic dummy reason ${i + 1} (hash ${hash.slice(0, 8)}).`,
      })),
      // FASE 22 — CV Import AI's ParsedCvImportAiResponse shape. Every
      // suggestion targets a real, already-extracted field pulled straight
      // out of the prompt's own embedded ELIGIBLE_FIELDS_JSON block (see
      // extractCvImportEligibleFields()) — never a fabricated field — so the
      // dummy response actually passes CvImportService's real-field
      // validation instead of every suggestion being dropped.
      fieldSuggestions: this.extractCvImportEligibleFields(prompt)
        .slice(0, 3)
        .map((eligible, i) => ({
          section: eligible.section,
          index: eligible.index,
          field: eligible.field,
          originalValue: eligible.originalValue,
          suggestedValue: `${eligible.originalValue} (revisão sugerida, hash ${hash.slice(0, 6)})`,
          reason: `Deterministic dummy revision reason ${i + 1} (hash ${hash.slice(0, 8)}).`,
          confidence:
            0.6 + (parseInt(hash.slice(i * 2, i * 2 + 2) || hash.slice(0, 2), 16) % 30) / 100,
        })),
      unresolvedFields: [`Deterministic dummy unresolved field note (hash ${hash.slice(0, 8)}).`],
    };
    return JSON.stringify(payload);
  }

  /**
   * FASE 22 — scrapes the literal `ELIGIBLE_FIELDS_JSON: [...]` marker
   * `CvImportPromptBuilder` embeds in its own prompt (see
   * `buildEligibleFields()`/`cv-import-ai-validator.ts`) — the exact same
   * "read a JSON blob the feature's own PromptBuilder already computed and
   * embedded" philosophy `extractEntityIds()` established for Template
   * Recommendation (FASE 21), applied to a richer per-field shape instead of
   * a flat id list. Returns an empty array (never throws) when the marker is
   * absent — a prompt from any OTHER feature simply won't contain it.
   */
  private extractCvImportEligibleFields(
    prompt: string,
  ): Array<{ section: string; index?: number; field: string; originalValue: string }> {
    const match = prompt.match(/ELIGIBLE_FIELDS_JSON:\s*(\[[\s\S]*?\])\n/);
    if (!match?.[1]) return [];
    try {
      const parsed: unknown = JSON.parse(match[1]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
}
