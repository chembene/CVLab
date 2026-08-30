import { GenericHtmlParser } from './generic-html.parser';

describe('GenericHtmlParser', () => {
  const parser = new GenericHtmlParser();

  it('always claims to handle any hostname', () => {
    expect(parser.canHandle()).toBe(true);
  });

  it('extracts a full job posting from JSON-LD structured data', () => {
    const html = `
      <html><head>
      <meta property="og:image" content="https://acme.example.com/social.png"/>
      <script type="application/ld+json">
      {
        "@type": "JobPosting",
        "title": "Senior Backend Engineer",
        "hiringOrganization": { "name": "Acme Corp", "logo": "https://acme.example.com/logo.png" },
        "jobLocation": { "address": { "addressLocality": "Maputo" } },
        "employmentType": "FULL_TIME",
        "description": "<p>Build APIs.</p><p>Responsibilities</p><p>Ship features</p><p>Requirements</p><p>5+ years TypeScript and PostgreSQL experience. Bachelor's degree required.</p><p>Benefits</p><p>Health insurance</p>",
        "baseSalary": { "currency": "USD", "value": { "minValue": 80000, "maxValue": 120000, "unitText": "YEAR" } }
      }
      </script>
      </head></html>
    `;

    const { data, confidence } = parser.parse(html, 'https://example.com/jobs/1');

    expect(data.title).toBe('Senior Backend Engineer');
    expect(data.company).toBe('Acme Corp');
    expect(data.companyLogoUrl).toBe('https://acme.example.com/social.png'); // og:image wins priority
    expect(data.location).toBe('Maputo');
    expect(data.employmentType).toBe('Full Time');
    expect(data.seniority).toBe('Senior');
    expect(data.requirements.join(' ')).toContain('TypeScript');
    expect(data.skills).toContain('TypeScript');
    expect(data.technologies).toContain('PostgreSQL');
    expect(data.skills).not.toContain('PostgreSQL');
    expect(data.benefits).toEqual(expect.arrayContaining(['Health insurance']));
    expect(data.salaryMin).toBe(80000);
    expect(data.salaryMax).toBe(120000);
    expect(data.salaryPeriod).toBe('YEARLY');
    expect(data.experienceMinYears).toBe(5);
    expect(data.educationLevel).toBe('Bachelor');
    expect(confidence.title).toBeGreaterThanOrEqual(0.8);
    expect(confidence.company).toBeGreaterThanOrEqual(0.8);
    expect(confidence.companyLogoUrl).toBeGreaterThan(0);
  });

  it('falls back to Open Graph tags when there is no JSON-LD', () => {
    const html =
      '<meta property="og:title" content="Data Analyst"/><meta property="og:description" content="Analyze data. Responsibilities. Build dashboards."/><meta property="og:site_name" content="Acme"/>';
    const { data, confidence } = parser.parse(html, 'https://example.com/jobs/2');

    expect(data.title).toBe('Data Analyst');
    expect(data.company).toBe('Acme');
    expect(confidence.title).toBeLessThan(0.8);
  });

  it('falls back to a favicon-service logo URL when nothing else is available', () => {
    const { data } = parser.parse(
      '<html><body>Some job page with no metadata.</body></html>',
      'https://example.com/jobs/3',
    );
    expect(data.companyLogoUrl).toContain('google.com/s2/favicons');
    expect(data.companyLogoUrl).toContain('example.com');
  });

  it('produces low overall confidence for a page with no structured data at all', () => {
    const { confidence } = parser.parse(
      '<html><body>Some job page with no metadata.</body></html>',
      'https://example.com/jobs/3',
    );
    expect(confidence.title).toBeUndefined();
    expect(confidence.company).toBeUndefined();
  });

  it('detects a remote work arrangement from free text when schema.org employmentType is absent', () => {
    const { data } = parser.parse(
      '<meta property="og:title" content="Support Engineer"/><meta property="og:description" content="This is a fully remote position."/>',
      'https://example.com/jobs/4',
    );
    expect(data.employmentType).toBe('Remote');
  });
});
