import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ScanWarning } from '@ccb/contracts';

@Component({
  selector: 'ccb-library-warnings',
  template: `
    @if (warnings().length > 0) {
      <aside class="warnings" aria-label="Library notices">
        <div class="warnings__summary">
          <span class="warnings__mark" aria-hidden="true">!</span>
          <div>
            <p class="warnings__title">Library needed a few repairs</p>
            <p class="warnings__body">
              {{ warnings().length }} item{{ warnings().length === 1 ? '' : 's' }} were found while
              reading the folders. Nothing was overwritten.
            </p>
          </div>
          <button type="button" class="warnings__dismiss" (click)="dismiss.emit()">Dismiss</button>
        </div>

        <details class="warnings__details">
          <summary>Review details</summary>
          <ul class="warnings__list">
            @for (
              warning of warnings();
              track warning.code + (warning.path ?? '') + warning.message
            ) {
              <li>
                <p>{{ warning.message }}</p>
                @if (warning.path; as path) {
                  <code>{{ path }}</code>
                }
              </li>
            }
          </ul>
        </details>
      </aside>
    }
  `,
  styleUrl: './library-warnings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryWarnings {
  readonly warnings = input.required<ScanWarning[]>();
  readonly dismiss = output<void>();
}
