import { Directive, ElementRef, afterNextRender, inject } from '@angular/core';

@Directive({
  selector: '[ccbWizardHeading]',
  host: { tabindex: '-1' },
})
export class WizardHeadingFocus {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      this.element.nativeElement.focus();
    });
  }
}
