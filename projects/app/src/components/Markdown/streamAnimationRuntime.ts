import type { PluggableList } from 'unified';

import type { StreamAnimatedRuntime } from './rehypeStreamAnimated';
import { getStreamAnimationNow, rehypeStreamAnimated } from './rehypeStreamAnimated';
import type { MarkdownBlock } from './streamMarkdownBlocks';

export const STREAM_FADE_DURATION_MS = 180;
export { getStreamAnimationNow };

const STREAM_CHAR_DELAY_MS = 18;
const MIN_STREAM_CHAR_PACE_MS = 2;
const MIN_REVEAL_GAP_MS = 16;
const MAX_REVEAL_GAP_MS = 160;

export type StreamBlockRuntime = StreamAnimatedRuntime & {
  charCount: number;
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

const countChars = (text: string) => {
  let count = 0;
  for (const character of text) count += character ? 1 : 0;
  return count;
};

/**
 * 扩展各 Markdown block 的字符出生时间，并清理已经离开当前文档的 runtime。
 *
 * 该函数在 render 阶段写入 ref 中的缓存；同一份 block 内容重复执行不会追加数据，
 * 因而兼容 StrictMode 的重复 render。字符出生时间最多领先一个淡入窗口，避免输入速度
 * 高于动画速度时积累很长的不可见尾巴。
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
  let revealedNewCharacters = false;

  blocks.forEach((block, index) => {
    aliveOffsets.add(block.startOffset);

    let runtime = runtimes.get(block.startOffset);
    if (!runtime) {
      runtime = {
        births: [],
        charCount: 0,
        rawSource: '',
        settled: false,
        styles: []
      };
      runtimes.set(block.startOffset, runtime);
    }

    if (!block.source.startsWith(runtime.rawSource)) {
      runtime.births.length = 0;
      runtime.styles.length = 0;
      runtime.settled = false;
    }

    if (runtime.rawSource !== block.source) {
      runtime.rawSource = block.source;
      runtime.charCount = countChars(block.source);
    }

    if (runtime.births.length > runtime.charCount) {
      runtime.births.length = runtime.charCount;
      runtime.styles.length = runtime.charCount;
      runtime.settled = false;
    }

    if (runtime.births.length < runtime.charCount) {
      const newCharacters = runtime.charCount - runtime.births.length;
      const revealGap = Math.min(
        Math.max(renderNow - revealClock.lastTime, MIN_REVEAL_GAP_MS),
        MAX_REVEAL_GAP_MS
      );
      const pace = Math.min(
        STREAM_CHAR_DELAY_MS,
        Math.max(revealGap / newCharacters, MIN_STREAM_CHAR_PACE_MS)
      );
      const latestBirthTime = renderNow + revealGap + STREAM_FADE_DURATION_MS;

      for (let charIndex = runtime.births.length; charIndex < runtime.charCount; charIndex++) {
        const previousBirthTime = charIndex > 0 ? runtime.births[charIndex - 1] : renderNow - pace;
        runtime.births.push(
          Math.min(latestBirthTime, Math.max(previousBirthTime + pace, renderNow))
        );
      }

      runtime.settled = false;
      revealedNewCharacters = true;
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

  if (revealedNewCharacters) {
    revealClock.lastTime = renderNow;
  }

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
