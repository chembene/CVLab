'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { CheckCircle2, FileText, FileWarning, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CvUploadDropzone } from '@/components/cv-import/CvUploadDropzone';
import { CvImportReview } from '@/components/cv-import/CvImportReview';
import { CvImportAiSuggestions } from '@/components/cv-import/CvImportAiSuggestions';
import {
  useUploadCvImport,
  useConfirmCvImport,
  useDiscardCvImport,
  useMergePreview,
} from '@/lib/api/cv-import';
import type {
  CvImport,
  ExtractedCvData,
  ConfirmCvImportResult,
  CvImportStrategy,
} from '@/lib/api/cv-import';
import { useMasterResume } from '@/lib/api/master-resume';
import { ApiError } from '@/lib/api-client';
import { seedExistingSectionIds } from '@/lib/cv-import/merge-seed';

type FlowState = 'idle' | 'uploading' | 'existing-resume-choice' | 'review' | 'success' | 'error';

const PROCESSING_MESSAGES = [
  'A carregar o CV...',
  'A extrair o conteúdo...',
  'A analisar a estrutura...',
  'A preparar a revisão...',
];

/** Cycles through honest, non-numeric processing labels while the single upload+extract request is in flight — no fabricated percentage, since the backend can't report real progress for a synchronous, deterministic parse. */
function useProcessingMessage(active: boolean): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const interval = setInterval(() => setIndex((i) => (i + 1) % PROCESSING_MESSAGES.length), 900);
    return () => clearInterval(interval);
  }, [active]);
  return PROCESSING_MESSAGES[index]!;
}

const EMPTY_DATA: ExtractedCvData = {
  personalData: {},
  summary: '',
  workExperiences: [],
  educations: [],
  skills: [],
  languages: [],
  certificates: [],
  projects: [],
  awards: [],
  volunteerExperiences: [],
  references: [],
};

/**
 * Part 7-10 of the "CV Import User Flow Integration" phase: Dashboard →
 * Import CV → Upload → Parse → Review → Edit → Confirm → Master Resume.
 * Every stage of this page talks to the pre-existing, unmodified
 * apps/api/src/cv-import backend — this page is purely the missing UI
 * surface. Resume Variants are never created here (that stays a separate,
 * downstream workflow).
 */
