import { Injectable } from '@nestjs/common';

export type FieldDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface FieldDiff {
  /** e.g. "summary" for a scalar field, or "workExperiences[2]" for an array item. */
  field: string;
  status: FieldDiffStatus;
  before?: unknown;
  after?: unknown;
}

export interface SectionDiff {
  /** Top-level content key — "summary", "workExperiences", "skills", etc. */
  section: string;
  /** 'unchanged' only when every field/item in this section is unchanged. */
  status: FieldDiffStatus;
  fields: FieldDiff[];
}

export interface ResumeVersionDiff {
  fromVersion: number;
  toVersion: number;
  sections: SectionDiff[];
  summary: { added: number; removed: number; changed: number; unchanged: number };
}

const SCALAR_KEYS = [
  'title',
  'summary',
  'careerLevel',
  'yearsExperience',
  'desiredPosition',
  'desiredSalary',
  'currency',
];

const ARRAY_KEYS = [
  'workExperiences',
  'educations',
  'skills',
  'languages',
  'certificates',
  'projects',
  'courses',
  'awards',
  'publications',
  'volunteerExperiences',
  'references',
];

/**
 * Section-by-section diffing of two ResumeVariant.content snapshots (rule
 * 4, "Compare versions" — "Highlight: Added / Removed / Changed"). Content
 * sections have no stable per-item id (stripped when snapshotted — see
 * resume-variant-snapshot.util.ts's `toSnapshotSection`), so array items
 * are matched by exact-content equality first (unchanged), then paired
 * positionally among the leftovers (changed), with any remaining surplus
 * on either side reported as added/removed. This is a real, deterministic,
 * documented limitation for reordered-without-editing items — see
 * docs/architecture/resume-version-history.md.
 */
@Injectable()
export class ResumeDiffService {
  compare(
    fromVersion: number,
    toVersion: number,
    oldContent: Record<string, unknown>,
    newContent: Record<string, unknown>,
  ): ResumeVersionDiff {
    const sections: SectionDiff[] = [];

    for (const key of SCALAR_KEYS) {
      sections.push(this.diffScalar(key, oldContent[key], newContent[key]));
    }
    for (const key of ARRAY_KEYS) {
      sections.push(
        this.diffArray(
          key,
          Array.isArray(oldContent[key]) ? (oldContent[key] as unknown[]) : [],
          Array.isArray(newContent[key]) ? (newContent[key] as unknown[]) : [],
        ),
      );
    }

    const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };
    for (const section of sections) {
      for (const field of section.fields) {
        summary[field.status] += 1;
      }
    }

    return { fromVersion, toVersion, sections, summary };
  }

  private diffScalar(key: string, before: unknown, after: unknown): SectionDiff {
    const status = this.scalarStatus(before, after);
    return { section: key, status, fields: [{ field: key, status, before, after }] };
  }

  private scalarStatus(before: unknown, after: unknown): FieldDiffStatus {
    const beforeEmpty = before === undefined || before === null;
    const afterEmpty = after === undefined || after === null;
    if (beforeEmpty && afterEmpty) return 'unchanged';
    if (beforeEmpty) return 'added';
    if (afterEmpty) return 'removed';
    return deepEqual(before, after) ? 'unchanged' : 'changed';
  }

  private diffArray(key: string, before: unknown[], after: unknown[]): SectionDiff {
    const beforeRemaining = before.map((item, index) => ({ item, index }));
    const afterRemaining = after.map((item, index) => ({ item, index }));
    const fields: FieldDiff[] = [];

    // Pass 1: exact-content matches are unchanged, removed from both pools.
    for (const b of [...beforeRemaining]) {
      const matchIndex = afterRemaining.findIndex((a) => deepEqual(a.item, b.item));
      if (matchIndex !== -1) {
        fields.push({
          field: `${key}[${b.index}]`,
          status: 'unchanged',
          before: b.item,
          after: b.item,
        });
        beforeRemaining.splice(beforeRemaining.indexOf(b), 1);
        afterRemaining.splice(matchIndex, 1);
      }
    }

    // Pass 2: pair up positionally among what's left — "changed".
    const pairCount = Math.min(beforeRemaining.length, afterRemaining.length);
    for (let i = 0; i < pairCount; i += 1) {
      const b = beforeRemaining[i];
      const a = afterRemaining[i];
      if (!b || !a) continue;
      fields.push({
        field: `${key}[${b.index}]`,
        status: 'changed',
        before: b.item,
        after: a.item,
      });
    }

    // Pass 3: leftovers are pure additions/removals.
    for (const b of beforeRemaining.slice(pairCount)) {
      fields.push({
        field: `${key}[${b.index}]`,
        status: 'removed',
        before: b.item,
        after: undefined,
      });
    }
    for (const a of afterRemaining.slice(pairCount)) {
      fields.push({
        field: `${key}[${a.index}]`,
        status: 'added',
        before: undefined,
        after: a.item,
      });
    }

    const status: FieldDiffStatus = fields.every((f) => f.status === 'unchanged')
      ? 'unchanged'
      : fields.some((f) => f.status === 'added')
        ? fields.some((f) => f.status === 'removed' || f.status === 'changed')
          ? 'changed'
          : 'added'
        : fields.some((f) => f.status === 'removed')
          ? 'removed'
          : 'changed';

    return { section: key, status, fields };
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
