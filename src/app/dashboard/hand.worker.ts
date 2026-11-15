import {
  simulateField,
  solveField,
  type SimOptions,
  type SolveInput,
  type SolveOutput,
} from './water-core';

/**
 * Runs the terrain maths off the main thread so the page stays responsive.
 *
 * One worker per prepared terrain. It solves HAND once and keeps the result, so a scenario slider
 * only repeats the cheap stage-and-depth step.
 *
 * Messages in:
 *  - { type: 'solve', input: SolveInput }            -> { type: 'solved', ok, meta } (keeps HAND)
 *  - { type: 'simulate', id, options: SimOptions }   -> { type: 'simulated', id, ok, result }
 *  - { type: 'legacy', input: SolveInput }           -> { type: 'legacy', ok, hand, mainRiver, seedFound }
 */
type In =
  | { type: 'solve'; input: SolveInput }
  | { type: 'simulate'; id: number; options: SimOptions }
  | { type: 'legacy'; input: SolveInput };

const post = (message: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);

let solved: SolveOutput | null = null;

self.onmessage = (event: MessageEvent<In>) => {
  const msg = event.data;
  try {
    if (msg.type === 'solve') {
      solved = solveField(msg.input);
      const { hand: _hand, mainRiver: _main, reachMask: _reach, ...meta } = solved;
      void _hand;
      void _main;
      void _reach;
      post({ type: 'solved', ok: true, meta });
    } else if (msg.type === 'simulate') {
      if (!solved) throw new Error('Terrain is not ready');
      const result = simulateField(solved, msg.options);
      post({ type: 'simulated', id: msg.id, ok: true, result }, [
        result.depth.buffer,
        result.highEdge.buffer,
      ]);
    } else if (msg.type === 'legacy') {
      const out = solveField(msg.input);
      post(
        {
          type: 'legacy',
          ok: true,
          hand: out.hand,
          mainRiver: out.mainRiver,
          seedFound: out.seedFound,
        },
        [out.hand.buffer, out.mainRiver.buffer],
      );
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'failed';
    post({
      type: msg.type === 'simulate' ? 'simulated' : msg.type === 'legacy' ? 'legacy' : 'solved',
      id: msg.type === 'simulate' ? msg.id : undefined,
      ok: false,
      error,
    });
  }
};
