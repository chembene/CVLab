import type {
  JobFieldConfidence,
  ParsedJobData,
  ParsedJobResult,
} from '../interfaces/job-parser.interface';
import {
  extractHtmlTitle,
  extractJsonLdJobPosting,
  extractOpenGraph,
  stripHtmlToText,
} from './structured-data.util';
import { resolveCompanyLogoUrl } from './company-logo.util';
import { splitJobSections } from './job-section-splitter.util';
import {
  detectLanguages,
  detectSkills,
  detectTechnologies,
  normalizeEmploymentType,
  normalizeSalaryUnitText,
  normalizeSeniority,
  parseEducationLevel,
  parseExperienceYears,
  parseSalaryFromText,
} from './job-field-heuristics.util';

/**
 * The one real implementation behind every parser in job-import/parsers/
 * (GenericHtmlParser included) — JSON-LD JobPosting → Open Graph → bare
 * HTML, in that order of trust. A shared *utility function*, not a parser
 * itself, so no parser ends up "knowing about" another one: each parser
 * calls this the same way it would call any other stateless helper, then
 * optionally overlays its own provider-specific normalization (see
 * parsers/greenhouse.parser.ts etc.) before returning.
 */
export function parseJobHtml(html: string, sourceUrl: string): ParsedJobResult {
  const jsonLd = extractJsonLdJobPosting(html);
  const og = extractOpenGraph(html);
  const confidence: JobFieldConfidence = {};

  const title = jsonLd?.title ?? og.title ?? extractHtmlTitle(html);
  if (jsonLd?.title) confidence.title = 0.9;
  else if (og.title || extractHtmlTitle(html)) confidence.title = 0.55;

  const company = jsonLd?.companyName ?? og.siteName;
  if (jsonLd?.companyName) confidence.company = 0.85;
  else if (og.siteName) confidence.company = 0.5;

  const companyLogoUrl = resolveCompanyLogoUrl({ og, jsonLd, html, sourceUrl });
  if (companyLogoUrl) {
    confidence.companyLogoUrl = og.image ? 0.8 : jsonLd?.companyLogoUrl ? 0.7 : 0.35;
  }

  const location = jsonLd?.locationText;
  if (location) confidence.location = 0.75;

  const descriptionSource = jsonLd?.descriptionHtml
    ? stripHtmlToText(jsonLd.descriptionHtml)
    : (og.description ?? stripHtmlToText(html));
  if (jsonLd?.descriptionHtml) confidence.description = 0.85;
  else if (og.description) confidence.description = 0.5;
  else confidence.description = 0.3;

  const employmentType = normalizeEmploymentType(
    jsonLd?.isRemote ? 'REMOTE' : jsonLd?.employmentType,
    descriptionSource,
  );
  if (employmentType)
    confidence.employmentType = jsonLd?.employmentType || jsonLd?.isRemote ? 0.8 : 0.4;

  const sections = splitJobSections(descriptionSource);
  const structuredResponsibilities = splitCommaOrLines(jsonLd?.responsibilities);
  const structuredRequirements = splitCommaOrLines(jsonLd?.qualifications);
  const structuredBenefits = splitCommaOrLines(jsonLd?.benefits);
  const structuredSkillsText = jsonLd?.skills ?? '';

  const responsibilities =
    structuredResponsibilities.length > 0 ? structuredResponsibilities : sections.responsibilities;
  const requirements =
    structuredRequirements.length > 0 ? structuredRequirements : sections.requirements;
  const benefits = structuredBenefits.length > 0 ? structuredBenefits : sections.benefits;
  const niceToHave = sections.niceToHave;

  if (responsibilities.length > 0)
    confidence.responsibilities = jsonLd?.responsibilities ? 0.75 : 0.5;
  if (requirements.length > 0) confidence.requirements = jsonLd?.qualifications ? 0.75 : 0.5;
  if (niceToHave.length > 0) confidence.niceToHave = 0.5;
  if (benefits.length > 0) confidence.benefits = jsonLd?.benefits ? 0.75 : 0.5;

  const skillScanText = `${descriptionSource} ${structuredSkillsText}`;
  const skills = detectSkills(skillScanText);
  if (skills.length > 0) confidence.skills = 0.55;

  const technologies = detectTechnologies(skillScanText);
  if (technologies.length > 0) confidence.technologies = 0.55;

  const languages = detectLanguages(descriptionSource);
  if (languages.length > 0) confidence.languages = 0.5;

  const seniority = normalizeSeniority(`${title ?? ''} ${descriptionSource}`);
  if (seniority) confidence.seniority = 0.5;

  const salaryFromJsonLd =
    jsonLd?.salaryMin || jsonLd?.salaryMax
      ? {
          min: jsonLd.salaryMin,
          max: jsonLd.salaryMax,
          currency: jsonLd.currency,
          period: normalizeSalaryUnitText(jsonLd.salaryUnitText),
        }
      : undefined;
  const salary = salaryFromJsonLd ?? parseSalaryFromText(descriptionSource);
  if (salary?.min || salary?.max) {
    confidence.salaryMin = salaryFromJsonLd ? 0.8 : 0.4;
    confidence.salaryMax = salaryFromJsonLd ? 0.8 : 0.4;
    if (salary.period) confidence.salaryPeriod = salaryFromJsonLd ? 0.75 : 0.4;
  }

  const experience = parseExperienceYears(`${requirements.join(' ')} ${descriptionSource}`);
  if (experience?.minYears !== undefined) confidence.experienceMinYears = 0.5;
  if (experience?.preferredYears !== undefined) confidence.experiencePreferredYears = 0.45;

  const educationLevel = parseEducationLevel(`${requirements.join(' ')} ${descriptionSource}`);
  if (educationLevel) confidence.educationLevel = 0.5;

  const data: ParsedJobData = {
    title,
    company,
    companyLogoUrl,
    location,
    employmentType,
    seniority,
    responsibilities,
    requirements,
    niceToHave,
    languages,
    benefits,
    skills,
    technologies,
    salaryMin: salary?.min,
    salaryMax: salary?.max,
    currency: salary?.currency,
    salaryPeriod: salary?.period,
    experienceMinYears: experience?.minYears,
    experiencePreferredYears: experience?.preferredYears,
    educationLevel,
    description: descriptionSource,
  };

  return { data, confidence };
}

function splitCommaOrLines(value: string | undefined): string[] {
  if (!value) return [];
  const parts = value.includes('\n') ? value.split('\n') : value.split(/,(?![^(]*\))/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
