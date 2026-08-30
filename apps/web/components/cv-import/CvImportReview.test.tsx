import { fireEvent, render, screen, within } from '@testing-library/react';
import { CvImportReview } from './CvImportReview';
import type { ExtractedCvData, MergePreview } from '@/lib/api/cv-import';

function emptyMergePreview(): MergePreview {
  return {
    workExperiences: [],
    educations: [],
    skills: [],
    languages: [],
    certificates: [],
    projects: [],
    awards: [],
    volunteerExperiences: [],
    references: [],
    newCount: 0,
    duplicateCount: 0,
  };
}

const baseData: ExtractedCvData = {
  personalData: { fullName: 'Ana Machava', email: 'ana@example.com' },
  summary: 'Profissional de marketing.',
  workExperiences: [{ position: 'Gestora', company: 'Acme', startDate: '2020-01-01' }],
  educations: [{ institution: 'UEM', degree: 'BSc' }],
  skills: [{ name: 'SEO' }, { name: 'Copywriting' }],
  languages: [{ language: 'Português', proficiency: 'Nativo' }],
  certificates: [{ title: 'AWS Certified', issuer: 'Amazon' }],
  projects: [{ title: 'Portfolio', url: 'https://example.com' }],
  awards: [{ title: 'Employee of the Year', issuer: 'Acme' }],
  volunteerExperiences: [{ organization: 'Cruz Vermelha', role: 'Voluntária' }],
  references: [{ name: 'João Silva', email: 'joao@example.com' }],
};

