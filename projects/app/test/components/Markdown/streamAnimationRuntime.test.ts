import { describe, expect, it } from 'vitest';

import {
  resolveStreamRenderMode,
  resolveStreamBlockPlugins,
  updateStreamBlockAnimations,
  type StreamBlockRuntime
} from '@/components/Markdown/streamAnimationRuntime';

const block = (source: string, startOffset = 0) => ({ source, startOffset });
const createState = () => ({ runtimes: new Map<number, StreamBlockRuntime>() });

describe('updateStreamBlockAnimations', () => {
  it('should create one compact runtime for each block index', () => {
    const state = createState();
    const meta = updateStreamBlockAnimations({
      blocks: [block('first', 0), block('second', 7)],
      renderNow: 100,
      ...state
    });

    expect(meta.get(0)?.runtime).toMatchObject({
      rawSource: 'first',
      segments: [],
      visibleText: ''
    });
    expect(meta.get(1)?.runtime.rawSource).toBe('second');
  });

  it('should preserve block runtimes when formatting shifts source offsets', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('first', 0), block('second', 10)],
      renderNow: 100,
      ...state
    });
    const secondRuntime = state.runtimes.get(1);

    updateStreamBlockAnimations({
      blocks: [block('first ', 0), block('second', 11)],
      renderNow: 120,
      ...state
    });

    expect(state.runtimes.get(1)).toBe(secondRuntime);
  });

  it('should prune expired segments and removed block runtimes', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('first'), block('second', 7)],
      renderNow: 100,
      ...state
    });
    state.runtimes.get(0)!.segments = [{ bornAt: 100, end: 5, start: 0 }];

    updateStreamBlockAnimations({
      blocks: [block('first')],
      renderNow: 800,
      ...state
    });

    expect(state.runtimes.get(0)?.segments).toEqual([]);
    expect(state.runtimes.has(1)).toBe(false);
  });
});

describe('resolveStreamRenderMode', () => {
  it('should keep block rendering after a streamed response completes', () => {
    expect(resolveStreamRenderMode({ hasStreamed: false, showAnimation: false })).toBe(false);
    expect(resolveStreamRenderMode({ hasStreamed: false, showAnimation: true })).toBe(true);
    expect(resolveStreamRenderMode({ hasStreamed: true, showAnimation: false })).toBe(true);
  });
});

describe('resolveStreamBlockPlugins', () => {
  it('should reuse one plugin list stored on the block runtime', () => {
    const state = createState();
    updateStreamBlockAnimations({ blocks: [block('hello')], renderNow: 100, ...state });
    const runtime = state.runtimes.get(0)!;
    const basePlugins = [];

    const first = resolveStreamBlockPlugins({ basePlugins, runtime });
    const second = resolveStreamBlockPlugins({ basePlugins, runtime });

    expect(second).toBe(first);
  });
});
