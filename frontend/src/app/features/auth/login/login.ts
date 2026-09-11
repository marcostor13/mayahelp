import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
      const user = await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl(
        user.mustChangePassword ? '/cambiar-contrasena' : '/dashboard',
      );
    } catch (err) {
      this.error.set(this.messageFor(err));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * La API manda un motivo cuando lo hay (cuenta desactivada, por ejemplo). Para el
   * rechazo genérico de credenciales preferimos un texto más claro que el de la API.
   */
  private messageFor(err: unknown): string {
    const message = (err as HttpErrorResponse)?.error as
      | { message?: string | string[] }
      | undefined;
    const text = message?.message?.toString();
    return !text || text === 'Credenciales inválidas'
      ? 'Correo o contraseña incorrectos.'
      : text;
  }
}
