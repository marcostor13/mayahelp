import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  NotificationSettings,
  NotificationTestResult,
  UpdateNotificationSettingsPayload,
} from '../models/app-settings.model';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  private readonly baseUrl = `${environment.apiUrl}/settings/notifications`;

  constructor(private readonly http: HttpClient) {}

  getNotifications() {
    return this.http.get<NotificationSettings>(this.baseUrl);
  }

  updateNotifications(payload: UpdateNotificationSettingsPayload) {
    return this.http.patch<NotificationSettings>(this.baseUrl, payload);
  }

  sendTest() {
    return this.http.post<NotificationTestResult>(`${this.baseUrl}/test`, {});
  }
}
