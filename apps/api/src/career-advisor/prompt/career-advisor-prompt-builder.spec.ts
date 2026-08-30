import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { CareerAdvisorPromptBuilder } from './career-advisor-prompt-builder';
import type { CareerAdviceContext } from '../interfaces/career-advice-context.interface';

describe('CareerAdvisorPromptBuilder', () => {
  const builder = new CareerAdvisorPromptBuilder();

  const emptyContext: CareerAdviceContext = {
    profile: null,
    masterResume: null,
    workExperience: [],
    education: [],
    skills: [],
    jobTargets: [],
    resumeVariants: [],
    applications: [],
    atsReports: [],
    interviewSessions: [],
  };

  const richContext: CareerAdviceContext = {
    profile: {
      firstName: 'Ana',
      lastName: 'Machel',
      headline: 'Backend Engineer',
      city: 'Maputo',
      country: 'Mozambique',
    },
    masterResume: {
      title: 'Senior Backend Engineer',
      summary: 'Builds scalable APIs.',
      careerLevel: 'SENIOR',
      yearsExperience: 6,
      desiredPosition: 'Staff Engineer',
      completionPercentage: 80,
    },
    workExperience: [
      { position: 'Backend Engineer', company: 'Acme Corp', currentlyWorking: true },
    ],
    education: [{ degree: 'BSc', institution: 'UEM', field: 'Computer Science' }],
    skills: [{ name: 'TypeScript', level: 'ADVANCED' }],
    jobTargets: [{ title: 'Staff Engineer', company: 'Globex', status: 'READY' }],
    resumeVariants: [{ title: 'Globex Variant' }],
    applications: [{ jobTargetTitle: 'Staff Engineer', status: 'APPLIED' }],
    atsReports: [{ overallScore: 72, missingKeywordsCount: 3 }],
    interviewSessions: [{ mode: 'JOB', type: 'TECHNICAL', difficulty: 'HARD' }],
  };

  it('declares itself for the CAREER_ADVISOR feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.CAREER_ADVISOR);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders every available context section, the question, and the desired JSON schema', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { question: 'What should I focus on next?', context: richContext },
    });

    expect(result.text).toContain('What should I focus on next?');
    expect(result.text).toContain('Ana Machel');
    expect(result.text).toContain('Backend Engineer');
    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Acme Corp');
    expect(result.text).toContain('UEM');
    expect(result.text).toContain('TypeScript');
    expect(result.text).toContain('Globex');
    expect(result.text).toContain('Globex Variant');
    expect(result.text).toContain('APPLIED');
    expect(result.text).toContain('72/100');
    expect(result.text).toContain('TECHNICAL');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"currentAssessment"');
    expect(result.text).toContain('"nextSteps"');
  });

  it('never fabricates a section header for missing data, and explicitly says none is available', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { question: 'How can I improve my profile?', context: emptyContext },
    });

    expect(result.text).toContain('(none — the candidate has not filled in any profile');
    expect(result.text).not.toContain('### 1. Professional profile');
    expect(result.text).not.toContain('### 3. Professional experience');
    expect(result.text).toContain('How can I improve my profile?');
  });

  it('instructs the model never to invent facts and to acknowledge sparse data', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { question: 'Q', context: emptyContext },
    });
    expect(result.text.toLowerCase()).toContain('never invent facts');
    expect(result.text.toLowerCase()).toContain('sparse or missing');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const input = { question: 'Same question', context: richContext };
    const first = builder.build({ userId: 'user-1', input });
    const second = builder.build({ userId: 'user-1', input });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the question changes', () => {
    const a = builder.build({
      userId: 'user-1',
      input: { question: 'Question A', context: emptyContext },
    });
    const b = builder.build({
      userId: 'user-1',
      input: { question: 'Question B', context: emptyContext },
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
