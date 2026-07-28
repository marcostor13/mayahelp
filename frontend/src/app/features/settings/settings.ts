import { Component } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.html',
})
export class Settings {
  constructor(protected readonly auth: AuthService) {}
}
