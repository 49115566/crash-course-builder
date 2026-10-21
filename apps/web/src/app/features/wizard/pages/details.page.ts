import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AUDIENCE_MAX_LENGTH,
  INSTRUCTIONS_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  type SubjectSummary,
} from '@ccb/contracts';
import { firstValueFrom } from 'rxjs';

import type { ApiClientError } from '../../../core/api/api-error';
import { LibraryApiService } from '../../../core/api/library-api.service';
import { SessionApiService } from '../../../core/api/session-api.service';
import { BootstrapStore } from '../../../core/bootstrap/bootstrap.store';
import { routeForSession } from '../../../core/sessions/session-routing';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { libraryNameError } from '../../library/library-name.validator';
import { SessionWizardStore } from '../wizard.store';
import { SessionGate } from '../components/session-gate';
import { WizardHeadingFocus } from '../components/wizard-heading-focus';
import { SubjectCombobox } from '../components/subject-combobox';

type SubjectsStatus = 'loading' | 'ready' | 'error';

@Component({
  selector: 'ccb-details-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SessionGate,
    Spinner,
    SubjectCombobox,
    WizardHeadingFocus,
  ],
  templateUrl: './details.page.html',
  styleUrl: './details.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailsPage {
  private readonly api = inject(LibraryApiService);
  private readonly sessionApi = inject(SessionApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(SessionWizardStore);
  protected readonly bootstrap = inject(BootstrapStore);

  protected readonly sessionId = this.route.snapshot.paramMap.get('sessionId');
  protected readonly isEdit = this.sessionId !== null;
  protected readonly session = computed(() => this.store.session());
  protected readonly editingReview = computed(
    () => this.store.session()?.status === 'outline_review',
  );

  protected readonly subjects = signal<SubjectSummary[]>([]);
  protected readonly subjectsStatus = signal<SubjectsStatus>('loading');
  protected readonly subjectsError = signal<ApiClientError | null>(null);
  protected readonly creatingSubject = signal(false);
  protected readonly subjectCreateError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly submitError = signal<ApiClientError | null>(null);

  protected readonly form = new FormGroup({
    subjectId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    topic: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, Validators.maxLength(TOPIC_MAX_LENGTH)],
    }),
    audience: new FormControl('', {
      nonNullable: true,
      validators: [requiredText, Validators.maxLength(AUDIENCE_MAX_LENGTH)],
    }),
    instructions: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(INSTRUCTIONS_MAX_LENGTH)],
    }),
  });

  private readonly formEvents = toSignal(this.form.events, { initialValue: null });
  protected readonly canSubmit = computed(() => {
    this.formEvents();
    return (
      this.form.valid &&
      !this.saving() &&
      !this.creatingSubject() &&
      this.subjectsStatus() === 'ready'
    );
  });
  protected readonly instructionsLength = computed(() => {
    this.formEvents();
    return this.form.controls.instructions.value.length;
  });
  protected readonly instructionsRemaining = computed(
    () => INSTRUCTIONS_MAX_LENGTH - this.instructionsLength(),
  );
  protected readonly instructionsMax = INSTRUCTIONS_MAX_LENGTH;
  protected readonly topicMax = TOPIC_MAX_LENGTH;
  protected readonly audienceMax = AUDIENCE_MAX_LENGTH;

  constructor() {
    if (!this.isEdit) {
      this.store.reset();
    }
    void this.loadSubjects();
    void this.bootstrap.load();

    const session = this.store.session();
    if (session !== null) {
      this.form.patchValue({
        subjectId: session.subject.id,
        topic: session.input.topic,
        audience: session.input.audience,
        instructions: session.input.instructions ?? '',
      });
    }
  }

  protected retryLoad(): void {
    void this.store.retryLoad();
  }

  protected async loadSubjects(): Promise<void> {
    this.subjectsStatus.set('loading');
    this.subjectsError.set(null);

    try {
      const result = await firstValueFrom(this.api.getLibrary());
      this.subjects.set(result.data.subjects);
      this.subjectsStatus.set('ready');
      this.ensureSelectedSubject();
    } catch (error) {
      this.subjectsStatus.set('error');
      this.subjectsError.set(error as ApiClientError);
    }
  }

  protected async createSubject(name: string): Promise<void> {
    this.subjectCreateError.set(null);
    const nameError = libraryNameError(name);
    if (nameError !== null) {
      this.subjectCreateError.set(nameError);
      return;
    }

    this.creatingSubject.set(true);
    try {
      const result = await firstValueFrom(this.api.createSubject(name));
      const subject = result.data.subject;
      this.subjects.update((subjects) => [...subjects, subject]);
      this.form.controls.subjectId.setValue(subject.id);
      this.form.controls.subjectId.markAsTouched();
      this.toast.success(`Created “${subject.name}”.`);
    } catch (error) {
      const clientError = error as ApiClientError;
      this.subjectCreateError.set(clientError.message);
    } finally {
      this.creatingSubject.set(false);
    }
  }

  protected subjectError(): string {
    const control = this.form.controls.subjectId;
    if (control.hasError('required')) return 'Choose a subject, or create one.';
    return 'Choose a subject.';
  }

  protected topicError(): string {
    const control = this.form.controls.topic;
    if (control.hasError('required')) return 'Give this course a topic.';
    if (control.hasError('maxlength'))
      return `Keep the topic under ${TOPIC_MAX_LENGTH} characters.`;
    return 'Check the topic.';
  }

  protected audienceError(): string {
    const control = this.form.controls.audience;
    if (control.hasError('required')) return 'Describe who this course is for.';
    if (control.hasError('maxlength')) {
      return `Keep the audience under ${AUDIENCE_MAX_LENGTH} characters.`;
    }
    return 'Check the audience.';
  }

  protected instructionsError(): string | null {
    return this.form.controls.instructions.hasError('maxlength')
      ? `Keep instructions under ${INSTRUCTIONS_MAX_LENGTH} characters.`
      : null;
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.submitError.set(null);
    if (this.form.invalid || this.saving() || this.creatingSubject()) return;

    const value = this.form.getRawValue();
    const request = {
      subjectId: value.subjectId,
      topic: value.topic.trim(),
      audience: value.audience.trim(),
      ...(value.instructions.trim().length === 0
        ? {}
        : { instructions: value.instructions.trim() }),
    };

    this.saving.set(true);
    try {
      if (this.sessionId !== null) {
        const updated = await this.store.updateInputs(request);
        if (updated !== null) {
          await this.router.navigate(['/courses/new', updated.id, 'prompts']);
        }
        return;
      }

      const created = await firstValueFrom(this.sessionApi.create(request));
      await this.router.navigate(['/courses/new', created.session.id, 'prompts'], {
        replaceUrl: true,
      });
    } catch (error) {
      this.submitError.set(error as ApiClientError);
    } finally {
      this.saving.set(false);
    }
  }

  protected async backToCurrentStep(): Promise<void> {
    const session = this.store.session();
    if (session === null) {
      await this.router.navigate(['/']);
      return;
    }
    await this.router.navigateByUrl(routeForSession(session));
  }

  private ensureSelectedSubject(): void {
    const current = this.form.controls.subjectId.value;
    const available = this.subjects();
    if (current.length > 0 && available.some((subject) => subject.id === current)) return;

    const first = available[0];
    if (first !== undefined) {
      this.form.controls.subjectId.setValue(first.id);
    } else {
      this.form.controls.subjectId.setValue('');
    }
  }
}

function requiredText(control: AbstractControl<string>): { required: true } | null {
  return control.value.trim().length === 0 ? { required: true } : null;
}
