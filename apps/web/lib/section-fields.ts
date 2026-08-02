export type SectionType =
  | 'work-experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certificates'
  | 'projects'
  | 'courses'
  | 'awards'
  | 'publications'
  | 'volunteer-experience'
  | 'references';

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'checkbox' | 'tags' | 'email';

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export type SectionItem = Record<string, unknown> & { id: string; displayOrder: number };

export interface SectionConfig {
  type: SectionType;
  label: string;
  singularLabel: string;
  fields: FieldConfig[];
  title: (item: SectionItem) => string;
  subtitle: (item: SectionItem) => string | null;
}

function str(item: SectionItem, key: string): string {
  const value = item[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Mirrors apps/api/src/resume-sections/section-registry.ts one-for-one: the
 * API path segment is always `/resume/${type}`, so this map is the frontend
 * half of the same generic-engine pattern instead of 11 near-duplicate pages.
 */
export const SECTION_CONFIGS: Record<SectionType, SectionConfig> = {
  'work-experience': {
    type: 'work-experience',
    label: 'Experiência Profissional',
    singularLabel: 'experiência',
    fields: [
      { name: 'position', label: 'Cargo', type: 'text', required: true },
      { name: 'company', label: 'Empresa', type: 'text', required: true },
      { name: 'employmentType', label: 'Tipo de contrato', type: 'text' },
      { name: 'location', label: 'Local', type: 'text' },
      { name: 'country', label: 'País', type: 'text' },
      { name: 'startDate', label: 'Data de início', type: 'date', required: true },
      { name: 'endDate', label: 'Data de fim', type: 'date' },
      { name: 'currentlyWorking', label: 'Trabalho aqui atualmente', type: 'checkbox' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'achievements', label: 'Conquistas (separadas por vírgula)', type: 'tags' },
      { name: 'technologies', label: 'Tecnologias (separadas por vírgula)', type: 'tags' },
    ],
    title: (item) => str(item, 'position') || 'Cargo sem título',
    subtitle: (item) => str(item, 'company') || null,
  },
  education: {
    type: 'education',
    label: 'Formação Académica',
    singularLabel: 'formação',
    fields: [
      { name: 'institution', label: 'Instituição', type: 'text', required: true },
      { name: 'degree', label: 'Grau', type: 'text' },
      { name: 'field', label: 'Área de estudo', type: 'text' },
      { name: 'location', label: 'Local', type: 'text' },
      { name: 'startDate', label: 'Data de início', type: 'date' },
      { name: 'endDate', label: 'Data de fim', type: 'date' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    title: (item) => str(item, 'institution') || 'Instituição sem nome',
    subtitle: (item) => str(item, 'degree') || null,
  },
  skills: {
    type: 'skills',
    label: 'Competências',
    singularLabel: 'competência',
    fields: [
      { name: 'name', label: 'Nome', type: 'text', required: true },
      { name: 'category', label: 'Categoria', type: 'text' },
      { name: 'level', label: 'Nível', type: 'text' },
      { name: 'yearsExperience', label: 'Anos de experiência', type: 'number' },
    ],
    title: (item) => str(item, 'name') || 'Competência sem nome',
    subtitle: (item) => str(item, 'level') || null,
  },
  languages: {
    type: 'languages',
    label: 'Idiomas',
    singularLabel: 'idioma',
    fields: [
      { name: 'language', label: 'Idioma', type: 'text', required: true },
      { name: 'proficiency', label: 'Proficiência', type: 'text' },
    ],
    title: (item) => str(item, 'language') || 'Idioma sem nome',
    subtitle: (item) => str(item, 'proficiency') || null,
  },
  certificates: {
    type: 'certificates',
    label: 'Certificados',
    singularLabel: 'certificado',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'issuer', label: 'Emissor', type: 'text' },
      { name: 'issueDate', label: 'Data de emissão', type: 'date' },
      { name: 'expirationDate', label: 'Data de expiração', type: 'date' },
      { name: 'credentialId', label: 'ID da credencial', type: 'text' },
      { name: 'credentialUrl', label: 'URL da credencial', type: 'text' },
    ],
    title: (item) => str(item, 'title') || 'Certificado sem título',
    subtitle: (item) => str(item, 'issuer') || null,
  },
  projects: {
    type: 'projects',
    label: 'Projetos',
    singularLabel: 'projeto',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'description', label: 'Descrição', type: 'textarea' },
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'technologies', label: 'Tecnologias (separadas por vírgula)', type: 'tags' },
    ],
    title: (item) => str(item, 'title') || 'Projeto sem título',
    subtitle: () => null,
  },
  courses: {
    type: 'courses',
    label: 'Cursos',
    singularLabel: 'curso',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'provider', label: 'Instituição/Fornecedor', type: 'text' },
      { name: 'hours', label: 'Horas', type: 'number' },
      { name: 'completionDate', label: 'Data de conclusão', type: 'date' },
    ],
    title: (item) => str(item, 'title') || 'Curso sem título',
    subtitle: (item) => str(item, 'provider') || null,
  },
  awards: {
    type: 'awards',
    label: 'Prémios',
    singularLabel: 'prémio',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'issuer', label: 'Entidade', type: 'text' },
      { name: 'dateAwarded', label: 'Data', type: 'date' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    title: (item) => str(item, 'title') || 'Prémio sem título',
    subtitle: (item) => str(item, 'issuer') || null,
  },
  publications: {
    type: 'publications',
    label: 'Publicações',
    singularLabel: 'publicação',
    fields: [
      { name: 'title', label: 'Título', type: 'text', required: true },
      { name: 'publisher', label: 'Editora', type: 'text' },
      { name: 'publicationDate', label: 'Data de publicação', type: 'date' },
      { name: 'url', label: 'URL', type: 'text' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    title: (item) => str(item, 'title') || 'Publicação sem título',
    subtitle: (item) => str(item, 'publisher') || null,
  },
  'volunteer-experience': {
    type: 'volunteer-experience',
    label: 'Voluntariado',
    singularLabel: 'experiência de voluntariado',
    fields: [
      { name: 'organization', label: 'Organização', type: 'text', required: true },
      { name: 'role', label: 'Função', type: 'text' },
      { name: 'startDate', label: 'Data de início', type: 'date' },
      { name: 'endDate', label: 'Data de fim', type: 'date' },
      { name: 'currentlyVolunteering', label: 'Ainda colaboro aqui', type: 'checkbox' },
      { name: 'description', label: 'Descrição', type: 'textarea' },
    ],
    title: (item) => str(item, 'organization') || 'Organização sem nome',
    subtitle: (item) => str(item, 'role') || null,
  },
  references: {
    type: 'references',
    label: 'Referências',
    singularLabel: 'referência',
    fields: [
      { name: 'name', label: 'Nome', type: 'text', required: true },
      { name: 'position', label: 'Cargo', type: 'text' },
      { name: 'company', label: 'Empresa', type: 'text' },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'Telefone', type: 'text' },
    ],
    title: (item) => str(item, 'name') || 'Referência sem nome',
    subtitle: (item) => str(item, 'company') || null,
  },
};

export const SECTION_ORDER: SectionType[] = [
  'work-experience',
  'education',
  'skills',
  'languages',
  'certificates',
  'projects',
  'courses',
  'awards',
  'publications',
  'volunteer-experience',
  'references',
];
