export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export class TestRunner {
  private results: TestResult[] = [];

  async run(name: string, fn: () => Promise<void>): Promise<void> {
    await this.runValue(name, fn);
  }

  /** Same as run(), but returns the value fn resolved to (or undefined if it threw) — for setup steps later tests build on. */
  async runValue<T>(name: string, fn: () => Promise<T> | T): Promise<T | undefined> {
    try {
      const value = await fn();
      this.results.push({ name, passed: true });
      console.log(`  ✓ ${name}`);
      return value;
    } catch (err) {
      const message = describeError(err);
      this.results.push({ name, passed: false, error: message });
      console.log(`  ✗ ${name}`);
      console.log(`    ${message}`);
      return undefined;
    }
  }

  summary() {
    const passed = this.results.filter((r) => r.passed).length;
    return {
      total: this.results.length,
      passed,
      failed: this.results.length - passed,
      results: this.results,
    };
  }
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Supabase/Postgrest throws plain error objects, not Error instances — surface their real message instead of "[object Object]". */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

interface PostgrestLikeResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/** Row(s) legitimately visible to this caller under RLS. */
export function expectSuccess<T>(result: PostgrestLikeResult<T>, context: string): T {
  assert(result.error === null, `${context}: expected success, got error: ${result.error?.message}`);
  assert(result.data !== null, `${context}: expected data, got null`);
  return result.data as T;
}

/**
 * A row that exists but is not owned by the caller. Under Postgres RLS, a
 * SELECT/UPDATE with a USING clause that excludes the row does not error —
 * it just silently matches zero rows. This is the actual database-enforced
 * outcome we're proving, not a UI convenience.
 */
export function expectFilteredToEmpty<T>(result: PostgrestLikeResult<T[]>, context: string): void {
  assert(
    result.error === null,
    `${context}: expected a silently-empty result (RLS filtering), got an error instead: ${result.error?.message}`,
  );
  assert(
    Array.isArray(result.data) && result.data.length === 0,
    `${context}: expected zero rows (RLS should have filtered this out), got ${JSON.stringify(result.data)}`,
  );
}

/**
 * An operation that must be rejected outright by the database (missing
 * GRANT, a WITH CHECK violation, or an RLS policy raising on INSERT). The
 * exact Postgres error code varies by rejection layer, so this checks that
 * an error occurred and logs it for human review rather than pattern-
 * matching brittle error text.
 */
export function expectDenied<T>(result: PostgrestLikeResult<T>, context: string): void {
  assert(
    result.error !== null,
    `${context}: expected the database to reject this operation, but it succeeded with data: ${JSON.stringify(result.data)}`,
  );
}
