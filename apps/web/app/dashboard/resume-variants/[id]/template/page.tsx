'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { VariantTemplateSection } from '@/components/resume-variants/variant-template-section';
import { useResumeVariant } from '@/lib/api/resume-variants';

/**
 * Standalone deep link to the template/theme workspace — kept working for
 * bookmarks and direct links. The same workspace is also embedded as a tab
 * on /dashboard/resume-variants/[id] via the shared VariantTemplateSection;
 * see docs/architecture/resume-variant-workspace.md.
 */
export default function ResumeVariantTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: variant } = useResumeVariant(id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modelo e Aparência"
        description={variant?.title}
        breadcrumbs={[
          { label: 'Versões do Currículo', href: '/dashboard/resume-variants' },
          { label: variant?.title ?? '…', href: `/dashboard/resume-variants/${id}` },
          { label: 'Modelo' },
        ]}
        actions={
          <Button variant="outline" onClick={() => router.push(`/dashboard/resume-variants/${id}`)}>
            Voltar
          </Button>
        }
      />

      <VariantTemplateSection variantId={id} />
    </div>
  );
}
