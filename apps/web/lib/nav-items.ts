import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  User,
  FileText,
  UploadCloud,
  Copy,
  Target,
  ScanSearch,
  Sparkles,
  Mail,
  MessagesSquare,
  Briefcase,
  Compass,
  Wallet,
  Receipt,
  History,
  Settings,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/**
 * Single source of truth for the sidebar and mobile nav — one entry per
 * backend module with a frontend surface (Phase 1 through Phase 9). Keeping
 * this in one file, rather than duplicating `<Link>` lists in Sidebar and
 * MobileNav, is what "avoid duplicated UI" means for navigation
 * specifically — see docs/frontend/frontend-architecture.md.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Visão geral',
    items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Currículo',
    items: [
      { label: 'Perfil', href: '/dashboard/profile', icon: User },
      { label: 'Importar CV', href: '/dashboard/import-cv', icon: UploadCloud },
      { label: 'Currículo Principal', href: '/dashboard/resume', icon: FileText },
      { label: 'Versões do Currículo', href: '/dashboard/resume-variants', icon: Copy },
    ],
  },
  {
    title: 'Candidaturas',
    items: [
      { label: 'Vagas Alvo', href: '/dashboard/job-targets', icon: Target },
      { label: 'Relatórios ATS', href: '/dashboard/ats-reports', icon: ScanSearch },
      { label: 'Otimização IA', href: '/dashboard/optimizations', icon: Sparkles },
      { label: 'Cartas de Apresentação', href: '/dashboard/cover-letters', icon: Mail },
      { label: 'Prática de Entrevista', href: '/dashboard/interviews', icon: MessagesSquare },
      { label: 'Career Advisor', href: '/dashboard/career-advisor', icon: Compass },
      { label: 'Minhas Candidaturas', href: '/dashboard/applications', icon: Briefcase },
    ],
  },
  {
    title: 'Conta',
    items: [
      { label: 'Créditos', href: '/dashboard/credits', icon: Wallet },
      { label: 'Transações', href: '/dashboard/transactions', icon: Receipt },
      { label: 'Histórico', href: '/dashboard/history', icon: History },
      { label: 'Definições', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
