import { vi } from 'vitest';
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

function page(login: ReturnType<typeof vi.fn>) {
  const auth = { login } as unknown as AuthService;
  const navigate = vi.fn().mockResolvedValue(true);
  const router = { navigateByUrl: navigate } as unknown as Router;
  const component = new Login(auth, router) as unknown as Page;
  component.email = 'ana@acme.com';
  component.password = 'la-contraseña';
  return { component, navigate };
}

function rejectingWith(message: string) {
  return vi.fn().mockRejectedValue({ error: { message } });
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
      rejectingWith('Tu cuenta está desactivada. Contactá al administrador.'),
    );

    await component.submit();

    expect(component.error()).toBe(
      'Tu cuenta está desactivada. Contactá al administrador.',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('usa un texto más claro para el rechazo genérico de credenciales', async () => {
    const { component } = page(rejectingWith('Credenciales inválidas'));

    await component.submit();

    expect(component.error()).toBe('Correo o contraseña incorrectos.');
  });

  it('cae al texto genérico si la respuesta no trae mensaje', async () => {
    const { component } = page(vi.fn().mockRejectedValue(new Error('network')));

    await component.submit();

    expect(component.error()).toBe('Correo o contraseña incorrectos.');
  });
});
