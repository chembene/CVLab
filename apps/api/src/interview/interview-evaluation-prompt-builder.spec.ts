import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import {
  InterviewEvaluationPromptBuilder,
  JobInterviewEvaluationPromptBuilder,
  RoleInterviewEvaluationPromptBuilder,
} from './interview-evaluation-prompt-builder';
import type { InterviewAnswerToEvaluate } from './interview-evaluation-prompt-builder';

describe('InterviewEvaluationPromptBuilder', () => {
  const builder = new InterviewEvaluationPromptBuilder();

  const items: InterviewAnswerToEvaluate[] = [
    {
      order: 1,
      category: 'TECHNICAL',
      question: 'Explain a rate limiter design.',
      idealAnswer: 'Token bucket or sliding window.',
      answer: 'I would use a token bucket algorithm.',
    },
    {
      order: 2,
      category: 'BEHAVIORAL',
      question: 'Tell me about a conflict.',
      idealAnswer: 'STAR-format example.',
      answer: 'Once I disagreed with a teammate about architecture.',
    },
  ];

  it('declares itself for the INTERVIEW_EVALUATION feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.INTERVIEW_EVALUATION);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders every question/idealAnswer/answer triple, numbered, plus the desired JSON schema', () => {
    const result = builder.build({ userId: 'user-1', input: { language: 'en', items } });

    expect(result.text).toContain('1. Category: TECHNICAL');
    expect(result.text).toContain('Explain a rate limiter design.');
    expect(result.text).toContain('Token bucket or sliding window.');
    expect(result.text).toContain('I would use a token bucket algorithm.');
    expect(result.text).toContain('2. Category: BEHAVIORAL');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"strengths"');
    expect(result.text).toContain('"improvements"');
    expect(result.text).toContain('Respond with an array of exactly 2 items.');
  });

  it('mentions the requested response language', () => {
    const result = builder.build({ userId: 'user-1', input: { language: 'pt-MZ', items } });
    expect(result.text).toContain('Respond in pt-MZ.');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const input = { language: 'en', items };
    const first = builder.build({ userId: 'user-1', input });
    const second = builder.build({ userId: 'user-1', input });
    expect(first.hash).toBe(second.hash);
  });

  it('produces a different hash and count instruction when the number of items changes', () => {
    const a = builder.build({ userId: 'user-1', input: { language: 'en', items } });
    const b = builder.build({ userId: 'user-1', input: { language: 'en', items: [items[0]!] } });
    expect(a.hash).not.toBe(b.hash);
    expect(b.text).toContain('Respond with an array of exactly 1 item.');
  });
});

/** FASE 11 — Modes JOB/ROLE reuse the exact same rendering; only the AIFeature key (and price) differs. */
describe('JobInterviewEvaluationPromptBuilder / RoleInterviewEvaluationPromptBuilder', () => {
  const items: InterviewAnswerToEvaluate[] = [
    {
      order: 1,
      category: 'TECHNICAL',
      question: 'How would you design a rate limiter?',
      idealAnswer: 'Token bucket or sliding window.',
      answer: 'I would use a token bucket algorithm.',
    },
  ];

  it('JobInterviewEvaluationPromptBuilder declares itself for INTERVIEW_EVALUATION_JOB and renders identically to RESUME', () => {
    const jobBuilder = new JobInterviewEvaluationPromptBuilder();
    const resumeBuilder = new InterviewEvaluationPromptBuilder();
    const input = { language: 'en', items };

    expect(jobBuilder.metadata.feature).toBe(AIFeature.INTERVIEW_EVALUATION_JOB);
    expect(jobBuilder.build({ userId: 'user-1', input }).text).toBe(
      resumeBuilder.build({ userId: 'user-1', input }).text,
    );
  });

  it('RoleInterviewEvaluationPromptBuilder declares itself for INTERVIEW_EVALUATION_ROLE and renders identically to RESUME', () => {
    const roleBuilder = new RoleInterviewEvaluationPromptBuilder();
    const resumeBuilder = new InterviewEvaluationPromptBuilder();
    const input = { language: 'pt-MZ', items };

    expect(roleBuilder.metadata.feature).toBe(AIFeature.INTERVIEW_EVALUATION_ROLE);
    expect(roleBuilder.build({ userId: 'user-1', input }).text).toBe(
      resumeBuilder.build({ userId: 'user-1', input }).text,
    );
  });
});
