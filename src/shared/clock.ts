/**
 * Turn-countdown arithmetic for the client. Pure, with no DOM or Cloudflare
 * dependency, so it runs in plain Node under vitest.
 *
 * The subtlety worth stating: where the clock offset is measured. `sync` takes
 * it once per server snapshot; re-deriving it on every tick would cancel out
 * the elapsed time — `deadline - (now - (now - serverTime))` is just
 * `deadline - serverTime` — and freeze the displayed value between broadcasts.
 * That was the countdown bug this replaced.
 */
/**
 * **The last ten seconds.** The one number that decides when the ring reddens
 * and the felt warms; it lives here, next to the countdown, so the CSS class and
 * the unit test cannot drift apart on what "urgent" means.
 */
export const COUNTDOWN_URGENT_SECONDS = 10;

/**
 * One countdown, for both render sites: the whole seconds to show, the fraction
 * of the phase window still to run (1 = full ring, 0 = drained), and whether the
 * last-ten-seconds treatment applies. Keeping all three in one place is what
 * stops the seat ring and the waiting-card ring diverging — they are the same
 * clock drawn twice.
 */
export interface CountdownView {
  seconds: number;
  fraction: number;
  urgent: boolean;
}

export class TurnClock {
  /** Client clock minus server clock, from the most recent snapshot. */
  private drift = 0;

  /** Capture the clock offset. Call this once per server snapshot. */
  sync(serverTime: number, now = Date.now()): void {
    this.drift = now - serverTime;
  }

  /** Seconds until `deadlineAt` against the live client clock, or null. */
  secondsLeft(deadlineAt: number | null, now = Date.now()): number | null {
    if (deadlineAt === null) return null;
    return Math.max(0, Math.ceil((deadlineAt - (now - this.drift)) / 1000));
  }

  /**
   * The countdown as the ring needs it. `seconds` is `secondsLeft`; `fraction`
   * is the un-rounded remainder over the window so the ring drains smoothly;
   * `urgent` is the last-ten-seconds window, measured once here so the felt and
   * the ring change together.
   *
   * `startedAt` is the phase's start (the snapshot's `turnStartedAt`). A missing
   * start leaves the ring full rather than snapping it to empty, and a deadline
   * past its window clamps to 0.
   */
  countdown(
    startedAt: number | null,
    deadlineAt: number | null,
    now = Date.now(),
  ): CountdownView | null {
    if (deadlineAt === null) return null;
    const remainingMs = Math.max(0, deadlineAt - (now - this.drift));
    const seconds = Math.ceil(remainingMs / 1000);
    const span = startedAt === null ? 0 : deadlineAt - startedAt;
    return {
      seconds,
      fraction: span > 0 ? Math.min(1, remainingMs / span) : 1,
      urgent: seconds <= COUNTDOWN_URGENT_SECONDS,
    };
  }

  /**
   * The same live clock expressed in server time, for callers that need an
   * instant rather than a whole-second countdown. The showdown uses it to place
   * a rebuilt subtree at the frame the animation had already reached, using the
   * one drift measurement `sync` captured.
   */
  now(now = Date.now()): number {
    return now - this.drift;
  }
}
