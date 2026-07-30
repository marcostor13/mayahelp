import { Component, computed, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { Role } from '../../core/models/user.model';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles?: Role[];
  /** Primary items get a slot in the mobile bottom bar; the rest live in the "Más" sheet. */
  primary?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard', primary: true },
  { label: 'Tickets', icon: 'confirmation_number', path: '/tickets', primary: true },
  {
    label: 'Mi cuenta',
    icon: 'account_circle',
    path: '/mi-cuenta',
    roles: ['client'],
    primary: true,
  },
  {
    label: 'Proyectos',
    icon: 'folder_open',
    path: '/projects',
    roles: ['admin', 'agent'],
    primary: true,
  },
  { label: 'Centro de Ayuda', icon: 'help', path: '/help-center', primary: true },
  { label: 'Monitoreo', icon: 'monitor_heart', path: '/monitoring', roles: ['admin', 'agent'] },
  {
    label: 'Implementaciones',
    icon: 'rocket_launch',
    path: '/implementations',
    roles: ['admin', 'agent'],
  },
  { label: 'Usuarios', icon: 'group', path: '/users', roles: ['admin'] },
  { label: 'Categorías', icon: 'sell', path: '/categories', roles: ['admin'] },
  { label: 'Templates WhatsApp', icon: 'forum', path: '/whatsapp-templates', roles: ['admin'] },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly navItems = NAV_ITEMS;
  protected readonly moreOpen = signal(false);
  protected search = '';

  constructor(
    protected readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  protected readonly visibleNavItems = computed(() => {
    const role = this.auth.currentUser()?.role;
    return this.navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
  });

  /** The bottom bar keeps 4 slots so the "Más" button always fits on a narrow screen. */
  protected readonly bottomNavItems = computed(() =>
    this.visibleNavItems()
      .filter((item) => item.primary)
      .slice(0, 4),
  );

  /** Everything the bottom bar could not fit, plus Ajustes, lives in the "Más" sheet. */
  protected readonly moreNavItems = computed(() => {
    const bottom = new Set(this.bottomNavItems().map((item) => item.path));
    return this.visibleNavItems().filter((item) => !bottom.has(item.path));
  });

  protected readonly initials = computed(() => {
    const name = this.auth.currentUser()?.name ?? '';
    return name.charAt(0).toUpperCase() || '?';
  });

  submitSearch(): void {
    const term = this.search.trim();
    this.router.navigate(['/tickets'], { queryParams: term ? { search: term } : {} });
  }

  closeMore(): void {
    this.moreOpen.set(false);
  }

  async logout() {
    await this.auth.logout();
    location.href = '/login';
  }
}
