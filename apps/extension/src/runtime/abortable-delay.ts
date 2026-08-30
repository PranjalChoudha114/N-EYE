import { delay } from './page-ports.js';

/**
 * Cancellable delay (Zone 2/4).
 * WHY: Retry backoff and WAIT must stop when the user cancels. An uncancellable
 *      setTimeout would let a late retry fire after CANCELLED.
 */
export function abortableDelay(
  ms: number,
  signal?: AbortSignal,
  scheduler: (ms: number) => Promise<void> = delay
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }
  const waitMs = Math.max(0, ms);
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    scheduler(waitMs).then(
      () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        if (signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        resolve();
      },
      (err: unknown) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}
