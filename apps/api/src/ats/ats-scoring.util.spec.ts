import {
  ATS_SCORE_WEIGHTS,
  calculateOverallScore,
  compareKeywords,
  compareLanguages,
  compareSkills,
  detectDuplicateSkills,
  detectEmptySections,
  detectFormattingProblems,
  generateRecommendations,
  inferMinYearsFromSeniority,
  scoreEducation,
  scoreExperience,
  scoreFormatting,
} from './ats-scoring.util';

describe('ATS_SCORE_WEIGHTS', () => {
  it('sums to 1 (100%) so calculateOverallScore never silently over/under-weighs', () => {
    const total = Object.values(ATS_SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('calculateOverallScore', () => {
  it('returns 100 when every sub-score is 100', () => {
    const perfect = {
      keywordScore: 100,
      skillsScore: 100,
      experienceScore: 100,
      educationScore: 100,
      languageScore: 100,
      formattingScore: 100,
      completionScore: 100,
    };
    expect(calculateOverallScore(perfect)).toBe(100);
  });

  it('returns 0 when every sub-score is 0', () => {
    const zero = {
      keywordScore: 0,
      skillsScore: 0,
      experienceScore: 0,
      educationScore: 0,
      languageScore: 0,
      formattingScore: 0,
      completionScore: 0,
    };
    expect(calculateOverallScore(zero)).toBe(0);
  });

  it('weighs keyword score at 30% — a keyword-only difference moves the overall score by 0.3x', () => {
    const base = {
      keywordScore: 0,
      skillsScore: 100,
      experienceScore: 100,
      educationScore: 100,
      languageScore: 100,
      formattingScore: 100,
      completionScore: 100,
    };
    // 70 (fixed) + 0*0.3 = 70
    expect(calculateOverallScore(base)).toBe(70);
  });
});

describe('compareKeywords', () => {
  it('scores 100 with no matched/missing when the job target has no keywords', () => {
    expect(compareKeywords([], 'anything')).toEqual({ score: 100, matched: [], missing: [] });
  });

  it('matches case-insensitively against the searchable text', () => {
    const result = compareKeywords(
      ['Power BI', 'Kubernetes'],
      'experienced with power bi dashboards',
    );
    expect(result.matched).toEqual(['Power BI']);
    expect(result.missing).toEqual(['Kubernetes']);
    expect(result.score).toBe(50);
  });

  it('scores 0 when nothing matches', () => {
    expect(compareKeywords(['Rust'], 'typescript and go').score).toBe(0);
  });
});

describe('compareSkills', () => {
  it('scores 100 with no matched/missing when the job target requires no skills', () => {
    expect(compareSkills([], ['TypeScript'])).toEqual({
      score: 100,
      matchedSkills: [],
      missingSkills: [],
    });
  });

  it('weighs required skills double compared to optional ones', () => {
    const result = compareSkills(
      [
        { skill: 'TypeScript', required: true },
        { skill: 'GraphQL', required: false },
      ],
      ['TypeScript'],
    );
    // earned 2 (required match) of total 3 (2 required + 1 optional) -> 67%
    expect(result.score).toBe(67);
    expect(result.matchedSkills).toEqual(['TypeScript']);
    expect(result.missingSkills).toEqual(['GraphQL']);
  });

  it('matches case-insensitively', () => {
    const result = compareSkills([{ skill: 'typescript', required: true }], ['TypeScript']);
    expect(result.score).toBe(100);
  });
});

describe('scoreEducation', () => {
  it('scores 0 with no education entries', () => {
    expect(scoreEducation({})).toBe(0);
    expect(scoreEducation({ educations: [] })).toBe(0);
  });

  it('scores 70 with exactly one entry', () => {
    expect(scoreEducation({ educations: [{}] })).toBe(70);
  });

  it('scores 100 with two or more entries', () => {
    expect(scoreEducation({ educations: [{}, {}] })).toBe(100);
  });
});

describe('compareLanguages', () => {
  it('scores 100 when the job target requires no languages', () => {
    expect(compareLanguages([], [])).toBe(100);
  });

  it('scores proportionally to matched languages', () => {
    expect(compareLanguages([{ language: 'English' }, { language: 'French' }], ['english'])).toBe(
      50,
    );
  });
});

describe('inferMinYearsFromSeniority', () => {
  it('returns null for empty/unrecognized seniority', () => {
    expect(inferMinYearsFromSeniority(null)).toBeNull();
    expect(inferMinYearsFromSeniority(undefined)).toBeNull();
    expect(inferMinYearsFromSeniority('Astronaut')).toBeNull();
  });

  it('recognizes senior-level keywords', () => {
    expect(inferMinYearsFromSeniority('Senior Backend Engineer')).toBe(5);
    expect(inferMinYearsFromSeniority('Tech Lead')).toBe(5);
  });

  it('recognizes mid-level keywords', () => {
    expect(inferMinYearsFromSeniority('Mid-level')).toBe(2);
  });

  it('recognizes junior-level keywords', () => {
    expect(inferMinYearsFromSeniority('Junior Developer')).toBe(0);
  });
});

describe('scoreExperience', () => {
  it('with no inferable requirement: full score if any work experience exists, partial otherwise', () => {
    expect(scoreExperience(null, 0, 2)).toBe(100);
    expect(scoreExperience(null, 0, 0)).toBe(40);
  });

  it('with an explicit 0-year (junior) requirement: always full score', () => {
    expect(scoreExperience(0, 0, 0)).toBe(100);
  });

  it('with a real requirement: full score once met, proportional below it', () => {
    expect(scoreExperience(5, 5, 3)).toBe(100);
    expect(scoreExperience(5, 10, 3)).toBe(100);
    expect(scoreExperience(5, 2, 3)).toBe(40);
    expect(scoreExperience(5, 0, 0)).toBe(0);
  });
});

describe('detectDuplicateSkills', () => {
  it('finds case-insensitive duplicates', () => {
    expect(detectDuplicateSkills(['TypeScript', 'Go', 'typescript'])).toEqual(['typescript']);
  });

  it('returns an empty array when there are no duplicates', () => {
    expect(detectDuplicateSkills(['TypeScript', 'Go'])).toEqual([]);
  });

  it('ignores empty strings', () => {
    expect(detectDuplicateSkills(['', ''])).toEqual([]);
  });
});

describe('detectFormattingProblems', () => {
  it('flags a summary shorter than 40 characters', () => {
    const issues = detectFormattingProblems({ summary: 'Too short' });
    expect(issues).toContainEqual({
      code: 'summary_too_short',
      message: 'Your Summary is too short.',
    });
  });

  it('does not flag a summary of 40+ characters', () => {
    const issues = detectFormattingProblems({ summary: 'A'.repeat(40) });
    expect(issues.find((i) => i.code === 'summary_too_short')).toBeUndefined();
  });

  it('flags work experience with no description or achievements', () => {
    const issues = detectFormattingProblems({
      summary: 'A'.repeat(40),
      workExperiences: [{ company: 'Acme', position: 'Engineer' }],
    });
    expect(issues).toContainEqual({
      code: 'missing_achievements',
      message: 'Add measurable achievements.',
    });
  });

  it('does not flag work experience when at least one entry has achievements or a description', () => {
    const issues = detectFormattingProblems({
      summary: 'A'.repeat(40),
      workExperiences: [{ company: 'Acme', achievements: ['Shipped X'] }],
    });
    expect(issues.find((i) => i.code === 'missing_achievements')).toBeUndefined();
  });

  it('flags duplicate skills, one issue per duplicate', () => {
    const issues = detectFormattingProblems({
      summary: 'A'.repeat(40),
      skills: [{ name: 'TypeScript' }, { name: 'typescript' }],
    });
    expect(issues).toContainEqual({
      code: 'duplicate_skill',
      message: "Remove the duplicate skill 'typescript'.",
    });
  });

  it('returns no issues for well-formed content', () => {
    const issues = detectFormattingProblems({
      summary: 'A'.repeat(40),
      workExperiences: [{ company: 'Acme', description: 'Led the backend team.' }],
      skills: [{ name: 'TypeScript' }, { name: 'Go' }],
    });
    expect(issues).toEqual([]);
  });
});

describe('scoreFormatting', () => {
  it('scores 100 with no issues', () => {
    expect(scoreFormatting([])).toBe(100);
  });

  it('deducts 20 per issue, floored at 0', () => {
    const issue = { code: 'x', message: 'x' };
    expect(scoreFormatting([issue])).toBe(80);
    expect(scoreFormatting([issue, issue, issue, issue, issue, issue])).toBe(0);
  });
});

describe('detectEmptySections', () => {
  it('lists every major section that is empty or absent', () => {
    expect(detectEmptySections({})).toEqual([
      'Work Experience',
      'Education',
      'Skills',
      'Languages',
      'Certifications',
    ]);
  });

  it('omits sections that have at least one entry', () => {
    expect(
      detectEmptySections({ skills: [{ name: 'Go' }], educations: [{ institution: 'MIT' }] }),
    ).toEqual(['Work Experience', 'Languages', 'Certifications']);
  });
});

describe('generateRecommendations', () => {
  it('generates one keyword recommendation per missing keyword, capped at 5', () => {
    const recs = generateRecommendations({
      missingKeywords: ['A', 'B', 'C', 'D', 'E', 'F'],
      missingSkills: [],
      formattingIssues: [],
      emptySections: [],
      experienceScore: 100,
    });
    const keywordRecs = recs.filter((r) => r.startsWith('Include the keyword'));
    expect(keywordRecs).toHaveLength(5);
    expect(keywordRecs[0]).toBe("Include the keyword 'A' in your experience.");
  });

  it('includes formatting issue messages verbatim', () => {
    const recs = generateRecommendations({
      missingKeywords: [],
      missingSkills: [],
      formattingIssues: [{ code: 'summary_too_short', message: 'Your Summary is too short.' }],
      emptySections: [],
      experienceScore: 100,
    });
    expect(recs).toContain('Your Summary is too short.');
  });

  it('includes "Complete your X section." for each empty section', () => {
    const recs = generateRecommendations({
      missingKeywords: [],
      missingSkills: [],
      formattingIssues: [],
      emptySections: ['Certifications'],
      experienceScore: 100,
    });
    expect(recs).toContain('Complete your Certifications section.');
  });

  it('includes "Add the skill" for each missing skill, capped at 5', () => {
    const recs = generateRecommendations({
      missingKeywords: [],
      missingSkills: ['Docker'],
      formattingIssues: [],
      emptySections: [],
      experienceScore: 100,
    });
    expect(recs).toContain("Add the skill 'Docker' to your resume.");
  });

  it('adds an experience-shortfall note only when experienceScore is below 100', () => {
    const withShortfall = generateRecommendations({
      missingKeywords: [],
      missingSkills: [],
      formattingIssues: [],
      emptySections: [],
      experienceScore: 50,
    });
    expect(withShortfall).toContain(
      "You may need more experience for this role's seniority level.",
    );

    const withoutShortfall = generateRecommendations({
      missingKeywords: [],
      missingSkills: [],
      formattingIssues: [],
      emptySections: [],
      experienceScore: 100,
    });
    expect(withoutShortfall).not.toContain(
      "You may need more experience for this role's seniority level.",
    );
  });

  it('returns an empty array when everything is perfect', () => {
    expect(
      generateRecommendations({
        missingKeywords: [],
        missingSkills: [],
        formattingIssues: [],
        emptySections: [],
        experienceScore: 100,
      }),
    ).toEqual([]);
  });
});
