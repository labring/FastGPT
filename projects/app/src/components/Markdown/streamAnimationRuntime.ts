import type { PluggableList } from 'unified';

import type { StreamAnimatedRuntime } from './rehypeStreamAnimated';
import { getStreamAnimationNow, rehypeStreamAnimated } from './rehypeStreamAnimated';
import type { MarkdownBlock } from './streamMarkdownBlocks';

export const STREAM_FADE_DURATION_MS = 500;
export { getStreamAnimationNow };

export type StreamBlockRuntime = StreamAnimatedRuntime & {
  rawSource: string;
  pluginCache?: {
    basePlugins: PluggableList;
    value: PluggableList;
  };
};

export type StreamBlockAnimationMeta = {
  runtime: StreamBlockRuntime;
  shouldAnimate: boolean;
};

/** 流式实例结束后继续使用 block 渲染，避免完成态切换渲染器导致整棵 DOM 重建。 */
export const resolveStreamRenderMode = ({
  hasStreamed,
  showAnimation
}: {
  hasStreamed: boolean;
  showAnimation?: boolean;
}) => hasStreamed || !!showAnimation;

/**
 * 按 block 顺序维护动画 runtime。
 *
 * 字符 offset 只用于源码切片，不作为生命周期身份；完成态格式化导致 offset 改变时，
 * 同一顺序的 block 仍复用原 runtime。过期 segment 和已经离开文档的 runtime 会及时清理。
 */
export const updateStreamBlockAnimations = ({
  blocks,
  renderNow,
  runtimes
}: {
  blocks: MarkdownBlock[];
  renderNow: number;
  runtimes: Map<number, StreamBlockRuntime>;
}) => {
  const animationMeta = new Map<number, StreamBlockAnimationMeta>();

  blocks.forEach((block, blockIndex) => {
    let runtime = runtimes.get(blockIndex);
    if (!runtime) {
      runtime = {
        rawSource: '',
        segments: [],
        visibleText: ''
      };
      runtimes.set(blockIndex, runtime);
    }

    runtime.segments = runtime.segments.filter(
      (segment) => renderNow - segment.bornAt < STREAM_FADE_DURATION_MS
    );
    const sourceChanged = runtime.rawSource !== block.source;
    runtime.rawSource = block.source;

    animationMeta.set(blockIndex, {
      runtime,
      shouldAnimate:
        sourceChanged || runtime.segments.length > 0 || blockIndex === blocks.length - 1
    });
  });

  for (const blockIndex of runtimes.keys()) {
    if (blockIndex >= blocks.length) runtimes.delete(blockIndex);
  }

  return animationMeta;
};

/** 为同一个 block runtime 复用插件数组，保证已完成 block 可以命中 React.memo。 */
export const resolveStreamBlockPlugins = ({
  basePlugins,
  runtime
}: {
  basePlugins: PluggableList;
  runtime: StreamBlockRuntime;
}) => {
  if (runtime.pluginCache?.basePlugins === basePlugins) return runtime.pluginCache.value;

  const value: PluggableList = [
    ...basePlugins,
    [rehypeStreamAnimated, { fadeDuration: STREAM_FADE_DURATION_MS, runtime }]
  ];
  runtime.pluginCache = { basePlugins, value };
  return value;
};
