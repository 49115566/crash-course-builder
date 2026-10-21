import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ToastService } from './toast.service';

@Component({
  selector: 'ccb-toast-outlet',
  template: `
    <div class="toast-region">
      @for (toast of toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast--error]="toast.tone === 'error'"
          [class.toast--success]="toast.tone === 'success'"
          [attr.role]="toast.tone === 'error' ? 'alert' : 'status'"
        >
          <span class="toast__mark" aria-hidden="true"></span>
          <p class="toast__message">{{ toast.message }}</p>
          <button
            type="button"
            class="toast__close"
            aria-label="Dismiss notification"
            (click)="dismiss(toast.id)"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './toast-outlet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastOutlet {
  private readonly service = inject(ToastService);
  protected readonly toasts = this.service.toasts;

  protected dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
