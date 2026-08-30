import { GreenhouseParser } from './greenhouse.parser';

describe('GreenhouseParser', () => {
  const parser = new GreenhouseParser();

  it('handles greenhouse.io hostnames only', () => {
    expect(parser.canHandle('boards.greenhouse.io')).toBe(true);
    expect(parser.canHandle('jobs.lever.co')).toBe(false);
  });

  it('falls back to the URL path slug for company when JSON-LD/OG omit it', () => {
    const html = '<title>Backend Engineer</title>';
    const { data, confidence } = parser.parse(
      html,
      'https://boards.greenhouse.io/acme-corp/jobs/123',
    );

    expect(data.company).toBe('Acme Corp');
    expect(confidence.company).toBeLessThan(0.5);
  });

  it('prefers JSON-LD company over the URL fallback', () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","hiringOrganization":{"name":"Real Co"}}</script>`;
    const { data, confidence } = parser.parse(
      html,
      'https://boards.greenhouse.io/acme-corp/jobs/123',
    );

    expect(data.company).toBe('Real Co');
    expect(confidence.company).toBeGreaterThanOrEqual(0.8);
  });
});
