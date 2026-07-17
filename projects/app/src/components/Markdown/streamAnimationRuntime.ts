import type { PluggableList } from 'unified';

import type { StreamAnimatedRuntime } from './rehypeStreamAnimated';
import { getStreamAnimationNow, rehypeStreamAnimated } from './rehypeStreamAnimated';
import type { MarkdownBlock } from './streamMarkdownBlocks';

export const STREAM_FADE_DURATION_MS = 180;
export { getStreamAnimationNow };

export type StreamBlockRuntime = StreamAnimatedRuntime & {
  rawSource: string;
  settled: boolean;
};

export type StreamBlockAnimationMeta = {
  runtime: StreamBlockRuntime;
  settled: boolean;
};

export type StreamPluginsCacheEntry = {
  basePlugins: PluggableList;
  runtime: StreamBlockRuntime;
  value: PluggableList;
};

type UpdateStreamBlockAnimationsParams = {
  blocks: MarkdownBlock[];
  renderNow: number;
  revealClock: { lastTime: number };
  runtimes: Map<number, StreamBlockRuntime>;
  pluginsCache: Map<number, StreamPluginsCacheEntry>;
};

/**
 * 维护各 Markdown block 的 runtime，并清理已经离开当前文档的缓存。
 *
 * 字符时间线由 rehype 在获得最终可见文本后更新；这里仅跟踪源码、block 生命周期和
 * settled 状态，避免 Markdown 控制符及虚拟闭合符占用可见字符下标。
 */
export const updateStreamBlockAnimations = ({
  blocks,
  renderNow,
  revealClock,
  runtimes,
  pluginsCache
}: UpdateStreamBlockAnimationsParams) => {
  const animationMeta = new Map<number, StreamBlockAnimationMeta>();
  const aliveOffsets = new Set<number>();

  blocks.forEach((block, index) => {
    aliveOffsets.add(block.startOffset);

    let runtime = runtimes.get(block.startOffset);
    if (!runtime) {
      runtime = {
        births: [],
        rawSource: '',
        revealClock,
        settled: false,
        styles: [],
        visibleText: ''
      };
      runtimes.set(block.startOffset, runtime);
    }

    if (runtime.rawSource !== block.source) {
      runtime.rawSource = block.source;
      runtime.settled = false;
    }

    const lastBirthTime = runtime.births.at(-1) ?? renderNow;
    const isStreamingBlock = index === blocks.length - 1;
    if (!isStreamingBlock && renderNow - lastBirthTime >= STREAM_FADE_DURATION_MS) {
      runtime.settled = true;
    }

    animationMeta.set(block.startOffset, {
      runtime,
      settled: runtime.settled
    });
  });

  for (const offset of runtimes.keys()) {
    if (!aliveOffsets.has(offset)) {
      runtimes.delete(offset);
      pluginsCache.delete(offset);
    }
  }

  return animationMeta;
};

/** 为活动 block 复用同一组 rehype 插件，避免每次流式 commit 重建 unified processor。 */
export const resolveStreamBlockPlugins = ({
  basePlugins,
  pluginsCache,
  runtime,
  startOffset
}: {
  basePlugins: PluggableList;
  pluginsCache: Map<number, StreamPluginsCacheEntry>;
  runtime: StreamBlockRuntime;
  startOffset: number;
}) => {
  const cached = pluginsCache.get(startOffset);
  if (cached?.basePlugins === basePlugins && cached.runtime === runtime) {
    return cached.value;
  }

  const value: PluggableList = [
    ...basePlugins,
    [rehypeStreamAnimated, { fadeDuration: STREAM_FADE_DURATION_MS, runtime }]
  ];
  pluginsCache.set(startOffset, { basePlugins, runtime, value });
  return value;
};
