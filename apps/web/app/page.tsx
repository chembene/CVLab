'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, FileText, ScanSearch, MessagesSquare, ArrowRight, FileEdit } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Footer } from '@/components/layout/footer';
import { AiImprovementShowcase } from '@/components/marketing/ai-improvement-showcase';
import { InterviewShowcase } from '@/components/marketing/interview-showcase';

const FEATURES = [
  {
    icon: FileText,
    title: 'Currículo Inteligente',
    description: 'Construa e mantenha um currículo principal reutilizável em várias candidaturas.',
  },
  {
    icon: ScanSearch,
    title: 'Análise ATS',
    description: 'Compare o seu currículo com vagas específicas e veja o que falta.',
  },
  {
    icon: Sparkles,
    title: 'Otimização por IA',
    description: 'Receba sugestões concretas para melhorar cada secção do seu currículo.',
  },
  {
    icon: MessagesSquare,
    title: 'Prática de Entrevista',
    description: 'Treine com perguntas geradas por IA e receba feedback imediato.',
  },
  {
    icon: FileEdit,
    title: 'Cartas de Apresentação',
    description: 'Gere cartas de apresentação adaptadas a cada candidatura em segundos.',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

export default function HomePage() {
  const { user, isLoading } = useAuth();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          CVLab AI
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#melhoria-ia" className="transition-colors hover:text-foreground">
            Melhoria com IA
          </a>
          <a href="#entrevistas" className="transition-colors hover:text-foreground">
            Entrevistas
          </a>
          <a href="#recursos" className="transition-colors hover:text-foreground">
            Recursos
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {!isLoading && user ? (
            <Button asChild>
              <Link href="/dashboard">
                Ir para o painel
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Entrar</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Criar conta</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero — existing copy preserved */}
      <section className="container flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Badge variant="secondary" className="mb-4">
            Plataforma de carreira com IA para Moçambique
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Prepare-se para a próxima <span className="text-primary">oportunidade</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Construção de currículos assistida por IA, cartas de apresentação, análise ATS e
            simulação de entrevistas — tudo num único lugar.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" asChild>
              <Link href={user ? '/dashboard' : '/register'}>
                Começar agora
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* AI CV improvement showcase */}
      <section
        id="melhoria-ia"
        className="container grid gap-10 py-16 lg:grid-cols-2 lg:items-center"
      >
        <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
          <Badge variant="secondary" className="mb-4 gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Otimização por IA
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            A IA reescreve o seu currículo, frase a frase
          </h2>
          <p className="mt-4 max-w-lg text-muted-foreground">
            Cada secção do seu currículo é analisada e reformulada com verbos de ação, resultados
            concretos e linguagem que os recrutadores procuram — mantendo sempre as suas informações
            reais, sem inventar experiência.
          </p>
        </motion.div>
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <AiImprovementShowcase />
        </motion.div>
      </section>

      {/* Interview practice showcase */}
      <section
        id="entrevistas"
        className="container grid gap-10 py-16 lg:grid-cols-2 lg:items-center"
      >
        <motion.div {...fadeUp} transition={{ duration: 0.4 }} className="order-2 lg:order-1">
          <InterviewShowcase />
        </motion.div>
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="order-1 lg:order-2"
        >
          <Badge variant="secondary" className="mb-4 gap-1">
            <MessagesSquare className="h-3 w-3" aria-hidden="true" />
            Prática de Entrevista
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Treine antes do dia da entrevista
          </h2>
          <p className="mt-4 max-w-lg text-muted-foreground">
            Responda a perguntas geradas com base na vaga que está a candidatar-se e receba feedback
            imediato sobre clareza, estrutura e impacto das suas respostas.
          </p>
        </motion.div>
      </section>

      {/* Full feature grid — existing cards preserved, one item added */}
      <section id="recursos" className="container py-16">
        <motion.div {...fadeUp} transition={{ duration: 0.4 }} className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Tudo o que precisa, num só lugar
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Do primeiro rascunho à entrevista final.
          </p>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
            >
              <Card className="h-full">
                <CardHeader>
                  <feature.icon className="mb-2 h-6 w-6 text-primary" aria-hidden="true" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-muted/30">
        <div className="container flex flex-col items-center gap-4 py-16 text-center">
          <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Pronto para preparar a sua próxima candidatura?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Crie a sua conta gratuita e comece a construir o seu currículo principal.
            </p>
            <div className="mt-6">
              <Button size="lg" asChild>
                <Link href={user ? '/dashboard' : '/register'}>
                  Começar agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
