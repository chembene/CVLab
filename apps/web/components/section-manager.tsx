'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';
import {
  useSection,
  useCreateSectionItem,
  useUpdateSectionItem,
  useDeleteSectionItem,
} from '@/lib/api/master-resume';
import type { FieldConfig, SectionConfig, SectionItem } from '@/lib/section-fields';
import { useQueryClient } from '@tanstack/react-query';

type FormState = Record<string, string | boolean>;

function toFormState(config: SectionConfig, item?: SectionItem): FormState {
  const state: FormState = {};
  for (const field of config.fields) {
    const raw = item?.[field.name];
    if (field.type === 'checkbox') {
      state[field.name] = Boolean(raw);
    } else if (field.type === 'date') {
      state[field.name] = typeof raw === 'string' ? raw.slice(0, 10) : '';
    } else if (field.type === 'tags') {
      state[field.name] = Array.isArray(raw) ? (raw as string[]).join(', ') : '';
    } else if (raw != null) {
      state[field.name] = String(raw);
    } else {
      state[field.name] = '';
    }
  }
  return state;
}

function toPayload(config: SectionConfig, state: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of config.fields) {
    const value = state[field.name];
    if (field.type === 'checkbox') {
      payload[field.name] = Boolean(value);
    } else if (field.type === 'number') {
      payload[field.name] = value === '' ? undefined : Number(value);
    } else if (field.type === 'tags') {
      payload[field.name] = String(value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else {
      payload[field.name] = value === '' ? undefined : value;
    }
  }
  return payload;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id={field.name}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={field.name} className="font-normal">
          {field.label}
        </Label>
      </div>
    );
  }
  const inputProps = {
    id: field.name,
    value: String(value),
    required: field.required,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.type === 'textarea' ? (
        <Textarea rows={3} {...inputProps} />
      ) : (
        <Input
          type={
            field.type === 'date' || field.type === 'number' || field.type === 'email'
              ? field.type
              : 'text'
          }
          {...inputProps}
        />
      )}
    </div>
  );
}

export function SectionManager({ config }: { config: SectionConfig }) {
  const { data: rawItems, isLoading } = useSection(config.type);
  const createItem = useCreateSectionItem(config.type);
  const updateItem = useUpdateSectionItem(config.type);
  const deleteItem = useDeleteSectionItem(config.type);
  const queryClient = useQueryClient();

  const items = rawItems
    ? [...rawItems].sort((a, b) => a.displayOrder - b.displayOrder)
    : undefined;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({});
  const [deletingItem, setDeletingItem] = useState<SectionItem | null>(null);

  function startAdd() {
    setFormState(toFormState(config));
    setEditingId(null);
    setDialogOpen(true);
  }

  function startEdit(item: SectionItem) {
    setFormState(toFormState(config, item));
    setEditingId(item.id);
    setDialogOpen(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = toPayload(config, formState);
      if (editingId) {
        await updateItem.mutateAsync({ id: editingId, input: payload });
      } else {
        await createItem.mutateAsync(payload);
      }
      setDialogOpen(false);
      toast.success('Guardado com sucesso.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível guardar. Verifique os dados.',
      );
    }
  }

  async function handleDelete() {
    if (!deletingItem) return;
    try {
      await deleteItem.mutateAsync(deletingItem.id);
      toast.success('Item removido.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover este item.');
    }
  }

  async function handleMove(item: SectionItem, direction: -1 | 1) {
    if (!items) return;
    const index = items.findIndex((row) => row.id === item.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    const current = reordered[index];
    const target = reordered[targetIndex];
    if (!current || !target) return;
    reordered[index] = target;
    reordered[targetIndex] = current;
    queryClient.setQueryData(['resume-section', config.type], reordered);

    try {
      await apiFetch(`/resume/${config.type}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: reordered.map((row) => row.id) }),
      });
      await queryClient.invalidateQueries({ queryKey: ['resume-section', config.type] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível reordenar.');
      await queryClient.invalidateQueries({ queryKey: ['resume-section', config.type] });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{config.label}</CardTitle>
        <Button type="button" size="sm" onClick={startAdd}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nenhum item"
            description={`Ainda não adicionou nenhuma ${config.singularLabel}.`}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{config.title(item)}</p>
                  {config.subtitle(item) && (
                    <p className="truncate text-sm text-muted-foreground">
                      {config.subtitle(item)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Mover para cima"
                    disabled={index === 0}
                    onClick={() => handleMove(item, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Mover para baixo"
                    disabled={index === items.length - 1}
                    onClick={() => handleMove(item, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Editar"
                    onClick={() => startEdit(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover"
                    onClick={() => setDeletingItem(item)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar' : 'Adicionar'} {config.singularLabel}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {config.fields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={formState[field.name] ?? (field.type === 'checkbox' ? false : '')}
                onChange={(value) => setFormState((prev) => ({ ...prev, [field.name]: value }))}
              />
            ))}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={createItem.isPending || updateItem.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingItem)}
        onOpenChange={(open) => !open && setDeletingItem(null)}
        title={`Remover "${deletingItem ? config.title(deletingItem) : ''}"?`}
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Remover"
        onConfirm={handleDelete}
      />
    </Card>
  );
}
