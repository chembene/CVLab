import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface Profile {
  id: string;
  userId: string;
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
  createdAt: string;
  updatedAt: string;
}

export type UpdateProfileInput = Partial<
  Omit<Profile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => apiFetch<Profile | null>('/profile').catch(() => null),
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiFetch<Profile>('/profile', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], data);
    },
  });
}
