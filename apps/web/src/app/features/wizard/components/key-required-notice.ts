import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ccb-key-required-notice',
  template: `
    @if (visible()) {
      <div class="key-notice" role="note">
        <span class="key-notice__mark" aria-hidden="true"></span>
        <div>
          <p class="key-notice__title">Generation needs a DeepSeek key</p>
          <p class="key-notice__text">
            Add it with <code>npm run key:set</code>, then recheck the banner at the top. Your
            inputs and prompts are safe; nothing is sent until you generate.
          </p>
        </div>
      </div>
    }
  `,
  styleUrl: './key-required-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyRequiredNotice {
  readonly visible = input(false);
}
