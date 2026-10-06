/** Synchronous writes finish before an edit handler can navigate or suspend. */
export class PlannerLocalAutosave<T extends { start_date: string }> {
  private latest: T | null = null;
  private failed = false;
  private saved = false;

  private readonly write: (week: T) => T;

  constructor(write: (week: T) => T) {
    this.write = write;
  }

  load(week: T): T {
    if (this.failed && this.latest) {
      if (this.latest.start_date !== week.start_date) {
        throw new Error("Retry the unsaved week before switching weeks.");
      }
      return this.latest;
    }
    this.latest = week;
    this.saved = false;
    return week;
  }

  recovery(): T | null {
    return this.failed ? this.latest : null;
  }

  snapshot(): T | null {
    return this.latest;
  }

  hasFailure(): boolean {
    return this.failed;
  }

  hasSaved(): boolean {
    return this.saved;
  }

  edit(week: T): boolean {
    if (!this.latest || this.latest.start_date !== week.start_date) {
      throw new Error("An edit must belong to the loaded week.");
    }
    this.latest = week;
    // Retain further writing after failure without a repeated automatic retry loop.
    if (this.failed) return false;
    return this.persist();
  }

  retry(): boolean {
    return this.persist();
  }

  private persist(): boolean {
    if (!this.latest) return false;
    try {
      this.write(this.latest);
      this.failed = false;
      this.saved = true;
      return true;
    } catch {
      this.failed = true;
      this.saved = false;
      return false;
    }
  }
}
