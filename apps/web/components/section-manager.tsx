'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Checkbox, Input, Textarea } from '@cvlab/ui';
import { apiFetch, ApiError } from '../lib/api-client';
import type { FieldConfig, SectionConfig, SectionItem } from '../lib/section-fields';

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
      <Checkbox
        label={field.label}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.label}
        value={String(value)}
        required={field.required}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      label={field.label}
      type={
        field.type === 'date' || field.type === 'number' || field.type === 'email'
          ? field.type
          : 'text'
      }
      value={String(value)}
      required={field.required}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SectionManager({
  config,
  onCompletionChange,
}: {
  config: SectionConfig;
  onCompletionChange?: () => void;
}) {
  const [items, setItems] = useState<SectionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const data = await apiFetch<SectionItem[]>(`/resume/${config.type}`);
      setItems([...data].sort((a, b) => a.displayOrder - b.displayOrder));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar esta secção.');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  function startAdd() {
    setFormState(toFormState(config));
    setEditingId(null);
    setIsAdding(true);
    setError(null);
  }

  function startEdit(item: SectionItem) {
    setFormState(toFormState(config, item));
    setEditingId(item.id);
    setIsAdding(false);
    setError(null);
  }

  function cancelForm() {
    setIsAdding(false);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = toPayload(config, formState);
      if (editingId) {
        await apiFetch(`/resume/${config.type}/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/resume/${config.type}`, { method: 'POST', body: JSON.stringify(payload) });
      }
      setIsAdding(false);
      setEditingId(null);
      await load();
      onCompletionChange?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível guardar. Verifique os dados.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: SectionItem) {
    if (!window.confirm(`Remover "${config.title(item)}"?`)) return;
    setError(null);
    try {
      await apiFetch(`/resume/${config.type}/${item.id}`, { method: 'DELETE' });
      await load();
      onCompletionChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover este item.');
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
    setItems(reordered);

    try {
      await apiFetch(`/resume/${config.type}/reorder`, {
        method: 'PUT',
        body: JSON.stringify({ orderedIds: reordered.map((row) => row.id) }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível reordenar.');
      await load();
    }
  }

  return (
    <Card title={config.label}>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">A carregar…</p>
      ) : items.length === 0 && !isAdding ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ainda não adicionou nenhum item.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              {editingId === item.id ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  {config.fields.map((field) => (
                    <FieldInput
                      key={field.name}
                      field={field}
                      value={formState[field.name] ?? (field.type === 'checkbox' ? false : '')}
                      onChange={(value) =>
                        setFormState((prev) => ({ ...prev, [field.name]: value }))
                      }
                    />
                  ))}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'A guardar…' : 'Guardar'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={cancelForm}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {config.title(item)}
                    </p>
                    {config.subtitle(item) ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {config.subtitle(item)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Mover para cima"
                      disabled={index === 0}
                      onClick={() => handleMove(item, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Mover para baixo"
                      disabled={index === items.length - 1}
                      onClick={() => handleMove(item, 1)}
                    >
                      ↓
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => startEdit(item)}>
                      Editar
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => handleDelete(item)}>
                      Remover
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdding ? (
        <form
          onSubmit={handleSubmit}
          className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"
        >
          {config.fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={formState[field.name] ?? (field.type === 'checkbox' ? false : '')}
              onChange={(value) => setFormState((prev) => ({ ...prev, [field.name]: value }))}
            />
          ))}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'A guardar…' : 'Adicionar'}
            </Button>
            <Button type="button" variant="ghost" onClick={cancelForm}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" className="mt-4" onClick={startAdd}>
          + Adicionar {config.singularLabel}
        </Button>
      )}
    </Card>
  );
}
