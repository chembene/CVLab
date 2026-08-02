'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Input, Textarea } from '@cvlab/ui';
import { apiFetch, ApiError } from '../../../lib/api-client';

interface Profile {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  headline?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  birthDate?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  website?: string | null;
  photoUrl?: string | null;
  bio?: string | null;
}

type FormState = Record<keyof Profile, string>;

const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  displayName: '',
  headline: '',
  phone: '',
  email: '',
  country: '',
  city: '',
  address: '',
  birthDate: '',
  linkedin: '',
  github: '',
  portfolio: '',
  website: '',
  photoUrl: '',
  bio: '',
};

function toFormState(profile: Profile | null): FormState {
  if (!profile) return EMPTY_FORM;
  const state = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as (keyof Profile)[]) {
    const value = profile[key];
    if (key === 'birthDate' && typeof value === 'string') {
      state[key] = value.slice(0, 10);
    } else if (typeof value === 'string') {
      state[key] = value;
    }
  }
  return state;
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const profile = await apiFetch<Profile | null>('/profile');
        setForm(toFormState(profile));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o perfil.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  function set(key: keyof Profile, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Record<string, string | undefined> = {};
      for (const key of Object.keys(form) as (keyof Profile)[]) {
        payload[key] = form[key] === '' ? undefined : form[key];
      }
      const profile = await apiFetch<Profile>('/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setForm(toFormState(profile));
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível guardar o perfil.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">A carregar…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Perfil</h1>

      <Card title="Informação pessoal">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nome"
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
            />
            <Input
              label="Apelido"
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
            />
          </div>
          <Input
            label="Nome de exibição"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
          />
          <Input
            label="Título profissional"
            value={form.headline}
            onChange={(e) => set('headline', e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Telefone"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
            <Input
              label="E-mail de contacto"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="País"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
            />
            <Input label="Cidade" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </div>
          <Input
            label="Endereço"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
          <Input
            label="Data de nascimento"
            type="date"
            value={form.birthDate}
            onChange={(e) => set('birthDate', e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="LinkedIn"
              value={form.linkedin}
              onChange={(e) => set('linkedin', e.target.value)}
            />
            <Input
              label="GitHub"
              value={form.github}
              onChange={(e) => set('github', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Portefólio"
              value={form.portfolio}
              onChange={(e) => set('portfolio', e.target.value)}
            />
            <Input
              label="Website"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </div>
          <Input
            label="URL da fotografia"
            value={form.photoUrl}
            onChange={(e) => set('photoUrl', e.target.value)}
          />
          <Textarea
            label="Biografia"
            value={form.bio}
            onChange={(e) => set('bio', e.target.value)}
          />

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-green-700 dark:text-green-400">Perfil guardado.</p>
          ) : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? 'A guardar…' : 'Guardar perfil'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
