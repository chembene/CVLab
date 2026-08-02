'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Input, Textarea } from '@cvlab/ui';
import { apiFetch, ApiError } from '../../../lib/api-client';
import { SECTION_CONFIGS, SECTION_ORDER } from '../../../lib/section-fields';
import { SectionManager } from '../../../components/section-manager';

interface MasterResume {
  id: string;
  title?: string | null;
  summary?: string | null;
  careerLevel?: string | null;
  yearsExperience?: number | null;
  desiredPosition?: string | null;
  desiredSalary?: string | null;
  currency: string;
  visibility: string;
  status: string;
  completionPercentage: number;
}

interface FormState {
  title: string;
  summary: string;
  careerLevel: string;
  yearsExperience: string;
  desiredPosition: string;
  desiredSalary: string;
  currency: string;
  visibility: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  summary: '',
  careerLevel: '',
  yearsExperience: '',
  desiredPosition: '',
  desiredSalary: '',
  currency: 'MZN',
  visibility: 'PRIVATE',
  status: 'DRAFT',
};

function toFormState(resume: MasterResume): FormState {
  return {
    title: resume.title ?? '',
    summary: resume.summary ?? '',
    careerLevel: resume.careerLevel ?? '',
    yearsExperience: resume.yearsExperience != null ? String(resume.yearsExperience) : '',
    desiredPosition: resume.desiredPosition ?? '',
    desiredSalary: resume.desiredSalary != null ? String(resume.desiredSalary) : '',
    currency: resume.currency,
    visibility: resume.visibility,
    status: resume.status,
  };
}

function toPayload(form: FormState): Record<string, unknown> {
  return {
    title: form.title || undefined,
    summary: form.summary || undefined,
    careerLevel: form.careerLevel || undefined,
    yearsExperience: form.yearsExperience === '' ? undefined : Number(form.yearsExperience),
    desiredPosition: form.desiredPosition || undefined,
    desiredSalary: form.desiredSalary === '' ? undefined : Number(form.desiredSalary),
    currency: form.currency || undefined,
    visibility: form.visibility || undefined,
    status: form.status || undefined,
  };
}

export default function ResumePage() {
  const [resume, setResume] = useState<MasterResume | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadResume = useCallback(async () => {
    const data = await apiFetch<MasterResume | null>('/resume');
    setResume(data);
    if (data) setForm(toFormState(data));
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadResume();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o currículo.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadResume]);

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/resume', { method: 'POST', body: JSON.stringify({}) });
      await loadResume();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível criar o currículo.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await apiFetch<MasterResume>('/resume', {
        method: 'PUT',
        body: JSON.stringify(toPayload(form)),
      });
      setResume(updated);
      setForm(toFormState(updated));
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível guardar o currículo.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">A carregar…</p>;
  }

  if (!resume) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Currículo</h1>
        <Card title="Comece o seu currículo mestre">
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            O seu currículo mestre reúne toda a sua informação profissional num único lugar.
            Currículos específicos serão, no futuro, versões filtradas deste currículo mestre.
          </p>
          {error ? (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? 'A criar…' : 'Criar currículo mestre'}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Currículo</h1>
        <div className="flex items-center gap-2">
          <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full bg-blue-600"
              style={{ width: `${resume.completionPercentage}%` }}
            />
          </div>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {resume.completionPercentage}% completo
          </span>
        </div>
      </div>

      <Card title="Resumo">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Título do currículo"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <Textarea
            label="Resumo profissional"
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nível de carreira"
              value={form.careerLevel}
              onChange={(e) => set('careerLevel', e.target.value)}
            />
            <Input
              label="Anos de experiência"
              type="number"
              value={form.yearsExperience}
              onChange={(e) => set('yearsExperience', e.target.value)}
            />
          </div>

          <Input
            label="Cargo pretendido"
            value={form.desiredPosition}
            onChange={(e) => set('desiredPosition', e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Salário pretendido"
              type="number"
              value={form.desiredSalary}
              onChange={(e) => set('desiredSalary', e.target.value)}
            />
            <Input
              label="Moeda"
              value={form.currency}
              onChange={(e) => set('currency', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Visibilidade"
              value={form.visibility}
              onChange={(e) => set('visibility', e.target.value)}
            />
            <Input
              label="Estado"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-green-700 dark:text-green-400">Currículo guardado.</p>
          ) : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'A guardar…' : 'Guardar resumo'}
          </Button>
        </form>
      </Card>

      {SECTION_ORDER.map((type) => (
        <SectionManager key={type} config={SECTION_CONFIGS[type]} onCompletionChange={loadResume} />
      ))}
    </div>
  );
}
