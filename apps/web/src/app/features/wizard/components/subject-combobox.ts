import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import type { ControlValueAccessor } from '@angular/forms';
import type { SubjectSummary } from '@ccb/contracts';

import { libraryNameError } from '../../library/library-name.validator';

let nextComboboxId = 0;

@Component({
  selector: 'ccb-subject-combobox',
  template: `
    <div class="combobox" [class.is-open]="open()">
      <div class="combobox__control">
        <input
          #input
          [id]="inputId()"
          type="text"
          role="combobox"
          autocomplete="off"
          spellcheck="false"
          aria-autocomplete="list"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="listId()"
          [attr.aria-activedescendant]="activeOptionId()"
          [attr.aria-invalid]="invalid()"
          [attr.aria-describedby]="describedBy()"
          [disabled]="isDisabled()"
          [value]="query()"
          [placeholder]="creating() ? 'Creating subject…' : 'Search or create a subject'"
          (input)="onInput($event)"
          (keydown)="onKeydown($event)"
          (blur)="onBlur()"
          (focus)="open.set(true)"
        />
        <span class="combobox__chevron" aria-hidden="true"></span>
      </div>

      @if (open() && !isDisabled()) {
        <ul class="combobox__list" [id]="listId()" role="listbox" aria-label="Subjects">
          @for (subject of filteredSubjects(); track subject.id; let index = $index) {
            <li
              role="option"
              tabindex="-1"
              class="combobox__option"
              [id]="optionId(index)"
              [class.is-active]="activeIndex() === index"
              [attr.aria-selected]="subject.id === value()"
              (mousedown)="$event.preventDefault()"
              (click)="selectSubject(subject)"
              (keydown.enter)="selectSubject(subject)"
              (keydown.space)="selectSubject(subject)"
            >
              <span>{{ subject.name }}</span>
              <span class="combobox__count">
                {{ subject.courses.length }}
                {{ subject.courses.length === 1 ? 'course' : 'courses' }}
              </span>
            </li>
          }

          @if (canCreate()) {
            <li
              role="option"
              tabindex="-1"
              class="combobox__option combobox__option--create"
              [id]="optionId(filteredSubjects().length)"
              [class.is-active]="activeIndex() === filteredSubjects().length"
              [attr.aria-selected]="false"
              [attr.aria-disabled]="createError() !== null || creating()"
              (mousedown)="$event.preventDefault()"
              (click)="createSubject()"
              (keydown.enter)="createSubject()"
              (keydown.space)="createSubject()"
            >
              <span>
                {{ creating() ? 'Creating…' : 'Create “' + query().trim() + '”' }}
              </span>
              <span class="combobox__create-mark" aria-hidden="true">+</span>
            </li>
          }

          @if (filteredSubjects().length === 0 && !canCreate()) {
            <li class="combobox__empty" role="presentation">Type a subject name to create one.</li>
          }
        </ul>
      }

      @if (canCreate() && createError(); as message) {
        <p class="combobox__hint">{{ message }}</p>
      }
    </div>
  `,
  styleUrl: './subject-combobox.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SubjectCombobox),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubjectCombobox implements ControlValueAccessor {
  readonly inputId = input(`course-subject-${nextComboboxId++}`);
  readonly subjects = input<SubjectSummary[]>([]);
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly creating = input(false);
  readonly createRequested = output<string>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly inputElement = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly listId = computed(() => `${this.inputId()}-list`);
  protected readonly value = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  private readonly formDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());

  protected readonly filteredSubjects = computed(() => {
    const query = normalize(this.query());
    if (query.length === 0) return this.subjects();
    return this.subjects().filter((subject) => normalize(subject.name).includes(query));
  });

  protected readonly canCreate = computed(() => {
    const query = this.query().trim();
    if (query.length === 0) return false;
    return !this.subjects().some((subject) => normalize(subject.name) === normalize(query));
  });

  protected readonly createError = computed(() => {
    if (!this.canCreate()) return null;
    return libraryNameError(this.query().trim());
  });

  protected readonly activeOptionId = computed(() => {
    if (!this.open()) return null;
    return this.optionId(this.activeIndex());
  });

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    effect(() => {
      const subjects = this.subjects();
      const selected = this.value();
      if (selected === null || this.open()) return;
      const subject = subjects.find((entry) => entry.id === selected);
      if (subject !== undefined) this.query.set(subject.name);
    });
  }

  writeValue(value: string | null): void {
    this.value.set(value);
    const subject = this.subjects().find((entry) => entry.id === value);
    this.query.set(subject?.name ?? '');
    this.activeIndex.set(0);
    if (value !== null) this.open.set(false);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
    if (disabled) this.open.set(false);
  }

  protected optionId(index: number): string {
    return `${this.inputId()}-option-${index}`;
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.open.set(true);
    this.activeIndex.set(0);

    if (this.value() !== null) {
      const selected = this.subjects().find((subject) => subject.id === this.value());
      if (selected === undefined || selected.name !== value) {
        this.value.set(null);
        this.onChange(null);
      }
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const optionCount = this.filteredSubjects().length + (this.canCreate() ? 1 : 0);

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        this.activeIndex.update((index) => Math.min(optionCount - 1, index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open.set(true);
        this.activeIndex.update((index) => Math.max(0, index - 1));
        break;
      case 'Home':
        if (this.open()) {
          event.preventDefault();
          this.activeIndex.set(0);
        }
        break;
      case 'End':
        if (this.open()) {
          event.preventDefault();
          this.activeIndex.set(Math.max(0, optionCount - 1));
        }
        break;
      case 'Enter': {
        if (!this.open()) return;
        event.preventDefault();
        const subjects = this.filteredSubjects();
        const active = subjects[this.activeIndex()];
        if (active !== undefined) {
          this.selectSubject(active);
        } else if (this.canCreate() && this.activeIndex() === subjects.length) {
          this.createSubject();
        }
        break;
      }
      case 'Escape':
        this.open.set(false);
        break;
      case 'Tab':
        this.open.set(false);
        break;
    }
  }

  protected onBlur(): void {
    this.onTouched();
  }

  protected selectSubject(subject: SubjectSummary): void {
    this.value.set(subject.id);
    this.query.set(subject.name);
    this.open.set(false);
    this.onChange(subject.id);
    this.onTouched();
    this.inputElement()?.nativeElement.focus();
  }

  protected createSubject(): void {
    if (this.creating() || this.createError() !== null) return;
    const name = this.query().trim();
    if (name.length === 0) return;
    this.createRequested.emit(name);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}
