import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AttachmentPreviews } from './attachment-previews';

describe('AttachmentPreviews', () => {
  let fixture: ComponentFixture<AttachmentPreviews>;
  let created: string[];
  let revoked: string[];

  function imageFile(name: string): File {
    return new File([new Uint8Array(1)], name, { type: 'image/png' });
  }

  beforeEach(async () => {
    created = [];
    revoked = [];
    let next = 0;
    URL.createObjectURL = ((): string => {
      const url = `blob:preview-${next++}`;
      created.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => revoked.push(url)) as typeof URL.revokeObjectURL;

    await TestBed.configureTestingModule({ imports: [AttachmentPreviews] }).compileComponents();
    fixture = TestBed.createComponent(AttachmentPreviews);
  });

  function setFiles(files: File[]): void {
    fixture.componentRef.setInput('files', files);
    fixture.detectChanges();
  }

  function thumbnails(): HTMLImageElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.attachment-preview img'));
  }

  it('shows a thumbnail of every pending image', () => {
    setFiles([imageFile('captura-1.png'), imageFile('captura-2.png')]);

    expect(thumbnails().length).toBe(2);
    expect(thumbnails()[0].getAttribute('src')).toBe(created[0]);
  });

  it('renders an icon instead of a thumbnail for a non-image file', () => {
    setFiles([new File([new Uint8Array(1)], 'manual.pdf', { type: 'application/pdf' })]);

    expect(thumbnails().length).toBe(0);
    expect(created.length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('manual.pdf');
  });

  it('keeps the same object URL across re-renders instead of recreating it', () => {
    const file = imageFile('captura.png');
    setFiles([file]);
    setFiles([file, imageFile('otra.png')]);

    expect(created.length).toBe(2);
    expect(thumbnails()[0].getAttribute('src')).toBe(created[0]);
  });

  it('revokes the object URL of a removed file', () => {
    const first = imageFile('captura.png');
    setFiles([first, imageFile('otra.png')]);
    setFiles([first]);

    expect(revoked).toEqual([created[1]]);
  });

  it('emits the index of the file to remove', () => {
    const removed: number[] = [];
    setFiles([imageFile('a.png'), imageFile('b.png')]);
    fixture.componentInstance.remove.subscribe((index) => removed.push(index));

    const buttons = fixture.nativeElement.querySelectorAll('.attachment-preview-remove');
    (buttons[1] as HTMLButtonElement).click();

    expect(removed).toEqual([1]);
  });

  it('opens the picture full size when its thumbnail is clicked', () => {
    setFiles([imageFile('captura.png')]);

    (fixture.nativeElement.querySelector('.attachment-preview button') as HTMLElement).click();
    fixture.detectChanges();

    const viewer = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(viewer).toBeTruthy();
    expect((viewer.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe(created[0]);
  });

  it('closes the full size view when the removed file was the one being viewed', () => {
    setFiles([imageFile('captura.png')]);
    (fixture.nativeElement.querySelector('.attachment-preview button') as HTMLElement).click();
    fixture.detectChanges();

    setFiles([]);

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('revokes every object URL when the form goes away', () => {
    setFiles([imageFile('a.png'), imageFile('b.png')]);

    fixture.destroy();

    expect(revoked.sort()).toEqual([...created].sort());
  });
});
