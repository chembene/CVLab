import { CVParser, normalizeEntityName } from './cv-parser';

describe('CVParser', () => {
  let parser: CVParser;

  beforeEach(() => {
    parser = new CVParser();
  });

  const SAMPLE_CV = [
    'Maria Fernanda Sitoe',
    'maria.sitoe@example.com',
    '+258 84 123 4567',
    'linkedin.com/in/maria-sitoe',
    'github.com/mariasitoe',
    '',
    'Resumo',
    'Engenheira de software com 5 anos de experiencia em backend.',
    '',
    'Experiencia Profissional',
    'Engenheira de Software - TechCorp',
    'Jan 2020 - presente',
    'Liderou o desenvolvimento da plataforma de pagamentos.',
    '',
    'Formacao Academica',
    'Universidade Eduardo Mondlane - Licenciatura em Informatica',
    '2015 - 2019',
    '',
    'Competencias',
    'TypeScript, Node.js, PostgreSQL, Docker',
    '',
    'Idiomas',
    'Portugues (Nativo), Ingles (Avancado)',
  ].join('\n');

  describe('parse', () => {
    it('extracts contact details with high confidence via regex', () => {
      const { data, confidence } = parser.parse(SAMPLE_CV);

      expect(data.personalData.email).toBe('maria.sitoe@example.com');
      expect(data.personalData.phone).toContain('84');
      expect(data.personalData.linkedin).toContain('linkedin.com/in/maria-sitoe');
      expect(data.personalData.github).toContain('github.com/mariasitoe');
      expect(confidence['personalData.email']).toBeGreaterThanOrEqual(0.9);
      expect(confidence['personalData.linkedin']).toBeGreaterThanOrEqual(0.9);
    });

    it('does not truncate a multi-level domain like ".co.mz" (Mozambique — the platform\'s initial market)', () => {
      const cv = ['Maria Sitoe', 'maria.sitoe@empresa.co.mz', 'Resumo', 'Engenheira.'].join('\n');
      const { data } = parser.parse(cv);

      expect(data.personalData.email).toBe('maria.sitoe@empresa.co.mz');
    });

    it('extracts a plausible full name from the first lines', () => {
      const { data } = parser.parse(SAMPLE_CV);
      expect(data.personalData.fullName).toBe('Maria Fernanda Sitoe');
    });

    it('splits career sections by PT header keywords', () => {
      const { data } = parser.parse(SAMPLE_CV);

      expect(data.summary).toContain('Engenheira de software');
      expect(data.workExperiences.length).toBeGreaterThan(0);
      expect(data.educations.length).toBeGreaterThan(0);
      expect(data.skills.map((s) => s.name)).toEqual(
        expect.arrayContaining(['TypeScript', 'Node.js', 'PostgreSQL', 'Docker']),
      );
      expect(data.languages.map((l) => l.language)).toEqual(
        expect.arrayContaining(['Portugues', 'Ingles']),
      );
    });

    it('parses a "current" date range into currentlyWorking=true with no endDate', () => {
      const { data } = parser.parse(SAMPLE_CV);
      const experience = data.workExperiences[0];
      expect(experience?.currentlyWorking).toBe(true);
      expect(experience?.endDate).toBeUndefined();
      expect(experience?.startDate).toBe('2020-01-01');
    });

    it('assigns lower confidence to AI-free heuristic sections than to regex-matched contact fields', () => {
      const { confidence } = parser.parse(SAMPLE_CV);
      expect(confidence['personalData.email']).toBeGreaterThan(confidence.workExperiences ?? 0);
    });

    it('returns empty arrays (not throwing) for a CV with no recognizable sections', () => {
      const { data, confidence } = parser.parse(
        'John Doe\njohn@example.com\nSome unstructured text.',
      );
      expect(data.workExperiences).toEqual([]);
      expect(data.educations).toEqual([]);
      expect(confidence.workExperiences).toBeUndefined();
    });

    it('throws when the document has no extractable text at all', () => {
      expect(() => parser.parse('   \n  \n')).toThrow();
    });

    it('recognizes a section header decorated with a leading number/bullet/icon', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        '1. Experiência Profissional',
        'Engenheira de Software - TechCorp',
        'Jan 2020 - presente',
        'Liderou o desenvolvimento da plataforma.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.workExperiences.length).toBeGreaterThan(0);
    });

    it('recognizes "Professional Summary" (not just bare "Summary")', () => {
      const cv = [
        'John Doe',
        'john@example.com',
        'Professional Summary',
        'Backend engineer with 5 years of experience.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.summary).toContain('Backend engineer');
    });

    it('does not misread a long sentence merely mentioning a keyword as a section header', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Resumo',
        'Comprometida com a minha educação e desenvolvimento profissional contínuo ao longo da carreira.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.summary).toContain('educação e desenvolvimento');
      expect(data.educations).toEqual([]);
    });

    it('does not misread a SHORT job title merely containing a keyword as a section header (FASE 3 audit regression)', () => {
      // "Gestora de Projetos" (Project Manager) is a real, common PT job
      // title that contains the "projetos" keyword — the pre-fix substring
      // fallback (any line <=35 chars containing a keyword) misread this
      // exact title line as a new "Projects" header, losing the whole
      // experience entry.
      const cv = [
        'Ana Chissano',
        'ana@example.com',
        'Experiência Profissional',
        'Gestora de Projetos - Acme Lda',
        '2019 - 2022',
        'Liderou equipas multidisciplinares em projetos internacionais.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.position).toBe('Gestora de Projetos');
      expect(data.workExperiences[0]?.company).toBe('Acme Lda');
      expect(data.projects).toEqual([]);
    });

    it('recovers dated experience/education entries via the fallback when their headers go unrecognized entirely', () => {
      // No line here matches any SECTION_HEADERS keyword — simulates a
      // header styled as a non-extractable graphic (common in templated
      // PDFs) or worded in a way the dictionary doesn't cover.
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Engenheira de Software - TechCorp',
        'Jan 2020 - Dez 2022',
        'Liderou o desenvolvimento da plataforma de pagamentos.',
        'Universidade Eduardo Mondlane - Licenciatura em Informática',
        '2015 - 2019',
      ].join('\n');
      const { data, confidence } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.company).toBe('TechCorp');
      expect(data.educations.length).toBe(1);
      expect(data.educations[0]?.institution).toContain('Universidade Eduardo Mondlane');
      // Fallback-recovered entries are flagged with a visibly lower confidence than a normal header match.
      expect(confidence.workExperiences).toBeLessThan(0.5);
      expect(confidence.educations).toBeLessThan(0.5);
    });

    it('does not fabricate experience/education from unclaimed lines that have no date range', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Just some stray text with no headers or dates at all.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.workExperiences).toEqual([]);
      expect(data.educations).toEqual([]);
    });

    it('splits short one-line-bullet-per-achievement entries into separate jobs, not one merged entry', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Experiência Profissional',
        'Gestora de Marketing - TechCorp',
        'Jan 2021 - Presente',
        'Liderei uma equipa de 5 pessoas.',
        'Aumentei o ROI em 30%.',
        'Analista de Marketing - Acme SA',
        'Mar 2018 - Dez 2020',
        'Executei campanhas de SEO.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(2);
      expect(data.workExperiences[0]?.position).toBe('Gestora de Marketing');
      expect(data.workExperiences[0]?.company).toBe('TechCorp');
      expect(data.workExperiences[1]?.position).toBe('Analista de Marketing');
      expect(data.workExperiences[1]?.company).toBe('Acme SA');
      // The second job's title/dates must not have leaked into the first job's description.
      expect(data.workExperiences[0]?.description).not.toContain('Analista de Marketing');
    });

    it('recognizes a letter-spaced section header ("E X P E R I Ê N C I A   P R O F I S S I O N A L")', () => {
      // Reproduces a real, confirmed failure: PDFs with wide letter-spacing
      // on section headers extract as individually-spaced letters, which
      // never matched the header dictionary before collapseLetterSpacing().
      const cv = [
        'Joana Nhantumbo',
        'joana@example.com',
        'E X P E R I Ê N C I A   P R O F I S S I O N A L',
        'Analista de RH - Acme Lda',
        'Jan 2020 - Dez 2022',
        'Geriu processos de recrutamento.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.position).toBe('Analista de RH');
      expect(data.workExperiences[0]?.company).toBe('Acme Lda');
    });

    it('never collapses normal short-word lines/acronyms that merely happen to have several 1-char-looking tokens', () => {
      const cv = [
        'Joana Nhantumbo',
        'joana@example.com',
        'Resumo',
        'DOM BOSCO (ISDB) é uma instituição de ensino.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.summary).toContain('DOM BOSCO (ISDB)');
    });

    it('parses the "date + company" on line 1, real title on line 2 format (real-world confirmed)', () => {
      // A common CV layout: the date range and employer share the opening
      // line, and the job title is on its own line right after — the
      // original one-line-only splitter put the company name into
      // `position` and buried the real title inside `description`.
      const cv = [
        'Joana Nhantumbo',
        'joana@example.com',
        'Experiência Profissional',
        '2022-2024 Acme Corporation',
        'GESTORA ADMINISTRATIVA',
        '2019 - 2021',
        'Beta Consultoria, Lda',
        'ASSISTENTE ADMINISTRATIVA',
        'Apoio administrativo geral.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(2);
      expect(data.workExperiences[0]?.position).toBe('GESTORA ADMINISTRATIVA');
      expect(data.workExperiences[0]?.company).toBe('Acme Corporation');
      expect(data.workExperiences[0]?.startDate).toBe('2022-01-01');
      expect(data.workExperiences[1]?.position).toBe('ASSISTENTE ADMINISTRATIVA');
      expect(data.workExperiences[1]?.company).toBe('Beta Consultoria, Lda');
    });

    it('recognizes a "date + company" opening line as its own new entry, even when a digit leads the line (real-CV-confirmed)', () => {
      // A digit-led "2018 - 2019 Beta Consultoria, Lda" line can never
      // satisfy isShortCapitalizedNonSentence (it doesn't start with a
      // letter), so the only way it gets to open a new chunk is the
      // dedicated "date-led entry line" signal in chunkEntries(). Without
      // it, this line silently gets absorbed as trailing description of
      // the PREVIOUS entry, and the real title that follows ends up an
      // entry with no company at all — exactly what happened on a real
      // user's CV (the 3rd job's company was lost this way).
      const cv = [
        'Joana Nhantumbo',
        'joana@example.com',
        'Experiência Profissional',
        '2022-2024 Acme Corporation',
        'GESTORA ADMINISTRATIVA',
        '2018 - 2019 Beta Consultoria, Lda',
        'ASSISTENTE ADMINISTRATIVA',
        'Apoio administrativo geral.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(2);
      expect(data.workExperiences[1]?.position).toBe('ASSISTENTE ADMINISTRATIVA');
      expect(data.workExperiences[1]?.company).toBe('Beta Consultoria, Lda');
    });

    it('recovers a company name whose "date + company" line was split across two lines from the date (real-CV-confirmed)', () => {
      // The exact real-CV shape that first surfaced this bug: the date sits
      // alone on one line, then the company alone on the next (no date on
      // the company's own line), followed by the actual title. Before the
      // date-led-entry-line signal existed, this ALSO worked correctly
      // (the company line itself starts with a capital letter, so signal 1
      // covered it) — this test locks that in so a future change to signal
      // 3 can't regress it.
      const cv = [
        'Joana Nhantumbo',
        'joana@example.com',
        'Experiência Profissional',
        '2022-2024 Fundacao Seppa',
        'Oficial Administrativa e RH',
        '2019 - 2021',
        'Pro Truck Logistics',
        'Oficial Administrativo e de Recursos Humanos',
        '2018 - 2019 Dean Consultoria e Acessoria, Lda',
        'Assistente Administrativa',
        'Apoio administrativo geral.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(3);
      expect(data.workExperiences[1]?.position).toBe(
        'Oficial Administrativo e de Recursos Humanos',
      );
      expect(data.workExperiences[1]?.company).toBe('Pro Truck Logistics');
      expect(data.workExperiences[2]?.position).toBe('Assistente Administrativa');
      expect(data.workExperiences[2]?.company).toBe('Dean Consultoria e Acessoria, Lda');
    });

    it("does not mistake a PDF-wrapped bullet's first physical line for a second title line", () => {
      // The wrapped continuation ("para o departamento...") starts with a
      // lowercase word — the signal that distinguishes a genuine second
      // title line from a bullet sentence PDF happened to line-break early.
      const cv = [
        'Joana Nhantumbo',
        'joana@example.com',
        'Experiência Profissional',
        'ASSISTENTE ADMINISTRATIVA',
        'Apoio na elaboração de orçamentos operacionais',
        'para o departamento, garantindo eficiência financeira.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.position).toBe('ASSISTENTE ADMINISTRATIVA');
      expect(data.workExperiences[0]?.description).toContain('Apoio na elaboração');
    });

    it('does not mistake a wrapped bullet for a title when the next line starts with another capitalized acronym, not lowercase (real-CV-confirmed)', () => {
      // The lowercase-continuation check alone doesn't catch every wrap: a
      // bullet can break right before another capitalized acronym/proper
      // noun ("...funded by USAID, ECHO," / "SIDA, FCDO, and others...").
      // A trailing bare comma is model here — a genuine title never ends
      // with one.
      const cv = [
        'Dercio Chembene',
        'dercio@example.com',
        'Work Experience',
        '2024 - Present NRC',
        'MEL Officer- Mueda',
        'Coordinated MEL activities across projects funded by USAID, ECHO,',
        'SIDA, FCDO, and others, ensuring compliance with donor frameworks.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.position).toBe('MEL Officer- Mueda');
      expect(data.workExperiences[0]?.company).toBe('NRC');
      expect(data.workExperiences[0]?.description).toContain('Coordinated MEL activities');
    });

    it('splits a letter-spaced section header that pdf.js glued onto its own body paragraph on the same line (real-CV-confirmed)', () => {
      // pdf.js sometimes omits the line break between a heading and inline
      // body text — the header dictionary's length gate rejects the whole
      // paragraph-length line outright, so without this fix "PROFILE" never
      // gets recognized AND the entire summary paragraph gets misattributed
      // as body content of whatever section preceded it (here, it became a
      // bogus first "work experience" entry with the mangled letter-spaced
      // header as its position).
      const cv = [
        'Dercio Chembene',
        'dercio@example.com',
        'Work Experience',
        'P R O F I L E Monitoring and Evaluation Professional with over 7 years of experience.',
        '2024 - Present NRC',
        'MEL Officer- Mueda',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.summary).toContain('Monitoring and Evaluation Professional');
      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.position).toBe('MEL Officer- Mueda');
      expect(data.workExperiences[0]?.company).toBe('NRC');
    });

    it('does not let a summary paragraph swallow the real job entries that follow it with no header in between (real-CV-confirmed)', () => {
      // A symptom of the disclosed 2-column-layout extraction-order
      // limitation: a "Work Experience" header can appear BEFORE the
      // profile/summary text in the linearized stream, with the real job
      // entries continuing right after the summary paragraph and no header
      // ever separating them. A "date + company" line is strong enough
      // evidence on its own to implicitly close the summary section.
      const cv = [
        'Dercio Chembene',
        'dercio@example.com',
        'Work Experience',
        'Profile',
        'Monitoring and Evaluation Professional with over 7 years of experience in the field.',
        '2024 - Present NRC',
        'MEL Officer- Mueda',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.summary).toContain('Monitoring and Evaluation Professional');
      expect(data.summary).not.toContain('MEL Officer');
      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.position).toBe('MEL Officer- Mueda');
      expect(data.workExperiences[0]?.company).toBe('NRC');
    });
  });

  describe('reorderLinesForColumns (position-aware 2-column PDF extraction)', () => {
    // Private method — exercised directly with hand-crafted positioned lines
    // rather than via a generated PDF: pdf.js's own hasEOL line-break
    // heuristic can't be reliably forced into a specific pattern from
    // pdfkit's positioning API (verified empirically), so testing the
    // reordering algorithm itself, given known line positions, is the
    // precise and deterministic way to cover it. End-to-end PDF extraction
    // is already covered by cv-import.e2e-spec.ts's real generated PDFs.
    const PAGE_WIDTH = 600;
    type PositionedLine = { text: string; x: number; width: number };
    function reorder(parser: CVParser, lines: PositionedLine[]): PositionedLine[] {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (parser as any).reorderLinesForColumns(lines, PAGE_WIDTH);
    }

    it('leaves a normal single-column page completely unchanged', () => {
      const lines = [
        { text: 'Maria Fernanda Sitoe', x: 50, width: 200 },
        { text: 'maria@example.com', x: 50, width: 180 },
        { text: 'Work Experience', x: 50, width: 150 },
        { text: '2022 - 2024 Acme Corp', x: 50, width: 220 },
        { text: 'Gestora de Projeto', x: 50, width: 190 },
      ];
      expect(reorder(parser, lines)).toEqual(lines);
    });

    it('groups a real 2-column layout into two contiguous blocks instead of leaving them interleaved by draw order', () => {
      // Simulates pdf.js emitting a sidebar (Contact/Skills) and a main
      // column (Work Experience) interleaved line-by-line by Y position —
      // the worst case for splitIntoSections()'s single "current section"
      // pointer, since a sidebar header would otherwise sit directly next
      // to main-column body text and vice versa.
      const lines = [
        { text: 'CONTACT', x: 40, width: 80 },
        { text: 'Maria Fernanda Sitoe', x: 320, width: 200 },
        { text: 'maria@example.com', x: 40, width: 170 },
        { text: 'WORK EXPERIENCE', x: 320, width: 160 },
        { text: 'SKILLS', x: 40, width: 70 },
        { text: '2022 - 2024 Acme Corp', x: 320, width: 220 },
        { text: 'TypeScript', x: 40, width: 90 },
        { text: 'Gestora de Projeto', x: 320, width: 190 },
      ];
      const result = reorder(parser, lines);
      const texts = result.map((l) => l.text);

      // Every left-column (sidebar) line comes before every right-column
      // (main) line — no interleaving — while each side's own internal
      // (top-to-bottom) order is preserved.
      expect(texts).toEqual([
        'CONTACT',
        'maria@example.com',
        'SKILLS',
        'TypeScript',
        'Maria Fernanda Sitoe',
        'WORK EXPERIENCE',
        '2022 - 2024 Acme Corp',
        'Gestora de Projeto',
      ]);
    });

    it('does not reorder when only a handful of lines happen to start past the midpoint (no false positive on ordinary indented text)', () => {
      const lines = [
        { text: 'Maria Fernanda Sitoe', x: 50, width: 200 },
        { text: 'Work Experience', x: 50, width: 150 },
        { text: '2022 - 2024 Acme Corp', x: 50, width: 220 },
        { text: 'Gestora de Projeto', x: 50, width: 190 },
        { text: 'Liderou uma equipa de 5 pessoas.', x: 50, width: 280 },
        { text: 'Presente', x: 380, width: 60 }, // a single right-aligned date — not a real column
      ];
      expect(reorder(parser, lines)).toEqual(lines);
    });

    it('does not reorder a page of ordinary full-width paragraphs even if some happen to start past the midpoint', () => {
      // Wide, wrapping prose lines are not a real column just because a
      // handful start right of the page's horizontal midpoint.
      const lines = [
        { text: 'Resumo', x: 50, width: 100 },
        {
          text: 'Profissional de marketing digital com vasta experiencia em campanhas',
          x: 50,
          width: 480,
        },
        {
          text: 'de aquisicao e retencao de clientes em varios setores da industria',
          x: 320,
          width: 470,
        },
        {
          text: 'incluindo tecnologia, retalho e servicos financeiros diversos',
          x: 50,
          width: 460,
        },
        {
          text: 'sempre com foco em resultados mensuraveis e crescimento sustentavel',
          x: 330,
          width: 490,
        },
      ];
      expect(reorder(parser, lines)).toEqual(lines);
    });
  });

  describe('Phase 12 canonical-model additions: awards, volunteer experience, references', () => {
    it('extracts an award with title, issuer and date', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Prémios',
        '2022 Melhor Colaboradora do Ano - Acme Corp',
        'Reconhecimento pela liderança no projeto de pagamentos.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.awards.length).toBe(1);
      expect(data.awards[0]?.title).toBe('Melhor Colaboradora do Ano');
      expect(data.awards[0]?.issuer).toBe('Acme Corp');
      expect(data.awards[0]?.dateAwarded).toBe('2022-01-01');
    });

    it('extracts a volunteer experience entry with organization/role/dates, same shape as work experience', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Voluntariado',
        'Cruz Vermelha de Moçambique',
        'Voluntária de Apoio Comunitário',
        'Jan 2019 - Dez 2020',
        'Apoiou campanhas de sensibilização em saúde pública.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.volunteerExperiences.length).toBe(1);
      expect(data.volunteerExperiences[0]?.role).toBe('Voluntária de Apoio Comunitário');
      expect(data.volunteerExperiences[0]?.organization).toBe('Cruz Vermelha de Moçambique');
      expect(data.volunteerExperiences[0]?.description).toContain('sensibilização');
    });

    it('extracts references only when a "Referências" section is explicitly present, anchored on email/phone', () => {
      const cv = [
        'Maria Sitoe',
        'maria@example.com',
        'Referências',
        'João Machava - Diretor, Acme Corp',
        'joao.machava@acme.co.mz',
        '+258 82 111 2233',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.references.length).toBe(1);
      expect(data.references[0]?.name).toBe('João Machava');
      expect(data.references[0]?.email).toBe('joao.machava@acme.co.mz');
    });

    it('never fabricates a references section when none is present in the document', () => {
      const cv = ['Maria Sitoe', 'maria@example.com', 'Resumo', 'Engenheira de software.'].join(
        '\n',
      );
      const { data } = parser.parse(cv);

      expect(data.references).toEqual([]);
    });

    it('recognizes the English header variants for all three new sections', () => {
      const cv = [
        'John Doe',
        'john@example.com',
        'Honors & Awards',
        '2021 Employee of the Year - Acme Inc',
        'Volunteer Experience',
        'Red Cross',
        'Community Outreach Volunteer',
        '2018 - 2020',
        'References',
        'Jane Smith - Director, Acme Inc',
        'jane.smith@acme.com',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.awards.length).toBe(1);
      expect(data.volunteerExperiences.length).toBe(1);
      expect(data.references.length).toBe(1);
    });
  });

  describe('FASE 3 audit: additional real-world PT/EN section-header synonyms', () => {
    it('recognizes "Resumo Pessoal" and "Apresentação" as summary headers', () => {
      const cv1 = [
        'Ana Chissano',
        'ana@example.com',
        'Resumo Pessoal',
        'Gestora de projetos.',
      ].join('\n');
      expect(parser.parse(cv1).data.summary).toBe('Gestora de projetos.');

      const cv2 = ['Ana Chissano', 'ana@example.com', 'Apresentação', 'Gestora de projetos.'].join(
        '\n',
      );
      expect(parser.parse(cv2).data.summary).toBe('Gestora de projetos.');
    });

    it('recognizes "Trajetória Profissional" and "Career History" as experience headers', () => {
      const cv = [
        'Ana Chissano',
        'ana@example.com',
        'Trajetória Profissional',
        'Gestora de Projetos - Acme Lda',
        '2019 - 2022',
        'Liderou equipas multidisciplinares.',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.company).toBe('Acme Lda');
    });

    it('recognizes "Percurso Académico" as an education header', () => {
      const cv = [
        'Ana Chissano',
        'ana@example.com',
        'Percurso Académico',
        'Universidade Eduardo Mondlane - Licenciatura em Gestão',
        '2014 - 2018',
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.educations.length).toBe(1);
      expect(data.educations[0]?.institution).toBe('Universidade Eduardo Mondlane');
    });

    it('recognizes "Áreas de Competência" and "Conhecimentos" as skills headers', () => {
      const cv1 = [
        'Ana Chissano',
        'ana@example.com',
        'Áreas de Competência',
        'Gestão, Liderança, Excel',
      ].join('\n');
      expect(parser.parse(cv1).data.skills.map((s) => s.name)).toContain('Gestão');

      const cv2 = [
        'Ana Chissano',
        'ana@example.com',
        'Conhecimentos',
        'Gestão, Liderança, Excel',
      ].join('\n');
      expect(parser.parse(cv2).data.skills.map((s) => s.name)).toContain('Gestão');
    });
  });

  describe('normalizeEntityName (FASE 8 audit — whitespace cleanup, never a rewrite)', () => {
    it('collapses doubled internal whitespace and trims the ends', () => {
      expect(normalizeEntityName('  Beta  Consultoria,   Lda  ')).toBe('Beta Consultoria, Lda');
    });

    it('returns undefined for undefined input', () => {
      expect(normalizeEntityName(undefined)).toBeUndefined();
    });

    it('returns undefined for a whitespace-only value instead of an empty string', () => {
      expect(normalizeEntityName('   ')).toBeUndefined();
    });

    it('never changes case or reorders words — cleanup only, not a rewrite', () => {
      expect(normalizeEntityName('iOS Developer at SAP')).toBe('iOS Developer at SAP');
    });
  });

  describe('extractText — DOCX column-aware extraction (FASE 4 audit)', () => {
    it('groups a genuine 2-column table layout into two contiguous blocks instead of interleaving cell-by-cell', async () => {
      const { Document, Packer, Paragraph, Table, TableRow, TableCell } = await import('docx');
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph('Ana Chissano'),
              new Paragraph('ana@example.com'),
              new Table({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph('Competências'),
                          new Paragraph('TypeScript'),
                          new Paragraph('Node.js'),
                          new Paragraph('Idiomas'),
                          new Paragraph('Português (Nativo)'),
                        ],
                      }),
                      new TableCell({
                        children: [
                          new Paragraph('Experiência Profissional'),
                          new Paragraph('Engenheira - Acme'),
                          new Paragraph('2019 - 2022'),
                          new Paragraph('Liderou o backend.'),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          },
        ],
      });
      const buffer = Buffer.from(await Packer.toBuffer(doc));

      const text = await parser.extractText(buffer, 'DOCX');
      const lines = text.split('\n');

      // Both columns' content is present and each stays contiguous — the
      // "Competências" column's lines never get interleaved with the
      // "Experiência Profissional" column's lines.
      const competenciasIdx = lines.indexOf('Competências');
      const experienciaIdx = lines.indexOf('Experiência Profissional');
      expect(competenciasIdx).toBeGreaterThanOrEqual(0);
      expect(experienciaIdx).toBeGreaterThan(competenciasIdx);
      expect(lines.slice(competenciasIdx, competenciasIdx + 5)).toEqual([
        'Competências',
        'TypeScript',
        'Node.js',
        'Idiomas',
        'Português (Nativo)',
      ]);

      // Feeding this into the actual section parser now correctly separates
      // skills/languages from experience instead of them being interleaved.
      const { data } = parser.parse(text);
      expect(data.skills.map((s) => s.name)).toEqual(
        expect.arrayContaining(['TypeScript', 'Node.js']),
      );
      expect(data.workExperiences.length).toBe(1);
      expect(data.workExperiences[0]?.company).toBe('Acme');
    });

    it('does not reorder a normal single-column DOCX with no table', async () => {
      const { Document, Packer, Paragraph } = await import('docx');
      const doc = new Document({
        sections: [
          {
            children: ['Ana Chissano', 'ana@example.com', 'Resumo', 'Engenheira.'].map(
              (l) => new Paragraph(l),
            ),
          },
        ],
      });
      const buffer = Buffer.from(await Packer.toBuffer(doc));

      const text = await parser.extractText(buffer, 'DOCX');
      expect(text.split('\n')).toEqual([
        'Ana Chissano',
        'ana@example.com',
        'Resumo',
        'Engenheira.',
      ]);
    });

    it('does not reorder a genuine multi-row data table (never mistaken for a 2-column layout)', async () => {
      const { Document, Packer, Paragraph, Table, TableRow, TableCell } = await import('docx');
      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph('Ana Chissano'),
              new Table({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph('Competência')] }),
                      new TableCell({ children: [new Paragraph('Nível')] }),
                    ],
                  }),
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph('TypeScript')] }),
                      new TableCell({ children: [new Paragraph('Avançado')] }),
                    ],
                  }),
                ],
              }),
            ],
          },
        ],
      });
      const buffer = Buffer.from(await Packer.toBuffer(doc));

      const text = await parser.extractText(buffer, 'DOCX');
      // Falls straight through to whole-document paragraph order — every
      // cell's content is still present, just never treated as a column.
      expect(text.split('\n')).toEqual([
        'Ana Chissano',
        'Competência',
        'Nível',
        'TypeScript',
        'Avançado',
      ]);
    });

    it('does not reorder a short 2-cell header table (too little content per side to be a real column)', async () => {
      const { Document, Packer, Paragraph, Table, TableRow, TableCell } = await import('docx');
      const doc = new Document({
        sections: [
          {
            children: [
              new Table({
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph('Ana Chissano')] }),
                      new TableCell({ children: [new Paragraph('ana@example.com')] }),
                    ],
                  }),
                ],
              }),
              new Paragraph('Resumo'),
              new Paragraph('Engenheira.'),
            ],
          },
        ],
      });
      const buffer = Buffer.from(await Packer.toBuffer(doc));

      const text = await parser.extractText(buffer, 'DOCX');
      expect(text.split('\n')).toEqual([
        'Ana Chissano',
        'ana@example.com',
        'Resumo',
        'Engenheira.',
      ]);
    });
  });

  describe('FASE 5 audit — StructuredResumeDraft: per-entry confidence/source/sourceText/warnings', () => {
    const FULL_CV = [
      'Ana Chissano',
      'ana@example.com',
      '+258 82 111 2233',
      'Experiência Profissional',
      'Gestora de Projeto - Acme Corp',
      'Jan 2020 - presente',
      'Liderou a equipa de operações.',
      'Formação Académica',
      'Universidade Eduardo Mondlane - Licenciatura em Gestão',
      '2014 - 2018',
      'Competências',
      'TypeScript, Node.js',
      'Idiomas',
      'Português (Nativo), Inglês (Avançado)',
      'Certificados',
      'AWS Certified - Amazon',
      'Jun 2021',
      'Projetos',
      'Portfolio pessoal - https://example.com',
      'Sistema de gestão de inventário para PMEs.',
      'Prémios',
      '2022 Empregada do Ano - Acme Corp',
      'Voluntariado',
      'Cruz Vermelha de Moçambique',
      'Voluntária de Apoio Comunitário',
      'Jan 2019 - Dez 2020',
      'Apoiou campanhas de saúde pública.',
      'Referências',
      'João Silva - Diretor, Acme Corp',
      'joao.silva@acme.co.mz',
    ].join('\n');

    it('gives a document-sourced work experience entry with all required fields a high confidence and no warnings', () => {
      const { data } = parser.parse(FULL_CV);
      const entry = data.workExperiences[0]!;
      expect(entry.source).toBe('document');
      expect(entry.confidence).toBeGreaterThanOrEqual(0.7);
      expect(entry.warnings).toEqual([]);
      expect(entry.sourceText).toContain('Gestora de Projeto');
      expect(entry.sourceText).toContain('Acme Corp');
    });

    it('gives every document-sourced section a confidence score, a source, and a warnings array', () => {
      const { data } = parser.parse(FULL_CV);
      const sections: Array<keyof typeof data> = [
        'workExperiences',
        'educations',
        'skills',
        'languages',
        'certificates',
        'projects',
        'awards',
        'volunteerExperiences',
        'references',
      ];
      for (const key of sections) {
        const entries = data[key] as Array<{
          confidence?: number;
          source?: string;
          warnings?: string[];
        }>;
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(entry.confidence).toBeGreaterThan(0);
          expect(entry.confidence).toBeLessThanOrEqual(0.9);
          expect(entry.source).toBe('document');
          expect(Array.isArray(entry.warnings)).toBe(true);
        }
      }
    });

    it('never assigns sourceText to a skill or language — no richer context exists beyond the value itself', () => {
      const { data } = parser.parse(FULL_CV);
      expect(data.skills[0]?.sourceText).toBeUndefined();
      expect(data.languages[0]?.sourceText).toBeUndefined();
    });

    it('assigns sourceText (a genuine substring of the document) for chunk-based sections', () => {
      const { data } = parser.parse(FULL_CV);
      expect(data.educations[0]?.sourceText).toContain('Eduardo Mondlane');
      expect(data.certificates[0]?.sourceText).toContain('AWS Certified');
      expect(data.projects[0]?.sourceText).toContain('Portfolio pessoal');
      expect(data.awards[0]?.sourceText).toContain('Empregada do Ano');
      expect(data.volunteerExperiences[0]?.sourceText).toContain('Cruz Vermelha');
      expect(data.references[0]?.sourceText).toContain('João Silva');
    });

    it('flags a missing required field with a specific warning, and lowers confidence accordingly', () => {
      const cv = [
        'Ana Chissano',
        'ana@example.com',
        'Experiência Profissional',
        'Consultora',
        'Formação Académica',
        'Certificados',
        'Curso sem entidade',
      ].join('\n');
      const { data } = parser.parse(cv);

      const exp = data.workExperiences[0]!;
      expect(exp.warnings).toContain('Empresa não identificada.');
      expect(exp.warnings).toContain('Data de início não identificada.');
      expect(exp.confidence).toBeLessThan(0.7);
    });

    it('warns when position and company were extracted as the same text (a likely mis-split)', () => {
      const cv = [
        'Ana',
        'ana@example.com',
        'Experiência Profissional',
        'Consultora - Consultora',
        '2020 - 2021',
      ].join('\n');
      const { data } = parser.parse(cv);
      const exp = data.workExperiences[0]!;
      expect(exp.warnings?.some((w) => w.includes('mesmo texto'))).toBe(true);
    });

    it('warns on a suspiciously short skill token', () => {
      const cv = ['Ana', 'ana@example.com', 'Competências', 'A, TypeScript'].join('\n');
      const { data } = parser.parse(cv);
      const shortSkill = data.skills.find((s) => s.name === 'A');
      expect(shortSkill?.warnings).toContain(
        'Nome muito curto — verifique se foi extraído corretamente.',
      );
    });

    it('marks a fallback-recovered entry with source="fallback", a low fixed confidence, and an explicit warning', () => {
      // No recognized header at all — recovered purely from a dated chunk in unclaimed text (see parseFallbackDatedEntries()).
      const cv = [
        'Ana Chissano',
        'ana@example.com',
        'Analista de Marketing - TechCorp',
        'Jan 2020 - Dez 2021',
        'Geriu campanhas digitais.',
      ].join('\n');
      const { data } = parser.parse(cv);

      expect(data.workExperiences.length).toBeGreaterThan(0);
      const entry = data.workExperiences[0]!;
      expect(entry.source).toBe('fallback');
      expect(entry.confidence).toBe(0.3);
      expect(entry.warnings?.some((w) => w.includes('cabeçalho'))).toBe(true);
    });

    it('a fallback entry never has a HIGHER confidence than a document-sourced one, even when fully populated', () => {
      const documentCv = [
        'Ana',
        'ana@example.com',
        'Experiência Profissional',
        'Gestora - Acme',
        'Jan 2020 - Dez 2021',
        'Liderou a equipa.',
      ].join('\n');
      const fallbackCv = [
        'Ana',
        'ana@example.com',
        'Gestora - Acme',
        'Jan 2020 - Dez 2021',
        'Liderou a equipa.',
      ].join('\n');

      const documentEntry = parser.parse(documentCv).data.workExperiences[0]!;
      const fallbackEntry = parser.parse(fallbackCv).data.workExperiences[0]!;

      expect(fallbackEntry.source).toBe('fallback');
      expect(documentEntry.source).toBe('document');
      expect(fallbackEntry.confidence!).toBeLessThan(documentEntry.confidence!);
    });

    it('truncates a very long sourceText rather than embedding the entire remaining document', () => {
      const longDescription = 'Responsável por '.repeat(40);
      const cv = [
        'Ana',
        'ana@example.com',
        'Experiência Profissional',
        'Gestora - Acme',
        '2020 - 2021',
        longDescription,
      ].join('\n');
      const { data } = parser.parse(cv);
      expect(data.workExperiences[0]?.sourceText?.length).toBeLessThanOrEqual(241);
      expect(data.workExperiences[0]?.sourceText?.endsWith('…')).toBe(true);
    });

    it('does not fabricate warnings for a fully-populated language entry with proficiency present', () => {
      const cv = ['Ana', 'ana@example.com', 'Idiomas', 'Português (Nativo)'].join('\n');
      const { data } = parser.parse(cv);
      expect(data.languages[0]?.warnings).toEqual([]);
      expect(data.languages[0]?.confidence).toBeGreaterThan(0.55);
    });
  });
});
