'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Building2, Plus, Target } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { JobTargetForm } from '@/components/job-targets/job-target-form';
import { useJobTargets, useCreateJobTarget } from '@/lib/api/job-targets';
import { jobTargetFormToPayload, type JobTargetFormInput } from '@/lib/validation/job-target';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';

export default function JobTargetsPage() {
  const { data: jobTargets, isLoading, isError, refetch } = useJobTargets();
  const createJobTarget = useCreateJobTarget();
  const [createOpen, setCreateOpen] = useState(false);

  async function handleCreate(values: JobTargetFormInput) {
    try {
      await createJobTarget.mutateAsync(jobTargetFormToPayload(values));
      toast.success('Vaga alvo criada.');
      setCreateOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar a vaga.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Vagas Alvo"
        description="Guarde as vagas às quais se está a candidatar para as comparar com o seu currículo."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova vaga
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !jobTargets || jobTargets.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma vaga alvo"
          description="Adicione a primeira vaga que pretende candidatar-se."
          action={<Button onClick={() => setCreateOpen(true)}>Nova vaga</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobTargets.map((jobTarget) => (
            <Link key={jobTarget.id} href={`/dashboard/job-targets/${jobTarget.id}`}>
              <Card className="h-full transition-shadow hover:shadow-elevation-2">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 font-medium">{jobTarget.title}</p>
                    <StatusBadge status={jobTarget.status} className="shrink-0" />
                  </div>
                  {jobTarget.company && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {jobTarget.company}
                      {jobTarget.location && ` · ${jobTarget.location}`}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {jobTarget.keywords.length} palavras-chave · {jobTarget.skills.length}{' '}
                    competências
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Criado {formatRelativeTime(jobTarget.createdAt)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova vaga alvo</DialogTitle>
          </DialogHeader>
          <JobTargetForm
            submitLabel="Criar vaga"
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
