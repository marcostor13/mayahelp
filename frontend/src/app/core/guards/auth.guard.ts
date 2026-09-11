import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  // Tras un reseteo la API rechaza todo lo demás, así que no tiene sentido dejar entrar.
  if (authService.mustChangePassword()) {
    return router.createUrlTree(['/cambiar-contrasena']);
  }
  return true;
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }
  if (authService.mustChangePassword()) {
    return router.createUrlTree(['/cambiar-contrasena']);
  }
  return router.createUrlTree(['/dashboard']);
};

/** La pantalla de cambio de contraseña: hay que estar logueado, nada más. */
export const loggedInGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated() ? true : router.createUrlTree(['/login']);
};
