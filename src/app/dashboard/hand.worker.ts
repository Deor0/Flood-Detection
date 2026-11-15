import { solveField, type SolveInput } from './water-core';

/** Runs the terrain maths off the main thread so the page stays responsive. */
self.onmessage = (event: MessageEvent<SolveInput>) => {
  try {
    const out = solveField(event.data);
    (self as unknown as Worker).postMessage({ ok: true, ...out }, [
      out.hand.buffer,
      out.mainRiver.buffer,
    ]);
  } catch (e) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: e instanceof Error ? e.message : 'failed',
    });
  }
};
