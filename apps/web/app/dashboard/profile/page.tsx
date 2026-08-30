'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile, useUpdateProfile } from '@/lib/api/profile';
import { profileSchema, type ProfileFormInput } from '@/lib/validation/profile';
import { ApiError } from '@/lib/api-client';

const FIELD_GROUPS: {
  title: string;
  fields: { name: keyof ProfileFormInput; label: string; type?: string }[];
}[] = [
  {
    title: 'Identidade',
    fields: [
      { name: 'firstName', label: 'Nome' },
      { name: 'lastName', label: 'Apelido' },
      { name: 'displayName', label: 'Nome de exibição' },
      { name: 'headline', label: 'Título profissional' },
    ],
  },
  {
    title: 'Contacto',
    fields: [
      { name: 'phone', label: 'Telefone' },
      { name: 'email', label: 'E-mail de contacto', type: 'email' },
      { name: 'country', label: 'País' },
      { name: 'city', label: 'Cidade' },
      { name: 'address', label: 'Endereço' },
      { name: 'birthDate', label: 'Data de nascimento', type: 'date' },
    ],
  },
  {
    title: 'Presença online',
    fields: [
      { name: 'linkedin', label: 'LinkedIn' },
      { name: 'github', label: 'GitHub' },
      { name: 'portfolio', label: 'Portefólio' },
      { name: 'website', label: 'Website' },
      { name: 'photoUrl', label: 'URL da fotografia' },
    ],
  },
];

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormInput>({ resolver: zodResolver(profileSchema), defaultValues: {} });

  useEffect(() => {
    if (profile) {
      reset({
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        displayName: profile.displayName ?? '',
        headline: profile.headline ?? '',
        phone: profile.phone ?? '',
        email: profile.email ?? '',
        country: profile.country ?? '',
        city: profile.city ?? '',
        address: profile.address ?? '',
        birthDate: profile.birthDate?.slice(0, 10) ?? '',
        linkedin: profile.linkedin ?? '',
        github: profile.github ?? '',
        portfolio: profile.portfolio ?? '',
        website: profile.website ?? '',
        photoUrl: profile.photoUrl ?? '',
        bio: profile.bio ?? '',
      });
    }
  }, [profile, reset]);

  async function onSubmit(values: ProfileFormInput) {
    try {
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v === '' ? undefined : v]),
      );
      await updateProfile.mutateAsync(payload);
      toast.success('Perfil guardado com sucesso.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível guardar o perfil.');
    }
  }

  return (
    <div>
      <PageHeader title="Perfil" description="Informação pessoal usada em todo o CVLab AI." />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {FIELD_GROUPS.map((group) => (
            <Card key={group.title}>
              <CardHeader>
                <CardTitle className="text-base">{group.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div key={field.name} className="space-y-1.5">
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input id={field.name} type={field.type ?? 'text'} {...register(field.name)} />
                    {errors[field.name] && (
                      <p role="alert" className="text-sm text-destructive">
                        {errors[field.name]?.message}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Biografia</CardTitle>
              <CardDescription>Um breve resumo sobre si (opcional).</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea rows={4} {...register('bio')} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Guardar perfil
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
