import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import {
  TemplateRecommendationPromptBuilder,
  MAX_RECOMMENDATIONS,
} from './template-recommendation-prompt-builder';
import type { TemplateRecommendationContext } from '../interfaces/template-recommendation-context.interface';

describe('TemplateRecommendationPromptBuilder', () => {
  const builder = new TemplateRecommendationPromptBuilder();

  const emptyContext: TemplateRecommendationContext = {
    masterResume: null,
    workExperienceCount: 0,
    educationCount: 0,
    skillsCount: 0,
    languages: [],
    resumeVariant: null,
    jobTarget: null,
    availableTemplates: [
      {
        id: 'tpl-1',
        name: 'Classic',
        category: 'ATS_CLASSIC',
        isATSFriendly: true,
        premium: false,
      },
    ],
  };

  const richContext: TemplateRecommendationContext = {
    masterResume: {
      title: 'Senior Backend Engineer',
      summary: 'Builds scalable APIs.',
      careerLevel: 'SENIOR',
      yearsExperience: 6,
      desiredPosition: 'Staff Engineer',
    },
    workExperienceCount: 3,
    educationCount: 1,
    skillsCount: 8,
    languages: ['English', 'Portuguese'],
    resumeVariant: { title: 'Tailored for Globex' },
    jobTarget: {
      title: 'Staff Engineer',
      company: 'Globex',
      seniority: 'Senior',
      employmentType: 'FULL_TIME',
    },
    availableTemplates: [
      {
        id: 'tpl-1',
        name: 'Classic',
        category: 'ATS_CLASSIC',
        isATSFriendly: true,
        premium: false,
      },
      {
        id: 'tpl-2',
        name: 'Developer Dark',
        category: 'DEVELOPER',
        isATSFriendly: true,
        premium: true,
      },
    ],
  };

  it('declares itself for the TEMPLATE_RECOMMENDATION feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.TEMPLATE_RECOMMENDATION);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders the candidate context, the full template catalog with real ids, and the desired JSON schema', () => {
    const result = builder.build({ userId: 'user-1', input: { context: richContext } });

    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Staff Engineer');
    expect(result.text).toContain('Globex');
    expect(result.text).toContain('Tailored for Globex');
    expect(result.text).toContain('English');
    expect(result.text).toContain('tpl-1');
    expect(result.text).toContain('tpl-2');
    expect(result.text).toContain('DEVELOPER');
    expect(result.text).toContain(`up to ${MAX_RECOMMENDATIONS}`);
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"templateRecommendations"');
    expect(result.text).toContain('"templateId"');
  });

  it('instructs the model to only ever return an id copied verbatim from the catalog', () => {
    const result = builder.build({ userId: 'user-1', input: { context: richContext } });
    expect(result.text.toLowerCase()).toContain('never invent, guess, or slightly-modify an id');
  });

  it('never fabricates a candidate-profile section for missing data, and says so explicitly', () => {
    const result = builder.build({ userId: 'user-1', input: { context: emptyContext } });
    expect(result.text).toContain('(none available — the candidate has not filled in any profile');
    expect(result.text).not.toContain('Senior Backend Engineer');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const first = builder.build({ userId: 'user-1', input: { context: richContext } });
    const second = builder.build({ userId: 'user-1', input: { context: richContext } });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the available template catalog changes', () => {
    const a = builder.build({ userId: 'user-1', input: { context: emptyContext } });
    const b = builder.build({
      userId: 'user-1',
      input: { context: { ...emptyContext, availableTemplates: [] } },
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
