'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Example {
  role: string;
  before: string;
  after: string;
  improvements: string[];
}

const EXAMPLES: Example[] = [
  {
    role: 'Gestor de Projeto',
    before: 'Responsável por gerir projetos e equipas.',
    after:
      'Liderei 6 equipas multidisciplinares na entrega de 12 projetos, reduzindo o prazo médio em 20%.',
    improvements: [
      'Adicionou verbos de ação',
      'Incluiu métricas concretas',
      'Quantificou o impacto',
    ],
  },
  {
    role: 'Assistente Administrativo',
    before: 'Fazia atendimento ao cliente e tarefas de escritório.',
    after:
      'Atendi uma média de 40 clientes/dia, mantendo 98% de satisfação e organizando o arquivo digital da equipa.',
    improvements: [
      'Tornou o texto específico',
      'Destacou resultados',
      'Removeu linguagem genérica',
    ],
  },
  {
    role: 'Técnico de Vendas',
    before: 'Vendia produtos e atingia metas mensais.',
    after:
      'Superei a meta mensal em 15% durante 8 meses consecutivos, gerando cerca de 1,2M MT em receita adicional.',
    improvements: [
      'Contextualizou a consistência',
      'Ligou o resultado à receita',
      'Reforçou credibilidade',
    ],
  },
];

const CYCLE_MS = 5000;

/**
 * Marketing showcase demonstrating the AI resume-improvement flow: cycles
 * through a small set of before/after bullet examples with a scanning
 * animation between states. Static illustrative copy — not connected to the
 * real AI optimization backend (not implemented yet).
 */
export function AiImprovementShowcase() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'before' | 'scanning' | 'after'>('before');

  useEffect(() => {
    const toScanning = setTimeout(() => setPhase('scanning'), CYCLE_MS * 0.35);
    const toAfter = setTimeout(() => setPhase('after'), CYCLE_MS * 0.55);
    const toNext = setTimeout(() => {
      setPhase('before');
      setIndex((current) => (current + 1) % EXAMPLES.length);
    }, CYCLE_MS);

    return () => {
      clearTimeout(toScanning);
      clearTimeout(toAfter);
      clearTimeout(toNext);
    };
  }, [index]);

  // index is always kept in bounds via modulo below, so this lookup is safe.
  const example = EXAMPLES[index]!;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {example.role}
          </Badge>
          <div className="flex gap-1" aria-hidden="true">
            {EXAMPLES.map((item, dotIndex) => (
              <span
                key={item.role}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  dotIndex === index ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative min-h-[7rem] rounded-lg border border-border bg-muted/40 p-4">
          <AnimatePresence mode="wait">
            {phase === 'before' && (
              <motion.p
                key="before"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-muted-foreground"
              >
                {example.before}
              </motion.p>
            )}

            {phase === 'scanning' && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative overflow-hidden"
              >
                <p className="text-sm text-muted-foreground/60">{example.before}</p>
                <motion.div
                  className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary/25 to-transparent"
                  initial={{ x: '-100%' }}
                  animate={{ x: '300%' }}
                  transition={{ duration: 1.1, ease: 'easeInOut' }}
                />
                <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />A IA está a
                  melhorar este texto…
                </div>
              </motion.div>
            )}

            {phase === 'after' && (
              <motion.p
                key="after"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium text-foreground"
              >
                {example.after}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'after' && (
            <motion.ul
              key={`improvements-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex flex-wrap gap-x-4 gap-y-2"
            >
              {example.improvements.map((improvement, itemIndex) => (
                <motion.li
                  key={improvement}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: itemIndex * 0.1 }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  {improvement}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          Exemplo ilustrativo — o resultado real depende do seu currículo.
        </div>
      </CardContent>
    </Card>
  );
}
