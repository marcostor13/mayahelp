import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/user.model';

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

    let user: User;
    try {
      user = await this.auth.login(this.email, this.password);
    } catch (err) {
      this.error.set(this.messageFor(err));
      this.loading.set(false);
      return;
    }

    // De acá en más la sesión ya está abierta: lo que falle no son las credenciales.
    // Tenerlo en el mismo try que el login hacía que un login correcto terminara
    // mostrando "correo o contraseña incorrectos", que es exactamente lo que no pasó.
    const target = user.mustChangePassword ? '/cambiar-contrasena' : '/dashboard';
    try {
      await this.router.navigateByUrl(target);
    } catch {
      // Pasa sobre todo justo después de un despliegue: el index.html cacheado apunta
      // a chunks que ya no existen. La recarga trae el index nuevo y la sesión sigue.
      this.error.set('Entraste, pero hay que recargar la página. Un momento...');
      location.assign(target);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Solo un 401 es un problema de credenciales. Antes, cualquier error sin cuerpo
   * — la API caída, un corte de red, CORS — se reportaba como contraseña incorrecta,
   * y mandaba a buscar el problema al lugar equivocado.
   */
  private messageFor(err: unknown): string {
    const response = err as HttpErrorResponse | undefined;
    const text = (
      response?.error as { message?: string | string[] } | undefined
    )?.message?.toString();

    // status 0: la petición no llegó a la API (sin conexión, CORS, servidor caído).
    if (response?.status === 0) {
      return 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.';
    }
    if (response?.status === 401) {
      // La API manda un motivo cuando lo hay, como la cuenta desactivada.
      return !text || text === 'Credenciales inválidas'
        ? 'Correo o contraseña incorrectos.'
        : text;
    }
    return text ?? 'No se pudo iniciar sesión. Intentá de nuevo en un momento.';
  }
}
