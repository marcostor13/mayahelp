import { vi } from 'vitest';
import { Router } from '@angular/router';
import { ChangePassword } from './change-password';
import { AuthService } from '../../../core/services/auth.service';

/** El componente expone todo como `protected`; los tests lo miran desde afuera. */
type Page = ChangePassword & {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
  error: { (): string | null };
  canSubmit: boolean;
  mismatch: boolean;
  forced(): boolean;
};

function component(params: { forced?: boolean; change?: ReturnType<typeof vi.fn> } = {}) {
  const change = params.change ?? vi.fn().mockResolvedValue({});
  const auth = {
    mustChangePassword: () => params.forced ?? false,
    changePassword: change,
  } as unknown as AuthService;
  const navigate = vi.fn().mockResolvedValue(true);
  const router = { navigateByUrl: navigate } as unknown as Router;
  return {
    page: new ChangePassword(auth, router) as unknown as Page,
    change,
    navigate,
  };
}

describe('ChangePassword', () => {
  it('no habilita el envío hasta que la nueva tenga 8 caracteres y coincida', () => {
    const { page } = component();

    page.currentPassword = 'temporal1';
    page.newPassword = 'corta';
    page.confirmation = 'corta';
    expect(page.canSubmit).toBe(false);

    page.newPassword = 'mi-clave-nueva';
    page.confirmation = 'mi-clave-nuev';
    expect(page.canSubmit).toBe(false);
    expect(page.mismatch).toBe(true);

    page.confirmation = 'mi-clave-nueva';
    expect(page.canSubmit).toBe(true);
    expect(page.mismatch).toBe(false);
  });

  it('exige la contraseña actual', () => {
    const { page } = component();

    page.newPassword = 'mi-clave-nueva';
    page.confirmation = 'mi-clave-nueva';
    expect(page.canSubmit).toBe(false);
  });

  it('cambia la contraseña y lleva al dashboard', async () => {
    const { page, change, navigate } = component();

    page.currentPassword = 'temporal1';
    page.newPassword = 'mi-clave-nueva';
    page.confirmation = 'mi-clave-nueva';
    await page.submit();

    expect(change).toHaveBeenCalledWith('temporal1', 'mi-clave-nueva');
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('muestra el mensaje de la API cuando el cambio falla', async () => {
    const change = vi
      .fn()
      .mockRejectedValue({ error: { message: 'La contraseña actual no es correcta' } });
    const { page, navigate } = component({ change });

    page.currentPassword = 'equivocada';
    page.newPassword = 'mi-clave-nueva';
    page.confirmation = 'mi-clave-nueva';
    await page.submit();

    expect(page.error()).toBe('La contraseña actual no es correcta');
    expect(navigate).not.toHaveBeenCalled();
  });

  /** El texto cambia según se llegue por un reseteo o por decisión propia. */
  it('sabe si el cambio es obligatorio', () => {
    expect(component({ forced: true }).page.forced()).toBe(true);
    expect(component().page.forced()).toBe(false);
  });
});
