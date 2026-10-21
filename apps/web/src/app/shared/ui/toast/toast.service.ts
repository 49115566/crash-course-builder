import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  tone: ToastTone;
  message: string;
}

const DEFAULT_DURATION_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private sequence = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = signal<ToastMessage[]>([]);

  success(message: string, duration = DEFAULT_DURATION_MS): void {
    this.show('success', message, duration);
  }

  error(message: string, duration = 8_000): void {
    this.show('error', message, duration);
  }

  info(message: string, duration = DEFAULT_DURATION_MS): void {
    this.show('info', message, duration);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  private show(tone: ToastTone, message: string, duration: number): void {
    this.sequence += 1;
    const id = this.sequence;
    this.toasts.update((toasts) => [...toasts, { id, tone, message }]);

    if (duration > 0) {
      const timer = setTimeout(() => {
        this.dismiss(id);
      }, duration);
      this.timers.set(id, timer);
    }
  }
}
