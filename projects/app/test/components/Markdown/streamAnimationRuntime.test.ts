import { describe, expect, it } from 'vitest';

import {
  resolveStreamBlockPlugins,
  updateStreamBlockAnimations,
  type StreamBlockRuntime,
  type StreamPluginsCacheEntry
} from '@/components/Markdown/streamAnimationRuntime';

const block = (source: string, startOffset = 0) => ({ source, startOffset });

const createState = () => ({
  pluginsCache: new Map<number, StreamPluginsCacheEntry>(),
  revealClock: { lastTime: 0 },
  runtimes: new Map<number, StreamBlockRuntime>()
});

describe('updateStreamBlockAnimations', () => {
  it('should append births without changing existing character timing', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('ab')],
      renderNow: 100,
      ...state
    });
    const runtime = state.runtimes.get(0)!;
    const firstBirths = [...runtime.births];

    updateStreamBlockAnimations({
      blocks: [block('abcd')],
      renderNow: 150,
      ...state
    });

    expect(runtime.births.slice(0, 2)).toEqual(firstBirths);
    expect(runtime.births).toHaveLength(4);
    expect(runtime.births[2]).toBeGreaterThanOrEqual(150);
    expect(state.revealClock.lastTime).toBe(150);
  });

  it('should count Unicode code points instead of UTF-16 units', () => {
    const state = createState();

    updateStreamBlockAnimations({
      blocks: [block('a😀b')],
      renderNow: 100,
      ...state
    });

    expect(state.runtimes.get(0)?.births).toHaveLength(3);
  });

  it('should reset births and frozen styles after a non-append rewrite', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('hello')],
      renderNow: 100,
      ...state
    });
    const runtime = state.runtimes.get(0)!;
    runtime.styles[0] = 'animation-delay:-10ms';

    updateStreamBlockAnimations({
      blocks: [block('world')],
      renderNow: 200,
      ...state
    });

    expect(runtime.rawSource).toBe('world');
    expect(runtime.styles).toEqual([]);
    expect(runtime.births[0]).toBe(200);
  });

  it('should settle completed blocks and keep the active tail animated', () => {
    const state = createState();
    const blocks = [block('first', 0), block('second', 7)];
    updateStreamBlockAnimations({ blocks, renderNow: 100, ...state });

    const meta = updateStreamBlockAnimations({ blocks, renderNow: 500, ...state });

    expect(meta.get(0)?.settled).toBe(true);
    expect(meta.get(7)?.settled).toBe(false);
  });

  it('should prune runtimes and plugin caches for removed blocks', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('first', 0), block('second', 7)],
      renderNow: 100,
      ...state
    });
    state.pluginsCache.set(7, {} as StreamPluginsCacheEntry);

    updateStreamBlockAnimations({
      blocks: [block('first', 0)],
      renderNow: 200,
      ...state
    });

    expect(state.runtimes.has(7)).toBe(false);
    expect(state.pluginsCache.has(7)).toBe(false);
  });
});

describe('resolveStreamBlockPlugins', () => {
  it('should reuse plugins while the runtime and base plugins stay stable', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('hello')],
      renderNow: 100,
      ...state
    });
    const runtime = state.runtimes.get(0)!;
    const basePlugins = [];

    const first = resolveStreamBlockPlugins({
      basePlugins,
      pluginsCache: state.pluginsCache,
      runtime,
      startOffset: 0
    });
    const second = resolveStreamBlockPlugins({
      basePlugins,
      pluginsCache: state.pluginsCache,
      runtime,
      startOffset: 0
    });

    expect(second).toBe(first);
  });
});
