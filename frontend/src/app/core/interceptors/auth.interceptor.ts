import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

let refreshInFlight: Promise<string> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isApiRequest = req.url.startsWith(environment.apiUrl);
  const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/register') || req.url.includes('/auth/refresh');

  const token = authService.accessToken;
  const authorizedReq =
    isApiRequest && token && !isAuthEndpoint
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authorizedReq).pipe(
    catchError((error: unknown) => {
      const isUnauthorized = error instanceof HttpErrorResponse && error.status === 401;
      if (!isUnauthorized || !isApiRequest || isAuthEndpoint) {
        return throwError(() => error);
      }

      refreshInFlight ??= authService.refreshSession().finally(() => {
        refreshInFlight = null;
      });

      return from(refreshInFlight).pipe(
        switchMap((newToken) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })),
        ),
        catchError((refreshError: unknown) => {
          void authService.logout();
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
