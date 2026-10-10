import React, { useEffect, useRef } from 'react';
import { CachedMarkdown } from './CachedMarkdown';
import { markdownRemarkPlugins } from '../utils/plugins';
import { markdownComponents } from '../components';
import { getMarkdownDebugInstanceId, getSourceDebugInfo, logMarkdownStreamDebug } from './debug';
import type { MarkdownStreamBlockProps } from '../type';

/**
 * 缓存已完成 Markdown 分块的独立 React 子树组件。
 *
 * 【核心设计与性能考量】：
 * 1. 采用 React.memo 深度冻结：当 source（文本源码）与 rehypePlugins 保持不变时，
 *    父级流式打字输出即使每 50ms 更新一次，前面的历史分块绝对不会触发重新 parse 或 re-render。
 * 2. blockId 稳定性保证：以 `${streamVersion}:${blockIndex}` 维系，格式化导致内部
 *    字符 offset 偏移时组件仍然复用，不会发生销毁与重新挂载。
 */
export const MarkdownStreamBlock = React.memo(
  ({ animated, blockId, blockOffset, source, rehypePlugins }: MarkdownStreamBlockProps) => {
    const instanceIdRef = useRef<number>();
    if (instanceIdRef.current === undefined) {
      instanceIdRef.current = getMarkdownDebugInstanceId();
    }

    useEffect(() => {
      const instanceId = instanceIdRef.current;
      logMarkdownStreamDebug('block-mount', {
        at: Date.now(),
        animated,
        blockId,
        blockOffset,
        instanceId,
        ...getSourceDebugInfo(source)
      });

      return () => {
        logMarkdownStreamDebug('block-unmount', {
          at: Date.now(),
          blockId,
          blockOffset,
          instanceId
        });
      };
      // 只记录真实挂载和卸载；source 变化由单独的 commit effect 记录。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      logMarkdownStreamDebug('block-commit', {
        at: Date.now(),
        animated,
        blockId,
        blockOffset,
        instanceId: instanceIdRef.current,
        ...getSourceDebugInfo(source)
      });
    }, [animated, blockId, blockOffset, source]);

    return (
      <CachedMarkdown
        source={source}
        remarkPlugins={markdownRemarkPlugins as any}
        rehypePlugins={rehypePlugins as any}
        components={markdownComponents as any}
      />
    );
  }
);

MarkdownStreamBlock.displayName = 'MarkdownStreamBlock';
export default MarkdownStreamBlock;
