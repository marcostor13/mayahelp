import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
})
export class Settings {
  protected phone = '';
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);

  constructor(protected readonly auth: AuthService) {
    effect(() => {
      this.phone = this.auth.currentUser()?.phone ?? '';
    });
  }

  savePhone(): void {
    this.saving.set(true);
    this.saved.set(false);
    this.auth.updateProfile({ phone: this.phone || undefined }).then(
      () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      () => this.saving.set(false),
    );
  }
}
