'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessagesSquare, Bot, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ExchangeStep {
  question: string;
  answer: string;
  feedback: string;
  score: number;
}

const EXCHANGE: ExchangeStep[] = [
  {
    question: 'Fale-me de um desafio que enfrentou no trabalho e como o resolveu.',
    answer:
      'Tivemos um atraso num projeto por falta de comunicação entre equipas. Criei reuniões semanais curtas e um quadro partilhado, e entregámos com apenas 2 dias de atraso.',
    feedback:
      'Boa estrutura (situação → ação → resultado). Tente terminar com um número mais forte.',
    score: 78,
  },
  {
    question: 'Porque quer trabalhar nesta empresa?',
    answer: 'Porque admiro o produto e quero crescer profissionalmente numa equipa maior.',
    feedback: 'Resposta genérica. Mencione algo específico da empresa ou da vaga.',
    score: 52,
  },
  {
    question: 'Qual é a sua maior qualidade profissional?',
    answer:
      'Sou organizado: uso um sistema de prioridades que me ajudou a cumprir todos os prazos no último trimestre.',
    feedback: 'Muito bem — qualidade concreta, apoiada por um exemplo real.',
    score: 88,
  },
];

const STEP_MS = 5200;

/**
 * Marketing showcase simulating a practice interview: cycles through sample
 * question/answer pairs with AI feedback and a score bar. Illustrative,
 * static content — not connected to the real interview-practice backend
 * (not implemented yet).
 */
export function InterviewShowcase() {
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<'typing' | 'answer' | 'feedback'>('typing');

  useEffect(() => {
    const toAnswer = setTimeout(() => setStage('answer'), STEP_MS * 0.25);
    const toFeedback = setTimeout(() => setStage('feedback'), STEP_MS * 0.6);
    const toNext = setTimeout(() => {
      setStage('typing');
      setStep((current) => (current + 1) % EXCHANGE.length);
    }, STEP_MS);

    return () => {
      clearTimeout(toAnswer);
      clearTimeout(toFeedback);
      clearTimeout(toNext);
    };
  }, [step]);

  // step is always kept in bounds via modulo below, so this lookup is safe.
  const exchange = EXCHANGE[step]!;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <Badge variant="secondary" className="gap-1">
            <MessagesSquare className="h-3 w-3" aria-hidden="true" />
            Simulação de entrevista
          </Badge>
          <div className="flex gap-1" aria-hidden="true">
            {EXCHANGE.map((item, dotIndex) => (
              <span
                key={item.question}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  dotIndex === step ? 'bg-primary' : 'bg-secondary'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <AnimatePresence mode="wait">
              <motion.p
                key={`question-${step}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg rounded-tl-none bg-muted/60 px-3 py-2 text-sm text-foreground"
              >
                {exchange.question}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="flex items-start justify-end gap-2">
            <AnimatePresence mode="wait">
              {stage === 'typing' ? (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1 rounded-lg rounded-tr-none bg-primary/10 px-3 py-2.5"
                >
                  {[0, 1, 2].map((dot) => (
                    <motion.span
                      key={dot}
                      className="h-1.5 w-1.5 rounded-full bg-primary/70"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.p
                  key={`answer-${step}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-[85%] rounded-lg rounded-tr-none bg-primary/10 px-3 py-2 text-sm text-foreground"
                >
                  {exchange.answer}
                </motion.p>
              )}
            </AnimatePresence>
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        </div>

        <AnimatePresence>
          {stage === 'feedback' && (
            <motion.div
              key={`feedback-${step}`}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden rounded-lg border border-border bg-muted/40 p-3"
            >
              <p className="text-xs text-muted-foreground">{exchange.feedback}</p>
              <div className="mt-2 flex items-center gap-2">
                <Progress value={exchange.score} className="h-1.5" />
                <span className="text-xs font-medium text-primary">{exchange.score}/100</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 text-xs text-muted-foreground">
          Exemplo ilustrativo — as perguntas reais adaptam-se à vaga escolhida.
        </div>
      </CardContent>
    </Card>
  );
}
