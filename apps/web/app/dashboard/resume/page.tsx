'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, FileText, UploadCloud } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SectionManager } from '@/components/section-manager';
import { ResumeOverviewCard } from '@/components/resume/ResumeOverviewCard';
import { SECTION_CONFIGS, SECTION_ORDER, type SectionType } from '@/lib/section-fields';
import {
  useMasterResume,
  useCreateMasterResume,
  useUpdateMasterResume,
  useSection,
} from '@/lib/api/master-resume';
import { useProfile } from '@/lib/api/profile';
import { masterResumeSchema, type MasterResumeFormInput } from '@/lib/validation/master-resume';
import { ApiError } from '@/lib/api-client';

/** `SectionType` (kebab-case, matches the API route segment) -> the camelCase key ResumeLayout's renderers expect in `content`. */
const CONTENT_KEYS: Record<SectionType, string> = {
  'work-experience': 'workExperiences',
  education: 'educations',
  skills: 'skills',
  languages: 'languages',
  certificates: 'certificates',
  projects: 'projects',
  courses: 'courses',
  awards: 'awards',
  publications: 'publications',
  'volunteer-experience': 'volunteerExperiences',
  references: 'references',
};

/** Every section tab after "Resumo" — grouped to match the reference layout's tab bar (a handful up front, the rest need not crowd the bar). */
const PRIMARY_TABS: SectionType[] = [
  'work-experience',
  'education',
  'skills',
  'languages',
  'certificates',
  'projects',
];
const MORE_TABS: SectionType[] = SECTION_ORDER.filter((t) => !PRIMARY_TABS.includes(t));

export default function ResumePage() {
  const { data: resume, isLoading } = useMasterResume();
  const { data: profile } = useProfile();
  const createResume = useCreateMasterResume();
  const updateResume = useUpdateMasterResume();
  const [view, setView] = useState<'overview' | 'editor'>('overview');

  // Every section's data, fetched once at page level — shares the exact
  // same react-query cache key SectionManager itself uses
  // (['resume-section', type]), so this never doubles up network requests;
  // it's only needed to compose the live preview card's `content` object.
  // SECTION_ORDER is a fixed, compile-time-known list, so calling one hook
  // per entry here (rather than inside a .map() callback) keeps the hook
  // call order stable across renders, as React's rules of hooks require.
  const workExperience = useSection('work-experience');
  const education = useSection('education');
  const skills = useSection('skills');
  const languages = useSection('languages');
  const certificates = useSection('certificates');
  const projects = useSection('projects');
  const courses = useSection('courses');
  const awards = useSection('awards');
  const publications = useSection('publications');
  const volunteerExperience = useSection('volunteer-experience');
  const references = useSection('references');
  const sections: Record<SectionType, ReturnType<typeof useSection>> = {
    'work-experience': workExperience,
    education,
    skills,
    languages,
    certificates,
    projects,
    courses,
    awards,
    publications,
    'volunteer-experience': volunteerExperience,
    references,
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<MasterResumeFormInput>({ resolver: zodResolver(masterResumeSchema) });

  useEffect(() => {
    if (resume) {
      reset({
        title: resume.title ?? '',
        summary: resume.summary ?? '',
        careerLevel: resume.careerLevel ?? '',
        yearsExperience: resume.yearsExperience != null ? String(resume.yearsExperience) : '',
        desiredPosition: resume.desiredPosition ?? '',
        desiredSalary: resume.desiredSalary != null ? String(resume.desiredSalary) : '',
        currency: resume.currency ?? 'MZN',
        visibility: resume.visibility ?? 'PRIVATE',
        status: resume.status ?? 'DRAFT',
      });
    }
  }, [resume, reset]);

  async function handleCreate() {
    try {
      await createResume.mutateAsync({});
      toast.success('Currículo mestre criado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar o currículo.');
    }
  }

  async function onSubmit(values: MasterResumeFormInput) {
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v === '' ? undefined : v]),
      );
      await updateResume.mutateAsync(payload);
      toast.success('Currículo guardado com sucesso.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível guardar o currículo.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!resume) {
    return (
      <div>
        <PageHeader
          title="Currículo Principal"
          description="A base de todas as suas candidaturas."
        />
        <EmptyState
          icon={FileText}
          title="Comece o seu currículo principal"
          description="Reúna toda a sua informação profissional num único lugar. Versões específicas para vagas são criadas a partir deste currículo."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/dashboard/import-cv">
                  <UploadCloud className="h-4 w-4" />
                  Importar CV
                </Link>
              </Button>
              <Button onClick={handleCreate} loading={createResume.isPending}>
                Preencher manualmente
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // Composed once from the same section queries the editor tabs use — see
  // components/template-engine/layouts/ResumeLayout.tsx for the exact key
  // names this must match.
  const previewContent: Record<string, unknown> = {
    title: resume.title,
    summary: resume.summary,
    ...Object.fromEntries(
      SECTION_ORDER.map((type) => [CONTENT_KEYS[type], sections[type].data ?? []]),
    ),
  };

  if (view === 'overview') {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Currículo Principal"
          description="A base de todas as suas candidaturas — versões específicas são criadas a partir daqui."
          actions={
            <div className="flex w-40 flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Completo</span>
                <span>{resume.completionPercentage}%</span>
              </div>
              <Progress value={resume.completionPercentage} />
            </div>
          }
        />
        <ResumeOverviewCard
          resume={resume}
          profile={profile}
          content={previewContent}
          onOpen={() => setView('editor')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={resume.title || 'Currículo Principal'}
        description="Edite qualquer secção — o modelo de apresentação escolhido preenche-se automaticamente."
        actions={
          <Button variant="outline" onClick={() => setView('overview')}>
            <ArrowLeft className="h-4 w-4" />
            Voltar à pré-visualização
          </Button>
        }
      />

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="summary">Resumo</TabsTrigger>
          {PRIMARY_TABS.map((type) => (
            <TabsTrigger key={type} value={type}>
              {SECTION_CONFIGS[type].label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="more">Mais secções</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Título do currículo</Label>
                  <Input id="title" {...register('title')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="summary">Resumo profissional</Label>
                  <Textarea id="summary" rows={4} {...register('summary')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="careerLevel">Nível de carreira</Label>
                    <Input id="careerLevel" {...register('careerLevel')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="yearsExperience">Anos de experiência</Label>
                    <Input id="yearsExperience" type="number" {...register('yearsExperience')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desiredPosition">Cargo pretendido</Label>
                  <Input id="desiredPosition" {...register('desiredPosition')} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="desiredSalary">Salário pretendido</Label>
                    <Input id="desiredSalary" type="number" {...register('desiredSalary')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="currency">Moeda</Label>
                    <Input id="currency" {...register('currency')} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                    Guardar resumo
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {PRIMARY_TABS.map((type) => (
          <TabsContent key={type} value={type}>
            <SectionManager config={SECTION_CONFIGS[type]} />
          </TabsContent>
        ))}

        <TabsContent value="more" className="space-y-6">
          {MORE_TABS.map((type) => (
            <SectionManager key={type} config={SECTION_CONFIGS[type]} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
