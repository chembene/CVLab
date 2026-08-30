import {
  ARRAY_SECTION_PRIMARY_FIELD,
  SECTION_CONTENT_KEY,
  isSupportedOptimizationSection,
} from './supported-sections';

export interface SuggestionToApply {
  id: string;
  section: string;
  originalText: string | null;
  suggestedText: string;
}

export interface ApplyResult {
  /** A full copy of the input content with only accepted, supported suggestions applied — the caller's original object is never mutated. */
  updatedContent: Record<string, unknown>;
  /** Suggestion IDs actually written into updatedContent. */
  appliedSuggestionIds: string[];
  /** Suggestion IDs that were accepted but targeted a section this engine doesn't know how to write to — accepted without applied, per the schema's "applied implies accepted, never the reverse" rule. */
  skippedSuggestionIds: string[];
}

/**
 * The Apply Engine (this phase's brief: "Update ONLY accepted suggestions.
 * Never overwrite untouched sections."). Pure and synchronous — the caller
 * (ResumeOptimizationService.apply()) is responsible for the transaction and
 * for actually persisting `updatedContent` via ResumeVariantRepository.
 *
 * For the scalar `summary` section, applying a suggestion replaces
 * `content.summary` outright. For the 7 array sections, it looks for an
 * existing entry whose primary text field contains the suggestion's
 * `originalText` and replaces that field; if no match is found (including
 * when `originalText` is empty, meaning "this is a new addition"), it
 * appends a new minimal entry instead. Every other key on `content`, and
 * every other entry within a touched array, is copied through unchanged.
 */
export class ResumeSuggestionApplier {
  static apply(content: Record<string, unknown>, suggestions: SuggestionToApply[]): ApplyResult {
    const updatedContent = structuredClone(content);
    const appliedSuggestionIds: string[] = [];
    const skippedSuggestionIds: string[] = [];

    for (const suggestion of suggestions) {
      if (!isSupportedOptimizationSection(suggestion.section)) {
        skippedSuggestionIds.push(suggestion.id);
        continue;
      }

      if (suggestion.section === 'summary') {
        updatedContent.summary = suggestion.suggestedText;
        appliedSuggestionIds.push(suggestion.id);
        continue;
      }

      const contentKey = SECTION_CONTENT_KEY[suggestion.section];
      const primaryField = ARRAY_SECTION_PRIMARY_FIELD[suggestion.section];
      const existingArray = Array.isArray(updatedContent[contentKey])
        ? (updatedContent[contentKey] as Record<string, unknown>[])
        : [];
      const entries = [...existingArray];

      const matchIndex = suggestion.originalText
        ? entries.findIndex((entry) => {
            const fieldValue = entry[primaryField];
            return (
              typeof fieldValue === 'string' &&
              fieldValue.includes(suggestion.originalText as string)
            );
          })
        : -1;

      if (matchIndex !== -1) {
        entries[matchIndex] = { ...entries[matchIndex], [primaryField]: suggestion.suggestedText };
      } else {
        entries.push({ [primaryField]: suggestion.suggestedText });
      }

      updatedContent[contentKey] = entries;
      appliedSuggestionIds.push(suggestion.id);
    }

    return { updatedContent, appliedSuggestionIds, skippedSuggestionIds };
  }
}
