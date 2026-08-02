export const RESUME_ENTITY_CHANGED_EVENT = 'resume.entity.changed';

// 'archived'/'status_changed' added in Phase 2B for JobTarget/Application;
// 'restored' added in Phase 3 for ResumeVariant — each finer-grained than
// 'updated' where the brief calls out a specific event name.
export type ResumeEntityAction =
  'created' | 'updated' | 'deleted' | 'archived' | 'status_changed' | 'restored';

/**
 * Generic domain event shared by Profile, MasterResume, every resume
 * section service (Work Experience, Education, Skills, ...), JobTarget/
 * Application (Phase 2B), and ResumeVariant (Phase 3). Per
 * docs/architecture/system-architecture.md §4, producing modules normally
 * own their own event classes — this one is a deliberate exception: many
 * services across the platform emit structurally identical "this owned
 * entity changed" facts, and HistoryListener is their only consumer, so one
 * shared, generic event avoids defining a near-duplicate class per entity
 * type for no behavioural difference.
 */
export class ResumeEntityChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly action: ResumeEntityAction,
    public readonly metadata?: Record<string, unknown>,
  ) {}
}
