import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  protected email = '';
  protected password = '';
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
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('Correo o contraseña incorrectos.');
    } finally {
      this.loading.set(false);
    }
  }
}
