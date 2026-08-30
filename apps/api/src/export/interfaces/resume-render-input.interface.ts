import type { RendererProfile, ThemeOverrides } from '@cvlab/resume-renderer';

/** Everything a resume renderer (PDF or DOCX) needs — the exact same shape ResumePreview.tsx resolves from a ResumeVariant + Profile. `RendererProfile`/`ThemeOverrides` come straight from `@cvlab/resume-renderer` — the same types the renderer components themselves consume, never a second, drifting declaration. */
export interface ResumeRenderInput {
  content: Record<string, unknown>;
  profile: RendererProfile | null;
  templateId: string | null;
  themeOverrides: ThemeOverrides | null;
}

export interface ResumeRenderResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

export interface ResumeRenderer {
  render(input: ResumeRenderInput): Promise<ResumeRenderResult>;
}
