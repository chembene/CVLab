import { extractEntityIds } from './entity-id-extraction.util';

describe('extractEntityIds', () => {
  it('extracts every "id" JSON field value from the prompt, in first-seen order', () => {
    const prompt = `## Catalog\n${JSON.stringify([
      { id: 'modern', name: 'Modern' },
      { id: 'ats-classic', name: 'ATS Classic' },
    ])}`;
    expect(extractEntityIds(prompt)).toEqual(['modern', 'ats-classic']);
  });

  it('works regardless of whether the id is a slug or a uuid', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const prompt = JSON.stringify([{ id: 'modern' }, { id: uuid }]);
    expect(extractEntityIds(prompt)).toEqual(['modern', uuid]);
  });

  it('deduplicates repeated ids', () => {
    const prompt = `${JSON.stringify({ id: 'modern' })} appears twice: ${JSON.stringify({ id: 'modern' })}`;
    expect(extractEntityIds(prompt)).toEqual(['modern']);
  });

  it('caps the result at `max`', () => {
    const prompt = JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: `tpl-${i}` })));
    expect(extractEntityIds(prompt, 2)).toHaveLength(2);
  });

  it('returns an empty array when the prompt has no "id" fields', () => {
    expect(extractEntityIds('No ids here at all.')).toEqual([]);
  });

  it('ignores unrelated fields that are not literally named "id"', () => {
    const prompt = JSON.stringify({
      templateId: 'should-not-match',
      jobTargetId: 'should-not-match-either',
    });
    expect(extractEntityIds(prompt)).toEqual([]);
  });
});
