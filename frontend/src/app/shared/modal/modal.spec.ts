import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Modal, ModalFooter } from './modal';

/**
 * Anfitrión de prueba: el diálogo vive dentro de otra pantalla y se abre y cierra desde
 * ahí, que es como lo usan Usuarios, Backups y el resto.
 */
@Component({
  imports: [Modal, ModalFooter],
  template: `
    <button type="button" id="trigger" (click)="open.set(true)">Abrir</button>
    @if (open()) {
      <app-modal
        heading="Editar cuenta"
        description="ana@acme.com"
        icon="manage_accounts"
        [busy]="busy()"
        (closed)="open.set(false)"
      >
        <input id="primer-campo" />
        <input id="ultimo-campo" />
        @if (withFooter()) {
          <div modalFooter><button type="button" id="guardar">Guardar</button></div>
        }
      </app-modal>
    }
  `,
})
class Host {
  readonly open = signal(true);
  readonly busy = signal(false);
  readonly withFooter = signal(true);
}

describe('Modal', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function card(): HTMLElement {
    return fixture.nativeElement.querySelector('.modal-card');
  }

  function backdrop(): HTMLElement {
    return fixture.nativeElement.querySelector('.modal-backdrop');
  }

  function press(key: string, shiftKey = false): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    fixture.detectChanges();
  }

  it('se anuncia como diálogo y toma su nombre del encabezado', () => {
    expect(card().getAttribute('role')).toBe('dialog');
    expect(card().getAttribute('aria-modal')).toBe('true');

    const heading = fixture.nativeElement.querySelector('h2');
    expect(card().getAttribute('aria-labelledby')).toBe(heading.id);
    expect(heading.textContent).toContain('Editar cuenta');
  });

  it('se cierra con Escape', () => {
    press('Escape');

    expect(host.open()).toBe(false);
  });

  it('se cierra al hacer clic en el fondo', () => {
    backdrop().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(host.open()).toBe(false);
  });

  /** Arrastrar desde adentro y soltar sobre el fondo no debería descartar lo escrito. */
  it('no se cierra con un clic que nace dentro del diálogo', () => {
    card().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(host.open()).toBe(true);
  });

  it('mientras guarda no se cierra ni por Escape ni por el fondo', () => {
    host.busy.set(true);
    fixture.detectChanges();

    press('Escape');
    backdrop().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(host.open()).toBe(true);
    const close = fixture.nativeElement.querySelector('button[aria-label="Cerrar"]');
    expect(close.disabled).toBe(true);
  });

  it('bloquea el scroll del fondo mientras está abierto y lo devuelve al cerrar', () => {
    expect(document.body.style.overflow).toBe('hidden');

    press('Escape');

    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('arranca con el foco en el primer campo', () => {
    expect(document.activeElement?.id).toBe('primer-campo');
  });

  /** Sin esto el tabulador se va al fondo, que para quien mira está tapado. */
  it('atrapa el tabulador adentro', () => {
    const close = fixture.nativeElement.querySelector('button[aria-label="Cerrar"]');
    const save = fixture.nativeElement.querySelector('#guardar');

    // Desde el último control, avanzar vuelve al primero del diálogo (el de cerrar).
    save.focus();
    press('Tab');

    expect(document.activeElement).toBe(close);

    // Y desde el primero, retroceder vuelve al último.
    press('Tab', true);

    expect(document.activeElement).toBe(save);
  });

  it('omite el pie cuando la pantalla no proyecta acciones', () => {
    host.withFooter.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.modal-footer')).toBeNull();
  });
});
