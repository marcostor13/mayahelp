import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { Role } from '../../core/models/user.model';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/dashboard' },
  { label: 'Tickets', icon: 'confirmation_number', path: '/tickets' },
  { label: 'Proyectos', icon: 'folder_open', path: '/projects', roles: ['admin', 'agent'] },
  { label: 'Centro de Ayuda', icon: 'help', path: '/help-center' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly navItems = NAV_ITEMS;

  constructor(protected readonly auth: AuthService) {}

  protected readonly visibleNavItems = computed(() => {
    const role = this.auth.currentUser()?.role;
    return this.navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
  });

  protected readonly initials = computed(() => {
    const name = this.auth.currentUser()?.name ?? '';
    return name.charAt(0).toUpperCase() || '?';
  });

  async logout() {
    await this.auth.logout();
    location.href = '/login';
  }
}
