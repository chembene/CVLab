import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { LinkedInPromptBuilder } from './linkedin-prompt-builder';
import type { LinkedInProfileContext } from '../interfaces/linkedin-profile-context.interface';

describe('LinkedInPromptBuilder', () => {
  const builder = new LinkedInPromptBuilder();

  const emptyContext: LinkedInProfileContext = {
    profile: null,
    masterResume: null,
    workExperience: [],
    education: [],
    skills: [],
    jobTargets: [],
  };

  const richContext: LinkedInProfileContext = {
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
    },
    workExperience: [
      {
        position: 'Backend Engineer',
        company: 'Acme Corp',
        description: 'Led the backend team.',
        achievements: ['Cut latency by 40%'],
        currentlyWorking: true,
      },
    ],
    education: [{ degree: 'BSc', institution: 'UEM', field: 'Computer Science' }],
    skills: [{ name: 'TypeScript', level: 'ADVANCED' }],
    jobTargets: [{ title: 'Staff Engineer', company: 'Globex' }],
  };

  it('declares itself for the LINKEDIN feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.LINKEDIN);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders every available context section, the target role, and the desired JSON schema', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { targetRole: 'Staff Engineer', context: richContext },
    });

    expect(result.text).toContain('Staff Engineer');
    expect(result.text).toContain('Ana Machel');
    expect(result.text).toContain('Backend Engineer');
    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Acme Corp');
    expect(result.text).toContain('Cut latency by 40%');
    expect(result.text).toContain('UEM');
    expect(result.text).toContain('TypeScript');
    expect(result.text).toContain('Globex');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"headline"');
    expect(result.text).toContain('"experienceSuggestions"');
  });

  it('never fabricates a section header for missing data, and explicitly says the target role was not specified', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { targetRole: null, context: emptyContext },
    });

    expect(result.text).toContain('(not specified — infer a sensible target');
    expect(result.text).toContain('(none — the candidate has not filled in any profile');
    expect(result.text).not.toContain('### 1. Professional profile');
    expect(result.text).not.toContain('### 3. Professional experience');
  });

  it('instructs the model never to invent facts and to acknowledge sparse data', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { targetRole: null, context: emptyContext },
    });
    expect(result.text.toLowerCase()).toContain('never invent facts');
    expect(result.text.toLowerCase()).toContain('sparse or missing');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const input = { targetRole: 'Staff Engineer', context: richContext };
    const first = builder.build({ userId: 'user-1', input });
    const second = builder.build({ userId: 'user-1', input });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the target role changes', () => {
    const a = builder.build({
      userId: 'user-1',
      input: { targetRole: 'Role A', context: emptyContext },
    });
    const b = builder.build({
      userId: 'user-1',
      input: { targetRole: 'Role B', context: emptyContext },
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
