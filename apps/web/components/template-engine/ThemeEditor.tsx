'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import type { ThemeOverrides } from '@/lib/template-engine/theme';

export interface ThemeEditorProps {
  value: ThemeOverrides;
  onChange: (next: ThemeOverrides) => void;
  onReset?: () => void;
}

const FONT_OPTIONS = [
  'Inter',
  'Georgia',
  'Arial',
  'Helvetica',
  'Calibri',
  'Playfair Display',
  'Cormorant Garamond',
  'Poppins',
  'JetBrains Mono',
  'Times New Roman',
];

/**
 * Part 6 "Theme Customization" — every field the brief lists. A fully
 * controlled component: every change calls `onChange` immediately (Part 5
 * "Live Preview... no refresh, no page reload"), and persistence
 * (PUT .../theme) is the caller's responsibility — this component never
 * calls the API directly, matching "settings must be stored independently
 * from Resume content" (it doesn't touch content at all).
 */
export function ThemeEditor({ value, onChange, onReset }: ThemeEditorProps) {
  function set<K extends keyof ThemeOverrides>(key: K, fieldValue: ThemeOverrides[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="theme-primary-color">Cor primária</Label>
          <Input
            id="theme-primary-color"
            type="color"
            className="h-9 w-full p-1"
            value={value.primaryColor ?? '#2563EB'}
            onChange={(e) => set('primaryColor', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-secondary-color">Cor secundária</Label>
          <Input
            id="theme-secondary-color"
            type="color"
            className="h-9 w-full p-1"
            value={value.secondaryColor ?? '#1E3A8A'}
            onChange={(e) => set('secondaryColor', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-accent-color">Cor de destaque</Label>
          <Input
            id="theme-accent-color"
            type="color"
            className="h-9 w-full p-1"
            value={value.accentColor ?? value.secondaryColor ?? '#1E3A8A'}
            onChange={(e) => set('accentColor', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="theme-font-family">Tipo de letra</Label>
        <Select value={value.fontFamily ?? ''} onValueChange={(v) => set('fontFamily', v)}>
          <SelectTrigger id="theme-font-family">
            <SelectValue placeholder="Predefinido do modelo" />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="theme-font-size">Tamanho da letra (px)</Label>
          <Input
            id="theme-font-size"
            type="number"
            min={8}
            max={24}
            value={value.fontSize ?? 14}
            onChange={(e) => set('fontSize', Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-line-height">Entrelinha (%)</Label>
          <Input
            id="theme-line-height"
            type="number"
            min={100}
            max={250}
            step={5}
            value={value.lineHeightPercent ?? 150}
            onChange={(e) => set('lineHeightPercent', Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="theme-section-spacing">Espaçamento entre secções</Label>
          <Select
            value={value.sectionSpacing ?? ''}
            onValueChange={(v) => set('sectionSpacing', v as ThemeOverrides['sectionSpacing'])}
          >
            <SelectTrigger id="theme-section-spacing">
              <SelectValue placeholder="Predefinido" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compacto</SelectItem>
              <SelectItem value="comfortable">Confortável</SelectItem>
              <SelectItem value="spacious">Espaçoso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-page-margins">Margens da página</Label>
          <Select
            value={value.pageMargins ?? ''}
            onValueChange={(v) => set('pageMargins', v as ThemeOverrides['pageMargins'])}
          >
            <SelectTrigger id="theme-page-margins">
              <SelectValue placeholder="Predefinido" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="narrow">Estreitas</SelectItem>
              <SelectItem value="normal">Normais</SelectItem>
              <SelectItem value="wide">Largas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="theme-header-style">Estilo do cabeçalho</Label>
          <Select
            value={value.headerStyle ?? ''}
            onValueChange={(v) => set('headerStyle', v as ThemeOverrides['headerStyle'])}
          >
            <SelectTrigger id="theme-header-style">
              <SelectValue placeholder="Predefinido do modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minimal">Minimalista</SelectItem>
              <SelectItem value="band">Faixa colorida</SelectItem>
              <SelectItem value="centered">Centrado</SelectItem>
              <SelectItem value="sidebar">Barra lateral</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-divider-style">Estilo dos separadores</Label>
          <Select
            value={value.dividerStyle ?? ''}
            onValueChange={(v) => set('dividerStyle', v as ThemeOverrides['dividerStyle'])}
          >
            <SelectTrigger id="theme-divider-style">
              <SelectValue placeholder="Predefinido do modelo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line">Linha</SelectItem>
              <SelectItem value="dotted">Pontilhado</SelectItem>
              <SelectItem value="none">Nenhum</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.iconsEnabled ?? false}
            onCheckedChange={(checked) => set('iconsEnabled', Boolean(checked))}
          />
          Mostrar ícones nas secções
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={value.photoEnabled ?? false}
            onCheckedChange={(checked) => set('photoEnabled', Boolean(checked))}
          />
          Mostrar fotografia (se o modelo suportar)
        </label>
      </div>

      {onReset && (
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />
          Repor predefinições do modelo
        </Button>
      )}
    </div>
  );
}
