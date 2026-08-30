'use client';

import { useMemo } from 'react';
import { GitCompare, Plus, ShieldAlert, ShieldCheck, ShieldQuestion, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfidenceBadge } from './ConfidenceBadge';
import { SectionChecklist } from './SectionChecklist';
import { computeSectionStatuses } from '@/lib/cv-import/section-status';
import { getEntryConfidenceTier, type ConfidenceTier } from '@/lib/cv-import/confidence';
import type {
  CvDraftMeta,
  CvFieldConfidence,
  CvMergeDecision,
  CvMergeResolution,
  ExtractedAward,
  ExtractedCvData,
  ExtractedCertificate,
  ExtractedEducation,
  ExtractedLanguage,
  ExtractedProject,
  ExtractedReference,
  ExtractedSkill,
  ExtractedVolunteerExperience,
  ExtractedWorkExperience,
  MergeEntryResult,
  MergePreview,
} from '@/lib/api/cv-import';

const ENTRY_CONFIDENCE_CONFIG: Record<
  ConfidenceTier,
  { icon: typeof ShieldCheck; label: string; className: string }
> = {
  high: { icon: ShieldCheck, label: 'Confiança alta', className: 'text-success' },
  medium: { icon: ShieldQuestion, label: 'Confiança média', className: 'text-warning' },
  low: { icon: ShieldAlert, label: 'Confiança baixa', className: 'text-destructive' },
};

/**
 * FASE 6 audit (2026-08-12) — shows one entry's confidence/source/warnings/
 * source quote, computed deterministically by the backend parser (never
 * fabricated — see `CvDraftMeta`'s doc comment). Renders nothing for an
 * entry with no draft metadata at all — e.g. one the user just added via "+
 * Adicionar", which has no confidence to report because it doesn't come
 * from the document.
 */
