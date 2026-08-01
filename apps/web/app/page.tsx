import { Button, Card } from '@cvlab/ui';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        Phase 0 — Project Foundation
      </span>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">CVLab AI</h1>

      <p className="max-w-xl text-slate-600 dark:text-slate-400">
        AI-assisted CV building, cover letters, ATS analysis, technical tests and interview practice
        — built for the Mozambican job market.
      </p>

      <Card title="Status" className="w-full max-w-md text-left">
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <li>Frontend: Next.js foundation running</li>
          <li>Backend: NestJS foundation running</li>
          <li>Database &amp; cache: configured for local development</li>
        </ul>
      </Card>

      <Button variant="primary" disabled aria-disabled="true">
        Product features arrive in later milestones
      </Button>
    </main>
  );
}
