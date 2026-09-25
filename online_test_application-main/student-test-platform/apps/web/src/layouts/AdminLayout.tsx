import { BarChart3, ClipboardList, LayoutDashboard, ListChecks, MessageSquareText, Radio, User, Users } from 'lucide-react';
import { AppShell } from './AppShell';

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', end: true, icon: LayoutDashboard },
  { to: '/admin/tests', label: 'Tests', icon: ClipboardList },
  { to: '/admin/questions', label: 'Question bank', icon: ListChecks },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/reviews', label: 'Reviews & ratings', icon: MessageSquareText },
  { to: '/admin/room', label: 'Room', icon: Radio },
];

const TITLE_ITEMS = [
  ...NAV_ITEMS,
  { to: '/admin/import', label: 'Import', end: true, icon: ListChecks, hidden: true },
  { to: '/admin/create', label: 'Create question bank', end: true, icon: ListChecks, hidden: true },
  { to: '/admin/profile', label: 'Profile', end: true, icon: User, hidden: true },
];

export function AdminLayout() {
  return <AppShell eyebrow="Admin workspace" navItems={NAV_ITEMS} titleItems={TITLE_ITEMS} />;
}
