import { ResumeSuggestionApplier, type SuggestionToApply } from './resume-suggestion-applier';

describe('ResumeSuggestionApplier', () => {
  function baseContent() {
    return {
      summary: 'Old summary.',
      workExperiences: [{ company: 'Acme', description: 'Led backend team.' }],
      skills: [{ name: 'TypeScript' }],
      projects: [],
      educations: [{ institution: 'MIT', description: 'BSc Computer Science' }],
      languages: [{ language: 'English' }],
      certificates: [],
      awards: [],
      // A field never touched by any suggestion in these tests.
      yearsExperience: 6,
    };
  }

  it('replaces the summary field for a "summary" section suggestion', () => {
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'summary',
      originalText: 'Old summary.',
      suggestedText: 'New, sharper summary.',
    };

    const { updatedContent, appliedSuggestionIds, skippedSuggestionIds } =
      ResumeSuggestionApplier.apply(baseContent(), [suggestion]);

    expect(updatedContent.summary).toBe('New, sharper summary.');
    expect(appliedSuggestionIds).toEqual(['s1']);
    expect(skippedSuggestionIds).toEqual([]);
  });

  it('replaces a matching entry inside an array section, leaving other entries untouched', () => {
    const content = {
      ...baseContent(),
      workExperiences: [
        { company: 'Acme', description: 'Led backend team.' },
        { company: 'Globex', description: 'Maintained legacy systems.' },
      ],
    };
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'experience',
      originalText: 'Led backend team.',
      suggestedText: 'Led a team of 8 backend engineers shipping weekly releases.',
    };

    const { updatedContent } = ResumeSuggestionApplier.apply(content, [suggestion]);

    const experiences = updatedContent.workExperiences as Array<Record<string, unknown>>;
    expect(experiences[0]!.description).toBe(
      'Led a team of 8 backend engineers shipping weekly releases.',
    );
    expect(experiences[0]!.company).toBe('Acme');
    expect(experiences[1]).toEqual({
      company: 'Globex',
      description: 'Maintained legacy systems.',
    });
  });

  it('appends a new entry when originalText does not match anything in the section', () => {
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'skills',
      originalText: '',
      suggestedText: 'Kubernetes',
    };

    const { updatedContent, appliedSuggestionIds } = ResumeSuggestionApplier.apply(baseContent(), [
      suggestion,
    ]);

    const skills = updatedContent.skills as Array<Record<string, unknown>>;
    expect(skills).toHaveLength(2);
    expect(skills[0]).toEqual({ name: 'TypeScript' });
    expect(skills[1]).toEqual({ name: 'Kubernetes' });
    expect(appliedSuggestionIds).toEqual(['s1']);
  });

  it('appends a new entry into an empty array section', () => {
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'projects',
      originalText: '',
      suggestedText: 'Built an internal analytics dashboard.',
    };

    const { updatedContent } = ResumeSuggestionApplier.apply(baseContent(), [suggestion]);

    expect(updatedContent.projects).toEqual([
      { description: 'Built an internal analytics dashboard.' },
    ]);
  });

  it('skips (does not apply) a suggestion targeting an unsupported section', () => {
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'hobbies', // not one of the 8 supported sections
      originalText: '',
      suggestedText: 'Chess',
    };

    const { updatedContent, appliedSuggestionIds, skippedSuggestionIds } =
      ResumeSuggestionApplier.apply(baseContent(), [suggestion]);

    expect(skippedSuggestionIds).toEqual(['s1']);
    expect(appliedSuggestionIds).toEqual([]);
    expect(updatedContent).toEqual(baseContent());
  });

  it('never mutates the caller-supplied content object', () => {
    const content = baseContent();
    const frozenCopy = JSON.parse(JSON.stringify(content));
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'summary',
      originalText: 'Old summary.',
      suggestedText: 'Changed.',
    };

    ResumeSuggestionApplier.apply(content, [suggestion]);

    expect(content).toEqual(frozenCopy);
  });

  it('never touches a section with no corresponding accepted suggestion', () => {
    const content = baseContent();
    const suggestion: SuggestionToApply = {
      id: 's1',
      section: 'summary',
      originalText: 'Old summary.',
      suggestedText: 'Changed.',
    };

    const { updatedContent } = ResumeSuggestionApplier.apply(content, [suggestion]);

    expect(updatedContent.workExperiences).toEqual(content.workExperiences);
    expect(updatedContent.skills).toEqual(content.skills);
    expect(updatedContent.educations).toEqual(content.educations);
    expect(updatedContent.languages).toEqual(content.languages);
    expect(updatedContent.yearsExperience).toBe(6);
  });

  it('applies multiple suggestions across different sections in one call', () => {
    const suggestions: SuggestionToApply[] = [
      { id: 's1', section: 'summary', originalText: 'Old summary.', suggestedText: 'New summary.' },
      { id: 's2', section: 'languages', originalText: 'English', suggestedText: 'Fluent English' },
      { id: 's3', section: 'certifications', originalText: '', suggestedText: 'AWS Certified' },
    ];

    const { updatedContent, appliedSuggestionIds } = ResumeSuggestionApplier.apply(
      baseContent(),
      suggestions,
    );

    expect(updatedContent.summary).toBe('New summary.');
    expect(updatedContent.languages).toEqual([{ language: 'Fluent English' }]);
    expect(updatedContent.certificates).toEqual([{ title: 'AWS Certified' }]);
    expect(appliedSuggestionIds).toEqual(['s1', 's2', 's3']);
  });
});