export default function ImportCvPage() {
  const router = useRouter();
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [cvImport, setCvImport] = useState<CvImport | null>(null);
  const [reviewData, setReviewData] = useState<ExtractedCvData>(EMPTY_DATA);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [confirmResult, setConfirmResult] = useState<ConfirmCvImportResult | null>(null);
  // Captured at upload time so the success screen's copy stays accurate even
  // after useMasterResume() refetches (and starts returning non-null) once
  // confirm() itself creates/updates the resume.
  const [hadExistingResume, setHadExistingResume] = useState(false);
  // Which strategy the user actually confirmed with — drives the success
  // screen's copy ("substituído" vs "atualizado"). Only ever set right
  // before the confirm request fires.
  const [confirmStrategy, setConfirmStrategy] = useState<CvImportStrategy | undefined>(undefined);

  const masterResume = useMasterResume();
  const uploadMutation = useUploadCvImport();
  const confirmMutation = useConfirmCvImport(cvImport?.id ?? '');
  const discardMutation = useDiscardCvImport();
  // Phase 12, brief §14/§15 — computed the moment there's an existing Master
  // Resume to compare against, so the choice screen can show real counts
  // ("Encontrámos N possíveis duplicados e M novas entradas") instead of a
  // generic warning. Read-only; never fetched when there's nothing to merge.
  const mergePreview = useMergePreview(hadExistingResume ? cvImport?.id : undefined);

  // FASE 7 audit (2026-08-12) — once the merge preview resolves, copy each
  // flagged entry's matched existing-row id onto the corresponding
  // reviewData entry ONE TIME (index-correlated — see
  // seedExistingSectionIds()'s own doc comment for why this is safe). From
  // that point on, CvImportReview's diff banners look the existing row up
  // by that id, so the association survives the user reordering/removing
  // other entries afterwards.
  useEffect(() => {
    if (mergePreview.data) {
      setReviewData((prev) => seedExistingSectionIds(prev, mergePreview.data!));
    }
  }, [mergePreview.data]);

  const processingMessage = useProcessingMessage(flowState === 'uploading');

  async function handleFileSelected(file: File) {
    setFlowState('uploading');
    setErrorMessage('');
    try {
      const result = await uploadMutation.mutateAsync(file);
      setCvImport(result);
      setReviewData(result.extractedData ?? EMPTY_DATA);
      const alreadyHasResume = Boolean(masterResume.data);
      setHadExistingResume(alreadyHasResume);
      // "The system must NOT silently overwrite the existing Master Resume"
      // — when one already exists, the user gets an explicit choice before
      // any review/confirm screen ever appears, instead of just landing on
      // review and discovering only at the end (or not at all) that
      // confirming will merge into their existing data.
      setFlowState(alreadyHasResume ? 'existing-resume-choice' : 'review');
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Não foi possível processar o ficheiro.',
      );
      setFlowState('error');
    }
  }

  async function handleConfirm(strategy?: CvImportStrategy) {
    if (!cvImport) return;
    setConfirmStrategy(strategy);
    try {
      const result = await confirmMutation.mutateAsync({ ...reviewData, strategy });
      setConfirmResult(result);
      setFlowState('success');
      toast.success(
        strategy === 'replace'
          ? 'Currículo Principal substituído com sucesso.'
          : hadExistingResume
            ? 'Currículo Principal atualizado com sucesso.'
            : 'CV importado com sucesso.',
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível confirmar a importação.',
      );
    }
  }

  async function handleCancel() {
    if (!cvImport) return;
    try {
      await discardMutation.mutateAsync(cvImport.id);
    } catch {
      // Best-effort — the import row just stays EXTRACTED/orphaned, harmless either way.
    }
    resetToIdle();
  }

  function resetToIdle() {
    setCvImport(null);
    setReviewData(EMPTY_DATA);
    setErrorMessage('');
    setConfirmResult(null);
    setHadExistingResume(false);
    setConfirmStrategy(undefined);
    setFlowState('idle');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Importar CV"
        description="Envie o seu currículo em PDF ou DOCX para preencher o seu Currículo Principal automaticamente."
      />

      {flowState === 'idle' && (
        <Card>
          <CardContent className="pt-6">
            <CvUploadDropzone onFileSelected={handleFileSelected} />
          </CardContent>
        </Card>
      )}

      {flowState === 'uploading' && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-medium" role="status">
              {processingMessage}
            </p>
            <p className="text-xs text-muted-foreground">Isto pode demorar alguns segundos.</p>
          </CardContent>
        </Card>
      )}

      {flowState === 'error' && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <FileWarning className="h-4 w-4" />
            <AlertTitle>Não foi possível importar o CV</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={resetToIdle}>
            Tentar novamente
          </Button>
        </div>
      )}

      {flowState === 'existing-resume-choice' && cvImport && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="h-10 w-10 text-primary" aria-hidden="true" />
            <p className="text-lg font-semibold">Já possui um Currículo Principal</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Encontrámos um Currículo Principal existente. Como deseja continuar com os dados deste
              novo CV?
            </p>
            {mergePreview.data && (
              <p className="max-w-md text-sm text-muted-foreground">
                Encontrámos {mergePreview.data.duplicateCount}{' '}
                {mergePreview.data.duplicateCount === 1
                  ? 'possível duplicado'
                  : 'possíveis duplicados'}{' '}
                e {mergePreview.data.newCount}{' '}
                {mergePreview.data.newCount === 1 ? 'nova entrada' : 'novas entradas'}.
              </p>
            )}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => setFlowState('review')}>
                Mesclar com Currículo Principal
              </Button>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => handleConfirm('replace')}
                loading={confirmMutation.isPending}
              >
                Substituir Currículo Principal
              </Button>
              <Button variant="outline" onClick={handleCancel} loading={discardMutation.isPending}>
                Cancelar
              </Button>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              &quot;Substituir&quot; remove todo o conteúdo atual do seu Currículo Principal antes
              de importar este CV. &quot;Mesclar&quot; mantém o que já existe e apenas adiciona o
              que for novo — pode rever tudo antes de confirmar.
            </p>
          </CardContent>
        </Card>
      )}

      {flowState === 'review' && cvImport && (
        <div className="space-y-6">
          <Alert>
            <AlertTitle>Rever informações</AlertTitle>
            <AlertDescription>
              Verifique os dados extraídos do seu CV antes de confirmar. Pode editar ou remover
              qualquer entrada. Campos assinalados como confiança baixa merecem atenção especial.
              {hadExistingResume &&
                ' Ao confirmar, estes dados serão adicionados ao seu Currículo Principal existente.'}
              {hadExistingResume && mergePreview.data && mergePreview.data.duplicateCount > 0 && (
                <>
                  {' '}
                  Encontrámos {mergePreview.data.duplicateCount}{' '}
                  {mergePreview.data.duplicateCount === 1
                    ? 'entrada semelhante a uma já existente'
                    : 'entradas semelhantes a já existentes'}{' '}
                  — reveja cada uma abaixo antes de confirmar.
                </>
              )}
            </AlertDescription>
          </Alert>

          <CvImportAiSuggestions
            cvImportId={cvImport.id}
            reviewData={reviewData}
            onChange={setReviewData}
            aiSuggestions={cvImport.aiSuggestions}
            aiUnresolvedFields={cvImport.aiUnresolvedFields}
            onEnhanced={setCvImport}
          />

          <CvImportReview
            value={reviewData}
            onChange={setReviewData}
            fieldConfidence={cvImport.fieldConfidence}
            mergePreview={mergePreview.data}
          />

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={handleCancel} loading={discardMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => handleConfirm(hadExistingResume ? 'merge' : undefined)}
              loading={confirmMutation.isPending}
            >
              {hadExistingResume ? 'Confirmar e mesclar' : 'Confirmar e importar'}
            </Button>
          </div>
        </div>
      )}

      {flowState === 'success' && confirmResult && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
            <p className="text-lg font-semibold">
              {confirmStrategy === 'replace'
                ? 'Currículo Principal substituído'
                : hadExistingResume
                  ? 'Currículo Principal atualizado'
                  : 'Importação concluída'}
            </p>
            <p className="text-sm text-muted-foreground">
              {confirmStrategy === 'replace'
                ? 'Currículo Principal substituído com sucesso.'
                : hadExistingResume
                  ? 'Currículo Principal atualizado com sucesso.'
                  : 'CV importado com sucesso.'}
            </p>

            {(confirmResult.updatedEntries?.length ?? 0) > 0 && (
              <Alert className="mt-2 text-left">
                <AlertTitle>Entradas existentes atualizadas</AlertTitle>
                <AlertDescription>
                  <ul className="list-inside list-disc space-y-0.5">
                    {confirmResult.updatedEntries.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {confirmResult.skippedEntries.length > 0 && (
              <Alert variant="warning" className="mt-2 text-left">
                <AlertTitle>Algumas entradas não foram importadas</AlertTitle>
                <AlertDescription>
                  <ul className="list-inside list-disc space-y-0.5">
                    {confirmResult.skippedEntries.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Pode adicioná-las manualmente no editor do Currículo Principal.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => router.push('/dashboard/resume')}>
                Abrir Currículo Principal
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard">Voltar ao Dashboard</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/job-targets">Criar CV para uma vaga</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
