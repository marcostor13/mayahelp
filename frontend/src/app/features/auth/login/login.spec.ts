import { vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Login } from './login';
import { AuthService } from '../../../core/services/auth.service';
import { User } from '../../../core/models/user.model';

/** El componente expone todo como `protected`; los tests lo miran desde afuera. */
type Page = Login & {
  email: string;
  password: string;
  error(): string | null;
};

function page(
  login: ReturnType<typeof vi.fn>,
  navigate = vi.fn().mockResolvedValue(true),
) {
  const auth = { login } as unknown as AuthService;
  const router = { navigateByUrl: navigate } as unknown as Router;
  const component = new Login(auth, router) as unknown as Page;
  component.email = 'ana@acme.com';
  component.password = 'la-contraseña';
  return { component, navigate };
}

/** Rechazo tal como llega de Angular: con estado, que es lo que decide el mensaje. */
function rejectingWith(status: number, message?: string) {
  return vi
    .fn()
    .mockRejectedValue(
      new HttpErrorResponse({ status, error: message ? { message } : null }),
    );
}

describe('Login', () => {
  it('lleva al dashboard cuando la cuenta entra', async () => {
    const user = { id: 'u1', role: 'client' } as User;
    const { component, navigate } = page(vi.fn().mockResolvedValue(user));

    await component.submit();

    expect(navigate).toHaveBeenCalledWith('/dashboard');
    expect(component.error()).toBeNull();
  });

  it('manda al cambio de contraseña si la cuenta viene reseteada', async () => {
    const user = { id: 'u1', role: 'client', mustChangePassword: true } as User;
    const { component, navigate } = page(vi.fn().mockResolvedValue(user));

    await component.submit();

    expect(navigate).toHaveBeenCalledWith('/cambiar-contrasena');
  });

  /** Lo importante: quien tiene la cuenta desactivada entiende por qué no entra. */
  it('muestra el motivo que manda la API', async () => {
    const { component, navigate } = page(
      rejectingWith(401, 'Tu cuenta está desactivada. Contactá al administrador.'),
    );

    await component.submit();

    expect(component.error()).toBe(
      'Tu cuenta está desactivada. Contactá al administrador.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('usa un texto más claro para el rechazo genérico de credenciales', async () => {
    const { component } = page(rejectingWith(401, 'Credenciales inválidas'));

    await component.submit();

    expect(component.error()).toBe('Correo o contraseña incorrectos.');
  });
});

/**
 * El caso que mandó a buscar el problema al lugar equivocado: la contraseña estaba
 * bien, la API respondía 200, y la pantalla igual decía "correo o contraseña
 * incorrectos". Culpar a las credenciales solo corresponde ante un 401.
 */
describe('Login — no culpar a la contraseña por otra cosa', () => {
  it('no dice credenciales cuando el login anduvo y falla la navegación', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const user = { id: 'u1', role: 'client' } as User;
    const { component } = page(
      vi.fn().mockResolvedValue(user),
      vi.fn().mockRejectedValue(new Error('Failed to fetch dynamically imported module')),
    );

    await component.submit();

    expect(component.error()).not.toContain('incorrectos');
    expect(component.error()).toContain('recargar');
    // La recarga trae el index.html nuevo, que es lo que arregla el chunk viejo.
    expect(assign).toHaveBeenCalledWith('/dashboard');
    vi.unstubAllGlobals();
  });

  /** status 0: no llegó a la API. Nada que ver con lo que se escribió. */
  it('avisa que no se pudo conectar cuando la petición no llega', async () => {
    const { component } = page(rejectingWith(0));

    await component.submit();

    expect(component.error()).toContain('No se pudo conectar');
  });

  it('no culpa a las credenciales ante un error del servidor', async () => {
    const { component } = page(rejectingWith(500));

    await component.submit();

    expect(component.error()).toBe(
      'No se pudo iniciar sesión. Intentá de nuevo en un momento.',
    );
  });
});