describe('CvImportReview', () => {
  it('renders every section with its extracted entries', () => {
    render(<CvImportReview value={baseData} onChange={jest.fn()} fieldConfidence={{}} />);
    expect(screen.getByDisplayValue('Ana Machava')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Gestora')).toBeInTheDocument();
    expect(screen.getByDisplayValue('UEM')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SEO')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Português')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AWS Certified')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Portfolio')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Employee of the Year')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Voluntária')).toBeInTheDocument();
    expect(screen.getByDisplayValue('João Silva')).toBeInTheDocument();
  });

  it('shows the empty-section notice for a section with no entries (FASE 6 audit)', () => {
    render(
      <CvImportReview
        value={{ ...baseData, projects: [] }}
        onChange={jest.fn()}
        fieldConfidence={{}}
      />,
    );
    expect(screen.getByText('Não encontramos informações nesta secção.')).toBeInTheDocument();
    expect(screen.getByText('Pode adicionar manualmente.')).toBeInTheDocument();
    expect(screen.getByText('Projetos (0)')).toBeInTheDocument();
  });

  it('shows a confidence badge only for fields the parser actually scored', () => {
    render(
      <CvImportReview
        value={baseData}
        onChange={jest.fn()}
        fieldConfidence={{ 'personalData.email': 0.95 }}
      />,
    );
    expect(screen.getByText('Alta confiança')).toBeInTheDocument();
    // fullName wasn't scored in this fieldConfidence map — no badge, not even a fabricated "low confidence" one.
    expect(screen.queryByText('Verifique esta informação')).not.toBeInTheDocument();
  });

  it('renders low/medium confidence tiers correctly', () => {
    render(
      <CvImportReview
        value={baseData}
        onChange={jest.fn()}
        fieldConfidence={{ 'personalData.email': 0.3, 'personalData.fullName': 0.6 }}
      />,
    );
    expect(screen.getByText('Verifique esta informação')).toBeInTheDocument();
    expect(screen.getByText('Confiança média')).toBeInTheDocument();
  });

  it('calls onChange with the edited value when a personal-data field is edited', () => {
    const onChange = jest.fn();
    render(<CvImportReview value={baseData} onChange={onChange} fieldConfidence={{}} />);

    fireEvent.change(screen.getByDisplayValue('Ana Machava'), {
      target: { value: 'Ana P. Machava' },
    });

    expect(onChange).toHaveBeenCalledWith({
      ...baseData,
      personalData: { ...baseData.personalData, fullName: 'Ana P. Machava' },
    });
  });

  it('calls onChange with the entry removed when its remove button is clicked', () => {
    const onChange = jest.fn();
    render(<CvImportReview value={baseData} onChange={onChange} fieldConfidence={{}} />);

    // The work-experience card's remove button is the first "Remover" control in the DOM.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]!);

    expect(onChange).toHaveBeenCalledWith({ ...baseData, workExperiences: [] });
  });

  it('calls onChange with an edited array item when a work-experience field is edited', () => {
    const onChange = jest.fn();
    render(<CvImportReview value={baseData} onChange={onChange} fieldConfidence={{}} />);

    fireEvent.change(screen.getByDisplayValue('Gestora'), { target: { value: 'Diretora' } });

    expect(onChange).toHaveBeenCalledWith({
      ...baseData,
      workExperiences: [{ ...baseData.workExperiences[0], position: 'Diretora' }],
    });
  });

  describe('FASE 7 audit — "Existente vs Importado" diff banner', () => {
    it('does not render a diff banner for an entry with no existingSectionId', () => {
      render(
        <CvImportReview
          value={baseData}
          onChange={jest.fn()}
          fieldConfidence={{}}
          mergePreview={emptyMergePreview()}
        />,
      );
      expect(screen.queryByText(/Possível duplicado/)).not.toBeInTheDocument();
    });

    it('renders the diff banner with both sides summarized when an entry has a matched existing row', () => {
      const data: ExtractedCvData = {
        ...baseData,
        workExperiences: [
          {
            position: 'Gestora de Projeto',
            company: 'Acme Corp',
            startDate: '2020-01-01',
            existingSectionId: 'wx-1',
          },
        ],
      };
      const preview: MergePreview = {
        ...emptyMergePreview(),
        workExperiences: [
          {
            entry: data.workExperiences[0]!,
            status: 'possible_duplicate',
            existingId: 'wx-1',
            existing: { position: 'Gestora de Projetos', company: 'Acme Corporation' },
          },
        ],
      };

      render(
        <CvImportReview
          value={data}
          onChange={jest.fn()}
          fieldConfidence={{}}
          mergePreview={preview}
        />,
      );

      expect(screen.getByText(/Possível duplicado/)).toBeInTheDocument();
      expect(screen.getByText('Gestora de Projetos — Acme Corporation')).toBeInTheDocument();
      expect(screen.getByText('Gestora de Projeto — Acme Corp')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Manter existente' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Usar importado' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mesclar' })).toBeInTheDocument();
    });

    it('calls onChange with mergeDecision set on the exact entry when a resolution button is clicked', () => {
      const onChange = jest.fn();
      const data: ExtractedCvData = {
        ...baseData,
        skills: [{ name: 'TypeScript', existingSectionId: 'skill-1' }, { name: 'Rust' }],
      };
      const preview: MergePreview = {
        ...emptyMergePreview(),
        skills: [
          {
            entry: data.skills[0]!,
            status: 'possible_duplicate',
            existingId: 'skill-1',
            existing: { name: 'typescript' },
          },
          { entry: data.skills[1]!, status: 'new' },
        ],
      };

      render(
        <CvImportReview
          value={data}
          onChange={onChange}
          fieldConfidence={{}}
          mergePreview={preview}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Usar importado' }));

      expect(onChange).toHaveBeenCalledWith({
        ...data,
        skills: [
          { name: 'TypeScript', existingSectionId: 'skill-1', mergeDecision: 'use_imported' },
          { name: 'Rust' },
        ],
      });
    });

    it('highlights the currently selected decision', () => {
      const data: ExtractedCvData = {
        ...baseData,
        skills: [
          { name: 'TypeScript', existingSectionId: 'skill-1', mergeDecision: 'keep_existing' },
        ],
      };
      const preview: MergePreview = {
        ...emptyMergePreview(),
        skills: [
          {
            entry: data.skills[0]!,
            status: 'possible_duplicate',
            existingId: 'skill-1',
            existing: { name: 'typescript' },
          },
        ],
      };

      render(
        <CvImportReview
          value={data}
          onChange={jest.fn()}
          fieldConfidence={{}}
          mergePreview={preview}
        />,
      );

      const keepButton = screen.getByRole('button', { name: 'Manter existente' });
      const useButton = screen.getByRole('button', { name: 'Usar importado' });
      // "default" variant (selected) vs "outline" (not selected) — checked via class presence rather than a fabricated test id.
      expect(keepButton.className).toContain('bg-primary');
      expect(useButton.className).not.toContain('bg-primary');
    });
  });

  describe('FASE 5/6 audit — checklist, per-entry draft metadata, and adding manually', () => {
    it('renders a checklist row per section, reflecting real found/not_found status', () => {
      const data: ExtractedCvData = {
        personalData: { fullName: 'Ana', email: 'ana@example.com' },
        summary: undefined,
        workExperiences: [
          {
            company: 'Acme',
            position: 'Dev',
            startDate: '2020-01-01',
            confidence: 0.8,
            source: 'document',
            warnings: [],
          },
        ],
        educations: [],
        skills: [],
        languages: [],
        certificates: [],
        projects: [],
        awards: [],
        volunteerExperiences: [],
        references: [],
      };
      render(
        <CvImportReview
          value={data}
          onChange={jest.fn()}
          fieldConfidence={{ 'personalData.fullName': 0.6, 'personalData.email': 0.95 }}
        />,
      );

      const checklist = screen.getByRole('list', { name: 'Resumo da importação' });
      expect(checklist).toBeInTheDocument();
      // "Experiência Profissional" is found (one confident, warning-free entry).
      const workExperienceRow = screen.getByText('Experiência Profissional').closest('li')!;
      expect(workExperienceRow).toHaveTextContent('Encontrado');
      // "Resumo profissional" is not found — summary is undefined.
      const summaryRow = screen.getByText('Resumo profissional').closest('li')!;
      expect(summaryRow).toHaveTextContent('Não encontrado');
    });

    it('shows a confidence tier, source, and warnings for a document-sourced entry with an actual warning', () => {
      const data: ExtractedCvData = {
        ...baseData,
        workExperiences: [
          {
            company: undefined,
            position: 'Analista',
            startDate: undefined,
            confidence: 0.5,
            source: 'document',
            warnings: ['Empresa não identificada.', 'Data de início não identificada.'],
            sourceText: 'Analista de Marketing sem datas visíveis',
          },
        ],
      };
      render(<CvImportReview value={data} onChange={jest.fn()} fieldConfidence={{}} />);

      expect(screen.getByText('Confiança média')).toBeInTheDocument();
      expect(screen.getByText('Empresa não identificada.')).toBeInTheDocument();
      expect(screen.getByText('Data de início não identificada.')).toBeInTheDocument();
      expect(screen.getByText(/Fonte:/)).toBeInTheDocument();
      expect(screen.getByText(/Analista de Marketing sem datas visíveis/)).toBeInTheDocument();
    });

    it('flags a fallback-sourced entry with a distinct badge', () => {
      const data: ExtractedCvData = {
        ...baseData,
        workExperiences: [
          {
            company: 'Acme',
            position: 'Dev',
            startDate: '2020-01-01',
            confidence: 0.3,
            source: 'fallback',
            warnings: [
              'Recuperado automaticamente — o cabeçalho desta secção não foi reconhecido no documento. Reveja com atenção.',
            ],
          },
        ],
      };
      render(<CvImportReview value={data} onChange={jest.fn()} fieldConfidence={{}} />);
      expect(screen.getByText('Recuperado automaticamente')).toBeInTheDocument();
    });

    it('renders nothing extra for a manually-added entry with no draft metadata at all', () => {
      const data: ExtractedCvData = {
        ...baseData,
        workExperiences: [{ company: 'Acme', position: 'Dev' }],
      };
      render(<CvImportReview value={data} onChange={jest.fn()} fieldConfidence={{}} />);
      expect(screen.queryByText(/Confiança/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Fonte:/)).not.toBeInTheDocument();
    });

    it('"+ Adicionar" appends one blank entry to the section without touching existing entries', () => {
      const onChange = jest.fn();
      render(<CvImportReview value={baseData} onChange={onChange} fieldConfidence={{}} />);

      fireEvent.click(screen.getByRole('button', { name: 'Adicionar experiência' }));

      expect(onChange).toHaveBeenCalledWith({
        ...baseData,
        workExperiences: [...baseData.workExperiences, { currentlyWorking: false }],
      });
    });

    it('"+ Adicionar" works for an empty section, showing the manual-entry notice beforehand', () => {
      const onChange = jest.fn();
      const data: ExtractedCvData = { ...baseData, projects: [] };
      render(<CvImportReview value={data} onChange={onChange} fieldConfidence={{}} />);

      expect(screen.getByText('Não encontramos informações nesta secção.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Adicionar projeto' }));

      expect(onChange).toHaveBeenCalledWith({ ...data, projects: [{}] });
    });

    it('renders every section cleanly for a completely empty draft — no crash, every section shows the manual-entry notice', () => {
      const emptyData: ExtractedCvData = {
        personalData: {},
        summary: undefined,
        workExperiences: [],
        educations: [],
        skills: [],
        languages: [],
        certificates: [],
        projects: [],
        awards: [],
        volunteerExperiences: [],
        references: [],
      };
      render(<CvImportReview value={emptyData} onChange={jest.fn()} fieldConfidence={{}} />);

      // 9 array sections all empty — the notice appears once per section.
      expect(screen.getAllByText('Não encontramos informações nesta secção.')).toHaveLength(9);
      expect(screen.getAllByText('Pode adicionar manualmente.')).toHaveLength(9);
    });

    it('editing a field after adding an entry manually preserves it in the payload sent onChange', () => {
      const onChange = jest.fn();
      const data: ExtractedCvData = { ...baseData, references: [{}] };
      render(<CvImportReview value={data} onChange={onChange} fieldConfidence={{}} />);

      // Labels in this form aren't htmlFor-associated to their inputs (a
      // pre-existing, unrelated app-wide pattern) — locate the "Referências"
      // card's first textbox (Nome, the first FieldRow in that entry)
      // positionally instead of via getByLabelText.
      const referencesCard = screen
        .getByText('Referências (1)')
        .closest('.rounded-xl') as HTMLElement;
      const nameInput = within(referencesCard).getAllByRole('textbox')[0]!;
      fireEvent.change(nameInput, { target: { value: 'Maria Nhaca' } });

      expect(onChange).toHaveBeenCalledWith({ ...data, references: [{ name: 'Maria Nhaca' }] });
    });
  });
});
