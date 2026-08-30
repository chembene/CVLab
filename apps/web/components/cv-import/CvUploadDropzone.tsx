'use client';

import { useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';

const ACCEPTED_MIME_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
} as const;

// Mirrors apps/api/src/cv-import/cv-import.service.ts's MAX_CV_FILE_SIZE_BYTES —
// client-side validation is a UX convenience only, never trusted as the real
// gate (the server re-validates MIME/extension/size unconditionally).
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export interface CvUploadDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

function validateFile(file: File): string | null {
  if (!(file.type in ACCEPTED_MIME_TYPES)) {
    return 'Formato não suportado. Envie um ficheiro PDF ou DOCX.';
  }
  if (file.size === 0) {
    return 'O ficheiro está vazio.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'O ficheiro excede o limite de 5MB.';
  }
  return null;
}

/** Idle/selected states of the CV Import flow (Steps 3 + 7 of the brief). Upload/processing/review/success/error live in the parent page. */
export function CvUploadDropzone({ onFileSelected, disabled }: CvUploadDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  function clearSelection() {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  if (selectedFile) {
    const fileType = ACCEPTED_MIME_TYPES[selectedFile.type as keyof typeof ACCEPTED_MIME_TYPES];
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {fileType} · {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            disabled={disabled}
            aria-label="Remover ficheiro"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Button
          type="button"
          className="mt-4 w-full"
          onClick={() => onFileSelected(selectedFile)}
          disabled={disabled}
        >
          Importar CV
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border px-6 py-12 text-center transition-colors',
          isDragOver && 'border-primary bg-primary/5',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium">Arraste o seu CV aqui</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Formatos suportados: PDF, DOCX (até 5MB)
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
        >
          Selecionar ficheiro
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
