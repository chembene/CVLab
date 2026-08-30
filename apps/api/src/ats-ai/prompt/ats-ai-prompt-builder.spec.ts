import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { AtsAiPromptBuilder } from './ats-ai-prompt-builder';
import type { AtsAiContext } from '../interfaces/ats-ai-context.interface';

describe('AtsAiPromptBuilder', () => {
  const builder = new AtsAiPromptBuilder();

  const context: AtsAiContext = {
    atsReport: {
      overallScore: 62,
      keywordScore: 55,
      skillsScore: 70,
      experienceScore: 60,
      educationScore: 80,
      languageScore: 90,
      formattingScore: 65,
      completionScore: 75,
      matchedKeywords: ['TypeScript'],
      missingKeywords: ['Kubernetes'],
      recommendedSkills: ['Docker'],
      recommendations: ['Add more quantified achievements.'],
    },
    jobTarget: {
      title: 'Senior Backend Engineer',
      company: 'Acme Corp',
      seniority: 'Senior',
      keywords: ['Kubernetes', 'TypeScript'],
      skills: ['Docker', 'TypeScript'],
      languages: ['English'],
    },
    resume: { title: 'My Resume' },
  };

  it('declares itself for the ATS_AI feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.ATS_AI);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders the resume title, job target, deterministic ATS report data, and the desired JSON schema', () => {
    const result = builder.build({ userId: 'user-1', input: { context } });

    expect(result.text).toContain('My Resume');
    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Acme Corp');
    expect(result.text).toContain('62/100');
    expect(result.text).toContain('TypeScript');
    expect(result.text).toContain('Kubernetes');
    expect(result.text).toContain('Docker');
    expect(result.text).toContain('Add more quantified achievements.');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"overallAssessment"');
    expect(result.text).toContain('"priorityIssues"');
    expect(result.text).toContain('"actionPlan"');
  });

  it('instructs the model never to recompute the deterministic scores', () => {
    const result = builder.build({ userId: 'user-1', input: { context } });
    expect(result.text.toLowerCase()).toContain('never recompute');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const first = builder.build({ userId: 'user-1', input: { context } });
    const second = builder.build({ userId: 'user-1', input: { context } });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the ATS report score changes', () => {
    const a = builder.build({ userId: 'user-1', input: { context } });
    const b = builder.build({
      userId: 'user-1',
      input: { context: { ...context, atsReport: { ...context.atsReport, overallScore: 90 } } },
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
