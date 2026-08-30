import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import { LinkedInResponseParser } from './linkedin-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('LinkedInResponseParser', () => {
  const validPayload = {
    headline: 'Senior Backend Engineer | TypeScript, Node.js, Distributed Systems',
    about: 'Backend engineer with 6+ years of experience building scalable APIs.',
    skills: ['TypeScript', 'Node.js'],
    experienceSuggestions: ['Led backend team, cutting latency by 40%.'],
    recommendations: ['Add a profile photo to improve visibility.'],
  };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = LinkedInResponseParser.parse(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it('trims whitespace from string fields and array items', () => {
    const result = LinkedInResponseParser.parse(
      JSON.stringify({ ...validPayload, headline: '  H  ', skills: ['  S  '] }),
    );
    expect(result.headline).toBe('H');
    expect(result.skills).toEqual(['S']);
  });

  it('accepts empty arrays for skills/experienceSuggestions/recommendations (sparse-data case)', () => {
    const result = LinkedInResponseParser.parse(
      JSON.stringify({
        ...validPayload,
        skills: [],
        experienceSuggestions: [],
        recommendations: [],
      }),
    );
    expect(result.skills).toEqual([]);
    expect(result.experienceSuggestions).toEqual([]);
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => LinkedInResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when headline is missing or empty', () => {
    expect(() =>
      LinkedInResponseParser.parse(JSON.stringify(omit(validPayload, 'headline'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      LinkedInResponseParser.parse(JSON.stringify({ ...validPayload, headline: '   ' })),
    ).toThrow(InvalidPromptError);
  });

  it('throws when about is missing or empty', () => {
    expect(() => LinkedInResponseParser.parse(JSON.stringify(omit(validPayload, 'about')))).toThrow(
      InvalidPromptError,
    );
  });

  it.each(['skills', 'experienceSuggestions', 'recommendations'] as const)(
    'throws when "%s" is missing or not an array',
    (field) => {
      expect(() => LinkedInResponseParser.parse(JSON.stringify(omit(validPayload, field)))).toThrow(
        InvalidPromptError,
      );
      expect(() =>
        LinkedInResponseParser.parse(JSON.stringify({ ...validPayload, [field]: 'not an array' })),
      ).toThrow(InvalidPromptError);
    },
  );

  it('throws when an array field contains a non-string or empty-string item', () => {
    expect(() =>
      LinkedInResponseParser.parse(JSON.stringify({ ...validPayload, skills: [123] })),
    ).toThrow(InvalidPromptError);
    expect(() =>
      LinkedInResponseParser.parse(JSON.stringify({ ...validPayload, recommendations: [''] })),
    ).toThrow(InvalidPromptError);
  });
});
