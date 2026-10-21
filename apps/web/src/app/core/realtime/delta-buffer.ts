export interface DeltaFlush {
  outline: string;
  sections: Map<number, string>;
}

export class DeltaBuffer {
  private outline = '';
  private readonly sections = new Map<number, string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly flushCallback: (flush: DeltaFlush) => void,
    private readonly delayMs = 50,
  ) {}

  appendOutline(text: string): void {
    if (text.length === 0) return;
    this.outline += text;
    this.schedule();
  }

  appendSection(sectionNumber: number, text: string): void {
    if (text.length === 0) return;
    this.sections.set(sectionNumber, (this.sections.get(sectionNumber) ?? '') + text);
    this.schedule();
  }

  flush(): void {
    this.clearTimer();
    if (this.outline.length === 0 && this.sections.size === 0) return;

    const flush: DeltaFlush = { outline: this.outline, sections: new Map(this.sections) };
    this.outline = '';
    this.sections.clear();
    this.flushCallback(flush);
  }

  reset(): void {
    this.clearTimer();
    this.outline = '';
    this.sections.clear();
  }

  private schedule(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
