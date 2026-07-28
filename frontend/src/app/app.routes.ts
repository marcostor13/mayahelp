import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'public/observaciones/:token',
    loadComponent: () =>
      import('./features/public/observation-form/observation-form').then((m) => m.ObservationForm),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'tickets',
        loadComponent: () =>
          import('./features/tickets/ticket-list/ticket-list').then((m) => m.TicketList),
      },
      {
        path: 'tickets/new',
        loadComponent: () =>
          import('./features/tickets/ticket-create/ticket-create').then((m) => m.TicketCreate),
      },
      {
        path: 'tickets/bulk-import',
        canActivate: [roleGuard(['admin', 'agent'])],
        loadComponent: () =>
          import('./features/tickets/bulk-import/bulk-import').then((m) => m.BulkImport),
      },
      {
        path: 'tickets/:id',
        loadComponent: () =>
          import('./features/tickets/ticket-detail/ticket-detail').then((m) => m.TicketDetail),
      },
      {
        path: 'projects',
        canActivate: [roleGuard(['admin', 'agent'])],
        loadComponent: () =>
          import('./features/projects/project-list/project-list').then((m) => m.ProjectList),
      },
      {
        path: 'projects/new',
        canActivate: [roleGuard(['admin', 'agent'])],
        loadComponent: () =>
          import('./features/projects/project-create/project-create').then((m) => m.ProjectCreate),
      },
      {
        path: 'projects/:id',
        canActivate: [roleGuard(['admin', 'agent'])],
        loadComponent: () =>
          import('./features/projects/project-detail/project-detail').then((m) => m.ProjectDetail),
      },
      {
        path: 'whatsapp-templates',
        canActivate: [roleGuard(['admin'])],
        loadComponent: () =>
          import('./features/whatsapp-templates/whatsapp-templates').then(
            (m) => m.WhatsAppTemplates,
          ),
      },
      {
        path: 'help-center',
        loadComponent: () => import('./features/help-center/help-center').then((m) => m.HelpCenter),
      },
      {
        path: 'help-center/:id',
        loadComponent: () =>
          import('./features/help-center/article-detail/article-detail').then(
            (m) => m.ArticleDetail,
          ),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
