'use client';

import { Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/format';
import { ResumePreview } from '@/components/template-engine/ResumePreview';
import type { MasterResume } from '@/lib/api/master-resume';
import type { Profile } from '@/lib/api/profile';

export interface ResumeOverviewCardProps {
  resume: MasterResume;
  profile: Profile | null | undefined;
  content: Record<string, unknown>;
  onOpen: () => void;
}

/**
 * The "click to open the editor" card the user asked for (a real, live-
 * rendered miniature of the actual Master Resume — reusing the Template
 * Engine's own ResumePreview, not a static placeholder — instead of landing
 * straight on a long page of stacked section forms). Deliberately a SINGLE
 * card, not a gallery of many: CVLab keeps exactly one Master Resume per
 * user (the single source of truth every Resume Variant is built from) —
 * this is a visual entry point into that one resume, not a second resume-
 * management surface.
 */
export function ResumeOverviewCard({ resume, profile, content, onOpen }: ResumeOverviewCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex max-w-sm cursor-pointer flex-col overflow-hidden transition-shadow hover:shadow-elevation-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Abrir editor de ${resume.title || 'Currículo Principal'}`}
    >
      <div className="relative h-64 overflow-hidden border-b border-border bg-muted/30">
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: 794, transform: 'scale(0.33)' }}
        >
          <ResumePreview content={content} profile={profile} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition-opacity group-hover:bg-foreground/5 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-medium shadow-elevation-1">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{resume.title || 'Currículo Principal'}</p>
          <p className="text-sm text-muted-foreground">
            Editado {formatRelativeTime(resume.updatedAt)}
          </p>
        </div>
      </div>
    </Card>
  );
}
