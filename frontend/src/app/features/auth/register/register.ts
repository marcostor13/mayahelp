import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  protected name = '';
  protected email = '';
  protected password = '';
  protected company = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async submit() {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.register({
        name: this.name,
        email: this.email,
        password: this.password,
        company: this.company || undefined,
      });
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('No pudimos crear tu cuenta. Verifica los datos e intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
}
