import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import { CoverLetterResponseParser } from './cover-letter-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('CoverLetterResponseParser', () => {
  const validPayload = {
    title: 'Cover Letter — Senior Backend Engineer',
    coverLetter: 'Dear Hiring Manager, ... Sincerely, Candidate.',
    summary: 'Emphasizes backend leadership experience.',
  };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = CoverLetterResponseParser.parse(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it('trims whitespace from every field', () => {
    const result = CoverLetterResponseParser.parse(
      JSON.stringify({ title: '  T  ', coverLetter: '  C  ', summary: '  S  ' }),
    );
    expect(result).toEqual({ title: 'T', coverLetter: 'C', summary: 'S' });
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => CoverLetterResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when title is missing or empty', () => {
    expect(() =>
      CoverLetterResponseParser.parse(JSON.stringify(omit(validPayload, 'title'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      CoverLetterResponseParser.parse(JSON.stringify({ ...validPayload, title: '   ' })),
    ).toThrow(InvalidPromptError);
  });

  it('throws when coverLetter is missing, empty, or not a string', () => {
    expect(() =>
      CoverLetterResponseParser.parse(JSON.stringify(omit(validPayload, 'coverLetter'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      CoverLetterResponseParser.parse(JSON.stringify({ ...validPayload, coverLetter: 123 })),
    ).toThrow(InvalidPromptError);
  });

  it('throws when summary is missing or empty', () => {
    expect(() =>
      CoverLetterResponseParser.parse(JSON.stringify(omit(validPayload, 'summary'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      CoverLetterResponseParser.parse(JSON.stringify({ ...validPayload, summary: '' })),
    ).toThrow(InvalidPromptError);
  });
});
