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
  it('should defer character timeline allocation until the rendered text is known', () => {
    const state = createState();
    updateStreamBlockAnimations({
      blocks: [block('ab')],
      renderNow: 100,
      ...state
    });
    const runtime = state.runtimes.get(0)!;
    expect(runtime.rawSource).toBe('ab');
    expect(runtime.births).toEqual([]);
    expect(runtime.styles).toEqual([]);
    expect(state.revealClock.lastTime).toBe(0);
  });

  it('should settle completed blocks and keep the active tail animated', () => {
    const state = createState();
    const blocks = [block('first', 0), block('second', 7)];
    updateStreamBlockAnimations({ blocks, renderNow: 100, ...state });
    state.runtimes.get(0)!.births = [100];

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
