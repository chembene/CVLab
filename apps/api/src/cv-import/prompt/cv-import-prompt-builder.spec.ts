import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { CvImportPromptBuilder } from './cv-import-prompt-builder';
import type { ExtractedCvData } from '../interfaces/extracted-cv-data.interface';

describe('CvImportPromptBuilder', () => {
  const builder = new CvImportPromptBuilder();

  const data: ExtractedCvData = {
    personalData: { fullName: 'Maria Sitoe', email: 'maria@example.com' },
    summary: 'Experienced engineer.',
    workExperiences: [
      {
        company: 'TechCorp',
        position: 'Engineer',
        startDate: '2020-01-01',
        currentlyWorking: true,
      },
    ],
    educations: [{ institution: 'UEM', degree: 'BSc' }],
    skills: [{ name: 'TypeScript' }],
    languages: [],
    certificates: [],
    projects: [],
    awards: [],
    volunteerExperiences: [],
    references: [],
  };

  it('declares itself for the CV_IMPORT feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.CV_IMPORT);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders the personal data, sections, and the desired JSON schema (fieldSuggestions, not suggestions)', () => {
    const result = builder.build({ userId: 'user-1', input: { data } });

    expect(result.text).toContain('Maria Sitoe');
    expect(result.text).toContain('TechCorp');
    expect(result.text).toContain('Engineer');
    expect(result.text).toContain('UEM');
    expect(result.text).toContain('TypeScript');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"fieldSuggestions"');
    expect(result.text).toContain('"unresolvedFields"');
    // Never the colliding Resume Optimization field name as its own top-level key.
    expect(result.text).not.toMatch(/"suggestions":\s*\[/);
  });

  it('embeds an ELIGIBLE_FIELDS_JSON block listing every already-extracted, non-empty field', () => {
    const result = builder.build({ userId: 'user-1', input: { data } });
    expect(result.text).toContain('ELIGIBLE_FIELDS_JSON:');

    const match = result.text.match(/ELIGIBLE_FIELDS_JSON:\s*(\[[\s\S]*?\])\n/);
    expect(match).not.toBeNull();
    const eligible = JSON.parse(match![1]!);
    expect(eligible).toEqual(
      expect.arrayContaining([
        { section: 'personalData', field: 'fullName', originalValue: 'Maria Sitoe' },
        {
          section: 'workExperiences',
          index: 0,
          field: 'company',
          originalValue: 'TechCorp',
        },
      ]),
    );
  });

  it('never lists an empty/undefined field as eligible', () => {
    const result = builder.build({ userId: 'user-1', input: { data } });
    const match = result.text.match(/ELIGIBLE_FIELDS_JSON:\s*(\[[\s\S]*?\])\n/);
    const eligible = JSON.parse(match![1]!) as { field: string }[];
    expect(eligible.some((f) => f.field === 'location')).toBe(false); // workExperiences[0].location is absent
  });

  it('instructs the model to never invent facts', () => {
    const result = builder.build({ userId: 'user-1', input: { data } });
    expect(result.text.toLowerCase()).toContain('never invent');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const first = builder.build({ userId: 'user-1', input: { data } });
    const second = builder.build({ userId: 'user-1', input: { data } });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the draft changes', () => {
    const a = builder.build({ userId: 'user-1', input: { data } });
    const b = builder.build({
      userId: 'user-1',
      input: { data: { ...data, summary: 'A different summary.' } },
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
