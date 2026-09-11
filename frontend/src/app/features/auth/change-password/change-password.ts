import { Component, computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

const MIN_LENGTH = 8;

@Component({
  selector: 'app-change-password',
  imports: [FormsModule],
  templateUrl: './change-password.html',
})
export class ChangePassword {
  protected readonly minLength = MIN_LENGTH;
  protected currentPassword = '';
  protected newPassword = '';
  protected confirmation = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Solo el reseteo obliga a pasar por acá; el resto entra por su perfil. */
  protected readonly forced = computed(() => this.auth.mustChangePassword());

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  get mismatch(): boolean {
    return this.confirmation.length > 0 && this.newPassword !== this.confirmation;
  }

  get canSubmit(): boolean {
    return (
      this.currentPassword.length > 0 &&
      this.newPassword.length >= MIN_LENGTH &&
      this.newPassword === this.confirmation
    );
  }

  async submit(): Promise<void> {
    if (!this.canSubmit) return;
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.changePassword(this.currentPassword, this.newPassword);
      await this.router.navigateByUrl('/dashboard');
    } catch (err) {
      const message = (err as HttpErrorResponse)?.error as
        | { message?: string | string[] }
        | undefined;
      this.error.set(
        message?.message?.toString() ?? 'No se pudo cambiar la contraseña.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
