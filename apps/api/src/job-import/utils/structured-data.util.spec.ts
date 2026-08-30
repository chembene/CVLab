import {
  extractHtmlTitle,
  extractJsonLdJobPosting,
  extractOpenGraph,
  stripHtmlToText,
} from './structured-data.util';

describe('structured-data.util', () => {
  describe('extractJsonLdJobPosting', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": "Senior Backend Engineer",
        "hiringOrganization": { "@type": "Organization", "name": "Acme Corp" },
        "jobLocation": { "@type": "Place", "address": { "addressLocality": "Maputo", "addressCountry": "MZ" } },
        "employmentType": "FULL_TIME",
        "description": "<p>Build things.</p>",
        "baseSalary": { "@type": "MonetaryAmount", "currency": "USD", "value": { "@type": "QuantitativeValue", "minValue": 80000, "maxValue": 120000 } }
      }
      </script>
      </head><body></body></html>
    `;

    it('extracts a JobPosting from a JSON-LD script block', () => {
      const posting = extractJsonLdJobPosting(html);
      expect(posting?.title).toBe('Senior Backend Engineer');
      expect(posting?.companyName).toBe('Acme Corp');
      expect(posting?.locationText).toBe('Maputo, MZ');
      expect(posting?.salaryMin).toBe(80000);
      expect(posting?.salaryMax).toBe(120000);
      expect(posting?.currency).toBe('USD');
    });

    it('finds a JobPosting nested inside an @graph array', () => {
      const graphHtml = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"JobPosting","title":"Data Analyst"}]}</script>`;
      expect(extractJsonLdJobPosting(graphHtml)?.title).toBe('Data Analyst');
    });

    it('returns undefined when no JSON-LD JobPosting is present', () => {
      expect(
        extractJsonLdJobPosting('<html><body>no structured data</body></html>'),
      ).toBeUndefined();
    });

    it('skips malformed JSON-LD blocks without throwing', () => {
      const broken = '<script type="application/ld+json">{not valid json</script>';
      expect(() => extractJsonLdJobPosting(broken)).not.toThrow();
      expect(extractJsonLdJobPosting(broken)).toBeUndefined();
    });
  });

  describe('extractOpenGraph', () => {
    it('reads og:title/description/site_name meta tags', () => {
      const html =
        '<meta property="og:title" content="Backend Engineer"/><meta property="og:description" content="Great role"/><meta property="og:site_name" content="Acme"/>';
      expect(extractOpenGraph(html)).toEqual({
        title: 'Backend Engineer',
        description: 'Great role',
        siteName: 'Acme',
      });
    });
  });

  describe('extractHtmlTitle', () => {
    it('reads the <title> tag', () => {
      expect(extractHtmlTitle('<title>Job at Acme</title>')).toBe('Job at Acme');
    });
  });

  describe('stripHtmlToText', () => {
    it('strips tags, decodes entities, and preserves line breaks between block elements', () => {
      const text = stripHtmlToText('<p>Hello &amp; welcome</p><p>Second line</p>');
      expect(text).toContain('Hello & welcome');
      expect(text).toContain('Second line');
    });

    it('removes script/style content entirely', () => {
      const text = stripHtmlToText('<script>evil()</script><p>Safe text</p><style>.x{}</style>');
      expect(text).not.toContain('evil()');
      expect(text).toContain('Safe text');
    });
  });
});