function EntryDraftInfo({ confidence, source, sourceText, warnings }: CvDraftMeta) {
  const tier = getEntryConfidenceTier(confidence);
  const hasWarnings = (warnings?.length ?? 0) > 0;
  if (!tier && !sourceText && !hasWarnings) return null;

  const tierConfig = tier ? ENTRY_CONFIDENCE_CONFIG[tier] : undefined;
  return (
    <div className="space-y-1.5 border-b border-border pb-2">
      <div className="flex flex-wrap items-center gap-2">
        {tierConfig && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${tierConfig.className}`}
          >
            <tierConfig.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tierConfig.label}
          </span>
        )}
        {source === 'fallback' && (
          <Badge variant="outline" className="text-xs font-normal">
            Recuperado automaticamente
          </Badge>
        )}
      </div>
      {hasWarnings && (
        <ul className="list-inside list-disc text-xs text-warning">
          {warnings!.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {sourceText && (
        <p className="text-xs italic text-muted-foreground">Fonte: &quot;{sourceText}&quot;</p>
      )}
    </div>
  );
}

export interface CvImportReviewProps {
  value: ExtractedCvData;
  onChange: (next: ExtractedCvData) => void;
  fieldConfidence: CvFieldConfidence | null | undefined;
  /**
   * FASE 7 audit (2026-08-12) — the same read-only classification the
   * existing-resume-choice screen's aggregate counts come from
   * (`useMergePreview()`). When present, every entry the backend flagged as
   * a `possible_duplicate` gets an inline "Existente vs Importado" diff with
   * an explicit Manter existente/Usar importado/Mesclar choice, instead of
   * only the aggregate "N possíveis duplicados" count shown before review.
   */
  mergePreview?: MergePreview;
}

/** Builds a `existingSectionId -> existing entry` lookup from one section's `MergeEntryResult[]`, so the diff banner below can find the matched row regardless of how the user has since reordered/removed OTHER entries. */
function buildExistingLookup<T>(results: MergeEntryResult<T>[] | undefined): Map<string, T> {
  const map = new Map<string, T>();
  for (const result of results ?? []) {
    if (result.existingId && result.existing) map.set(result.existingId, result.existing);
  }
  return map;
}

const MERGE_DECISION_LABELS: Record<CvMergeDecision, string> = {
  keep_existing: 'Manter existente',
  use_imported: 'Usar importado',
  merge: 'Mesclar',
};

/**
 * FASE 7 audit — rendered above an entry's fields when it matched an
 * existing Master Resume section row. Shows a one-line summary of both
 * sides (the exact "Existente: ... / Importado: ..." shape from the brief)
 * and lets the user pick how `CvImportService.confirm()` should resolve it;
 * the choice is stored on the entry itself (`mergeDecision`) and sent back
 * as-is on confirm. No choice made (`decision` undefined) falls back to the
 * pre-existing default behavior — create as a new entry.
 */
function MergeDecisionBanner({
  existingSummary,
  importedSummary,
  decision,
  onDecide,
}: {
  existingSummary: string;
  importedSummary: string;
  decision: CvMergeDecision | undefined;
  onDecide: (decision: CvMergeDecision) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-warning">
        <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
        Possível duplicado — já existe uma entrada semelhante no seu Currículo Principal
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Existente</p>
          <p className="text-foreground">{existingSummary}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Importado</p>
          <p className="text-foreground">{importedSummary}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {(Object.keys(MERGE_DECISION_LABELS) as CvMergeDecision[]).map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={decision === option ? 'default' : 'outline'}
            onClick={() => onDecide(option)}
          >
            {MERGE_DECISION_LABELS[option]}
          </Button>
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  confidenceKey,
  fieldConfidence,
  children,
}: {
  label: string;
  confidenceKey?: string;
  fieldConfidence?: CvFieldConfidence | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {confidenceKey && <ConfidenceBadge confidence={fieldConfidence} field={confidenceKey} />}
      </div>
      {children}
    </div>
  );
}

const orDash = (s: string) => s || '(sem título)';
const summarizeWorkExperience = (e: ExtractedWorkExperience) =>
  orDash([e.position, e.company].filter(Boolean).join(' — '));
const summarizeEducation = (e: ExtractedEducation) =>
  orDash([e.degree, e.institution].filter(Boolean).join(' — '));
const summarizeSkill = (e: ExtractedSkill) => orDash(e.name ?? '');
const summarizeLanguage = (e: ExtractedLanguage) =>
  orDash([e.language, e.proficiency].filter(Boolean).join(' — '));
const summarizeCertificate = (e: ExtractedCertificate) =>
  orDash([e.title, e.issuer].filter(Boolean).join(' — '));
const summarizeProject = (e: ExtractedProject) => orDash(e.title ?? '');
const summarizeAward = (e: ExtractedAward) =>
  orDash([e.title, e.issuer].filter(Boolean).join(' — '));
const summarizeVolunteer = (e: ExtractedVolunteerExperience) =>
  orDash([e.role, e.organization].filter(Boolean).join(' — '));
const summarizeReference = (e: ExtractedReference) =>
  orDash([e.name, e.company].filter(Boolean).join(' — '));

/**
 * FASE 6 audit — shown instead of the generic "Nada encontrado" when a
 * section came back completely empty, per the brief's exact wording. The
 * user is never blocked from confirming because of an empty section — the
 * "+ Adicionar" button (rendered separately, always available whether the
 * section is empty or not) is the way forward, not a required step.
 */
function EmptySectionNotice() {
  return (
    <div className="space-y-0.5 text-sm text-muted-foreground">
      <p>Não encontramos informações nesta secção.</p>
      <p>Pode adicionar manualmente.</p>
    </div>
  );
}

/**
 * FASE 6 audit — one blank entry appended to the draft, client-side only
 * (nothing is written to the Master Resume until "Confirmar e importar").
 * A manually-added entry deliberately carries no `CvDraftMeta` — no
 * confidence/source/sourceText/warnings — since none of that describes
 * something the parser found; `EntryDraftInfo` already renders nothing for
 * an entry with no draft metadata at all, so this needs no special-casing
 * elsewhere.
 */
function AddEntryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
}

function EntryCard({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="relative space-y-3 rounded-md border border-border p-4">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {children}
    </div>
  );
}

/**
 * The Step 9 "Review Screen" — the parser output is never written to the
 * Master Resume until the user explicitly confirms (Step 10). Every field
 * here is editable in place; every array entry can be removed. Controlled
 * component: the parent (app/dashboard/import-cv/page.tsx) owns the state
 * and sends the edited object straight back as the confirm() body.
 */
export function CvImportReview({
  value,
  onChange,
  fieldConfidence,
  mergePreview,
}: CvImportReviewProps) {
  function set<K extends keyof ExtractedCvData>(key: K, next: ExtractedCvData[K]) {
    onChange({ ...value, [key]: next });
  }

  function setPersonalData(patch: Partial<ExtractedCvData['personalData']>) {
    set('personalData', { ...value.personalData, ...patch });
  }

  function updateList<T>(key: keyof ExtractedCvData, index: number, patch: Partial<T>) {
    const list = (value[key] as unknown as T[]) ?? [];
    const next = list.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange({ ...value, [key]: next as never });
  }

  function removeFromList(key: keyof ExtractedCvData, index: number) {
    const list = (value[key] as unknown as unknown[]) ?? [];
    onChange({ ...value, [key]: list.filter((_, i) => i !== index) as never });
  }

  /** FASE 6 audit — appends one blank entry to the section's array. Client-side only, part of the draft the user is still editing. */
  function addEntry(key: keyof ExtractedCvData, blank: object) {
    const list = (value[key] as unknown as unknown[]) ?? [];
    onChange({ ...value, [key]: [...list, blank] as never });
  }

  // FASE 7 audit — one existingSectionId->existing lookup per section type,
  // rebuilt only when the merge preview itself changes (not on every
  // keystroke while editing a field).
  const existingLookups = useMemo(
    () => ({
      workExperiences: buildExistingLookup(mergePreview?.workExperiences),
      educations: buildExistingLookup(mergePreview?.educations),
      skills: buildExistingLookup(mergePreview?.skills),
      languages: buildExistingLookup(mergePreview?.languages),
      certificates: buildExistingLookup(mergePreview?.certificates),
      projects: buildExistingLookup(mergePreview?.projects),
      awards: buildExistingLookup(mergePreview?.awards),
      volunteerExperiences: buildExistingLookup(mergePreview?.volunteerExperiences),
      references: buildExistingLookup(mergePreview?.references),
    }),
    [mergePreview],
  );

  /** Renders the diff banner for one entry, or nothing if it was never flagged as a possible duplicate (no existingSectionId, or the preview hasn't loaded). */
  function renderMergeBanner<T extends CvMergeResolution>(
    sectionKey: keyof typeof existingLookups,
    entry: T,
    index: number,
    summarize: (e: T) => string,
  ) {
    if (!entry.existingSectionId) return null;
    const existing = existingLookups[sectionKey].get(entry.existingSectionId) as T | undefined;
    if (!existing) return null;
    return (
      <MergeDecisionBanner
        existingSummary={summarize(existing)}
        importedSummary={summarize(entry)}
        decision={entry.mergeDecision}
        onDecide={(decision) =>
          updateList<T>(sectionKey, index, { mergeDecision: decision } as Partial<T>)
        }
      />
    );
  }

  // FASE 6 audit — recomputed whenever the reviewable data or its
  // personalData/summary confidence scores change (edits happen constantly
  // while the user reviews, so this must stay cheap and pure — see
  // computeSectionStatuses()'s own doc comment for why an empty section is
  // never reported as "found").
  const sectionStatuses = useMemo(
    () => computeSectionStatuses(value, fieldConfidence),
    [value, fieldConfidence],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo da importação</CardTitle>
        </CardHeader>
        <CardContent>
          <SectionChecklist items={sectionStatuses} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações pessoais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldRow
            label="Nome completo"
            confidenceKey="personalData.fullName"
            fieldConfidence={fieldConfidence}
          >
            <Input
              value={value.personalData.fullName ?? ''}
              onChange={(e) => setPersonalData({ fullName: e.target.value })}
            />
          </FieldRow>
          <FieldRow
            label="Email"
            confidenceKey="personalData.email"
            fieldConfidence={fieldConfidence}
          >
            <Input
              value={value.personalData.email ?? ''}
              onChange={(e) => setPersonalData({ email: e.target.value })}
            />
          </FieldRow>
          <FieldRow
            label="Telefone"
            confidenceKey="personalData.phone"
            fieldConfidence={fieldConfidence}
          >
            <Input
              value={value.personalData.phone ?? ''}
              onChange={(e) => setPersonalData({ phone: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Cidade">
            <Input
              value={value.personalData.city ?? ''}
              onChange={(e) => setPersonalData({ city: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="País">
            <Input
              value={value.personalData.country ?? ''}
              onChange={(e) => setPersonalData({ country: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="Morada">
            <Input
              value={value.personalData.address ?? ''}
              onChange={(e) => setPersonalData({ address: e.target.value })}
            />
          </FieldRow>
          <FieldRow
            label="LinkedIn"
            confidenceKey="personalData.linkedin"
            fieldConfidence={fieldConfidence}
          >
            <Input
              value={value.personalData.linkedin ?? ''}
              onChange={(e) => setPersonalData({ linkedin: e.target.value })}
            />
          </FieldRow>
          <FieldRow
            label="GitHub"
            confidenceKey="personalData.github"
            fieldConfidence={fieldConfidence}
          >
            <Input
              value={value.personalData.github ?? ''}
              onChange={(e) => setPersonalData({ github: e.target.value })}
            />
          </FieldRow>
          <FieldRow
            label="Website"
            confidenceKey="personalData.website"
            fieldConfidence={fieldConfidence}
          >
            <Input
              value={value.personalData.website ?? ''}
              onChange={(e) => setPersonalData({ website: e.target.value })}
            />
          </FieldRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={value.summary ?? ''}
            onChange={(e) => set('summary', e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Experiência profissional ({value.workExperiences.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.workExperiences.length === 0 && <EmptySectionNotice />}
          {value.workExperiences.map((exp, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('workExperiences', i)}>
              {renderMergeBanner('workExperiences', exp, i, summarizeWorkExperience)}
              <EntryDraftInfo {...exp} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Cargo">
                  <Input
                    value={exp.position ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedWorkExperience>('workExperiences', i, {
                        position: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <FieldRow label="Empresa">
                  <Input
                    value={exp.company ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedWorkExperience>('workExperiences', i, {
                        company: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <FieldRow label="Data de início">
                  <Input
                    value={exp.startDate ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedWorkExperience>('workExperiences', i, {
                        startDate: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <FieldRow label="Data de fim">
                  <Input
                    value={exp.endDate ?? ''}
                    disabled={exp.currentlyWorking}
                    placeholder={exp.currentlyWorking ? 'Atual' : undefined}
                    onChange={(e) =>
                      updateList<ExtractedWorkExperience>('workExperiences', i, {
                        endDate: e.target.value,
                      })
                    }
                  />
                </FieldRow>
              </div>
              <FieldRow label="Descrição">
                <Textarea
                  rows={2}
                  value={exp.description ?? ''}
                  onChange={(e) =>
                    updateList<ExtractedWorkExperience>('workExperiences', i, {
                      description: e.target.value,
                    })
                  }
                />
              </FieldRow>
            </EntryCard>
          ))}
          <AddEntryButton
            label="Adicionar experiência"
            onClick={() => addEntry('workExperiences', { currentlyWorking: false })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Educação ({value.educations.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.educations.length === 0 && <EmptySectionNotice />}
          {value.educations.map((edu, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('educations', i)}>
              {renderMergeBanner('educations', edu, i, summarizeEducation)}
              <EntryDraftInfo {...edu} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Instituição">
                  <Input
                    value={edu.institution ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedEducation>('educations', i, {
                        institution: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <FieldRow label="Grau">
                  <Input
                    value={edu.degree ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedEducation>('educations', i, { degree: e.target.value })
                    }
                  />
                </FieldRow>
              </div>
            </EntryCard>
          ))}
          <AddEntryButton label="Adicionar formação" onClick={() => addEntry('educations', {})} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Competências ({value.skills.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.skills.length === 0 && <EmptySectionNotice />}
          {value.skills.some((s) => (s.warnings?.length ?? 0) > 0) && (
            <ul className="list-inside list-disc text-xs text-warning">
              {value.skills
                .flatMap((s) => s.warnings ?? [])
                .filter((w, i, all) => all.indexOf(w) === i)
                .map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
            </ul>
          )}
          {value.skills.some((s) => s.existingSectionId) && (
            <div className="space-y-2">
              {value.skills.map(
                (skill, i) =>
                  skill.existingSectionId && (
                    // eslint-disable-next-line react/no-array-index-key
                    <div key={i}>{renderMergeBanner('skills', skill, i, summarizeSkill)}</div>
                  ),
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {value.skills.map((skill, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div
                key={i}
                className="flex items-center gap-1 rounded-full border border-border py-1 pl-3 pr-1"
              >
                <Input
                  className="h-6 w-28 border-none p-0 shadow-none focus-visible:ring-0"
                  value={skill.name ?? ''}
                  onChange={(e) =>
                    updateList<ExtractedSkill>('skills', i, { name: e.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeFromList('skills', i)}
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <AddEntryButton
            label="Adicionar competência"
            onClick={() => addEntry('skills', { name: '' })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Idiomas ({value.languages.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.languages.length === 0 && <EmptySectionNotice />}
          {value.languages.map((lang, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('languages', i)}>
              {renderMergeBanner('languages', lang, i, summarizeLanguage)}
              <EntryDraftInfo {...lang} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Idioma">
                  <Input
                    value={lang.language ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedLanguage>('languages', i, { language: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Proficiência">
                  <Input
                    value={lang.proficiency ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedLanguage>('languages', i, { proficiency: e.target.value })
                    }
                  />
                </FieldRow>
              </div>
            </EntryCard>
          ))}
          <AddEntryButton
            label="Adicionar idioma"
            onClick={() => addEntry('languages', { language: '' })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Certificações ({value.certificates.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.certificates.length === 0 && <EmptySectionNotice />}
          {value.certificates.map((cert, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('certificates', i)}>
              {renderMergeBanner('certificates', cert, i, summarizeCertificate)}
              <EntryDraftInfo {...cert} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Título">
                  <Input
                    value={cert.title ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedCertificate>('certificates', i, { title: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Emissor">
                  <Input
                    value={cert.issuer ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedCertificate>('certificates', i, {
                        issuer: e.target.value,
                      })
                    }
                  />
                </FieldRow>
              </div>
            </EntryCard>
          ))}
          <AddEntryButton
            label="Adicionar certificado"
            onClick={() => addEntry('certificates', {})}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projetos ({value.projects.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.projects.length === 0 && <EmptySectionNotice />}
          {value.projects.map((project, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('projects', i)}>
              {renderMergeBanner('projects', project, i, summarizeProject)}
              <EntryDraftInfo {...project} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Título">
                  <Input
                    value={project.title ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedProject>('projects', i, { title: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="URL">
                  <Input
                    value={project.url ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedProject>('projects', i, { url: e.target.value })
                    }
                  />
                </FieldRow>
              </div>
              <FieldRow label="Descrição">
                <Textarea
                  rows={2}
                  value={project.description ?? ''}
                  onChange={(e) =>
                    updateList<ExtractedProject>('projects', i, { description: e.target.value })
                  }
                />
              </FieldRow>
            </EntryCard>
          ))}
          <AddEntryButton label="Adicionar projeto" onClick={() => addEntry('projects', {})} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prémios ({value.awards.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.awards.length === 0 && <EmptySectionNotice />}
          {value.awards.map((award, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('awards', i)}>
              {renderMergeBanner('awards', award, i, summarizeAward)}
              <EntryDraftInfo {...award} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Título">
                  <Input
                    value={award.title ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedAward>('awards', i, { title: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Entidade">
                  <Input
                    value={award.issuer ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedAward>('awards', i, { issuer: e.target.value })
                    }
                  />
                </FieldRow>
              </div>
            </EntryCard>
          ))}
          <AddEntryButton label="Adicionar prémio" onClick={() => addEntry('awards', {})} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Voluntariado ({value.volunteerExperiences.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.volunteerExperiences.length === 0 && <EmptySectionNotice />}
          {value.volunteerExperiences.map((entry, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('volunteerExperiences', i)}>
              {renderMergeBanner('volunteerExperiences', entry, i, summarizeVolunteer)}
              <EntryDraftInfo {...entry} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Função">
                  <Input
                    value={entry.role ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedVolunteerExperience>('volunteerExperiences', i, {
                        role: e.target.value,
                      })
                    }
                  />
                </FieldRow>
                <FieldRow label="Organização">
                  <Input
                    value={entry.organization ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedVolunteerExperience>('volunteerExperiences', i, {
                        organization: e.target.value,
                      })
                    }
                  />
                </FieldRow>
              </div>
              <FieldRow label="Descrição">
                <Textarea
                  rows={2}
                  value={entry.description ?? ''}
                  onChange={(e) =>
                    updateList<ExtractedVolunteerExperience>('volunteerExperiences', i, {
                      description: e.target.value,
                    })
                  }
                />
              </FieldRow>
            </EntryCard>
          ))}
          <AddEntryButton
            label="Adicionar experiência de voluntariado"
            onClick={() => addEntry('volunteerExperiences', { currentlyVolunteering: false })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referências ({value.references.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.references.length === 0 && <EmptySectionNotice />}
          {value.references.map((reference, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <EntryCard key={i} onRemove={() => removeFromList('references', i)}>
              {renderMergeBanner('references', reference, i, summarizeReference)}
              <EntryDraftInfo {...reference} />
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldRow label="Nome">
                  <Input
                    value={reference.name ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedReference>('references', i, { name: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Empresa">
                  <Input
                    value={reference.company ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedReference>('references', i, { company: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Email">
                  <Input
                    value={reference.email ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedReference>('references', i, { email: e.target.value })
                    }
                  />
                </FieldRow>
                <FieldRow label="Telefone">
                  <Input
                    value={reference.phone ?? ''}
                    onChange={(e) =>
                      updateList<ExtractedReference>('references', i, { phone: e.target.value })
                    }
                  />
                </FieldRow>
              </div>
            </EntryCard>
          ))}
          <AddEntryButton label="Adicionar referência" onClick={() => addEntry('references', {})} />
        </CardContent>
      </Card>
    </div>
  );
}
