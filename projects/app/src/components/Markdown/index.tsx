/* eslint-disable react-hooks/refs -- 流式分段时间线必须在 render 中幂等扩展，rehype 才能同步读取本次 commit。 */
import React, { useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Box } from '@chakra-ui/react';
import 'katex/dist/katex.min.css';

import styles from './index.module.scss';
import type { MarkdownProps } from './type';
import {
  mdTextFormat,
  prepareStreamingMarkdown,
  markdownRemarkPlugins,
  markdownBaseRehypePlugins,
  markdownUrlTransform,
  MarkdownRendererRuntimeContext
} from './utils';
import {
  mapMarkdownBlockSources,
  splitMarkdownBlocks,
  getStreamAnimationNow,
  resolveStreamRenderMode,
  resolveStreamBlockPlugins,
  updateStreamBlockAnimations,
  type StreamBlockRuntime,
  MarkdownStreamBlock,
  getMarkdownDebugInstanceId,
  getSourceDebugInfo,
  logMarkdownStreamDebug
} from './stream';
import { markdownComponents } from './components';

/**
 * 文本渲染长度安全阈值。
 *
 * 当单个回答内容极端异常超过 200,000 字符时，Unified/AST 解析器与庞大的 DOM 树
 * 会导致主线程严重阻塞卡死甚至标签页崩溃。此时降级为白空间保留的纯文本展示。
 */
const MAX_MARKDOWN_RENDER_LENGTH = 200000;

/**
 * FastGPT 核心 Markdown 渲染组件。
 *
 * 职责：
 * 1. 负责超长文本的安全降级拦截；
 * 2. 对常规内容分发至核心调度器 MarkdownRender；
 * 3. 采用 React.memo 避免非必要外层重绘。
 */
const Markdown = (props: MarkdownProps) => {
  const source = props.source || '';

  if (source.length >= MAX_MARKDOWN_RENDER_LENGTH) {
    return <Box whiteSpace={'pre-wrap'}>{source}</Box>;
  }

  return <MarkdownRender {...props} />;
};

/**
 * Markdown 核心流式调度与渲染器。
 *
 * 【核心设计与推理链路】：
 * 1. 上下文透传：通过 MarkdownRendererRuntimeContext 向下层深层自定义组件
 *    传递引用弹窗、沙箱预览、鉴权状态等参数，避免深层 prop-drilling。
 * 2. 流式模式平滑保持 (hasStreamedRef)：
 *    消息在流式生成期间采用分块渲染；当流式彻底结束时，为避免“整棵分块 DOM”被
 *    突然替换为“单个全局 ReactMarkdown”，继续保持 block 渲染结构，杜绝闪烁。
 * 3. 块级缓存与动画隔离 (updateStreamBlockAnimations)：
 *    大模型打字时，只有末尾正在生长的 Block 会被动态注入打字淡入插件；
 *    已完成的历史 Block 插件引用与源码完全保持恒定，从而 100% 命中 React.memo 冻结。
 * 4. 源码中英文与格式化 (mdTextFormat)：
 *    在分块后仅对各 Block 内部进行标点格式化，防止全局替换导致前面字符数改变，
 *    进而破坏后续 Block 的稳定身份标识。
 */
const MarkdownRender = ({
  source = '',
  showAnimation,
  isDisabled,
  forbidZhFormat,
  className,
  autoPreviewHtmlCodeBlock,

  chatAuthData,
  allowedCitationIds,
  onOpenCiteModal
}: MarkdownProps) => {
  const instanceIdRef = useRef<number>();
  if (instanceIdRef.current === undefined) {
    instanceIdRef.current = getMarkdownDebugInstanceId();
  }

  // 组装下发给自定义组件（A, Image, Code 等）的运行时上下文
  const renderContextValue = useMemo(
    () => ({
      showAnimation,
      autoPreviewHtmlCodeBlock,
      markdownClassName: className,
      chatAuthData,
      allowedCitationIds,
      onOpenCiteModal
    }),
    [
      allowedCitationIds,
      autoPreviewHtmlCodeBlock,
      chatAuthData,
      className,
      onOpenCiteModal,
      showAnimation
    ]
  );

  // 判断是否走增量流式分块模式（一旦流式过，后续保持分块以维持 DOM 稳定）
  const hasStreamedRef = useRef(false);
  const renderStreamBlocks = resolveStreamRenderMode({
    hasStreamed: hasStreamedRef.current,
    showAnimation
  });
  hasStreamedRef.current = renderStreamBlocks;

  // 流式阶段预修齐尾部未闭合语法，防止半截语法提前请求或 AST 断裂
  const sourceForBlocks = useMemo(
    () => (showAnimation ? prepareStreamingMarkdown(source) : source),
    [showAnimation, source]
  );

  // 将全量文本根据 marked lexer 切分为独立的根级 Block
  const markdownBlocks = useMemo(() => {
    if (!renderStreamBlocks) return [];

    const blocks = splitMarkdownBlocks(sourceForBlocks);
    if (showAnimation || forbidZhFormat) return blocks;

    // 非流式完成态在分块后格式化，保证各块 key 与 offset 保持稳定
    return mapMarkdownBlockSources(blocks, mdTextFormat);
  }, [forbidZhFormat, renderStreamBlocks, showAnimation, sourceForBlocks]);

  // 维护动画 runtime 与流式版本号
  const streamRuntimesRef = useRef<Map<number, StreamBlockRuntime>>(new Map());
  const streamVersionRef = useRef(0);
  const previousStreamingSourceRef = useRef('');

  if (showAnimation) {
    // 若当前输入不是在上一次追加流的基础上继续增长（如重新生成或切换对话），则重置版本与 runtime
    if (!source.startsWith(previousStreamingSourceRef.current)) {
      streamVersionRef.current += 1;
      streamRuntimesRef.current.clear();
    }
    previousStreamingSourceRef.current = source;
  }

  // 计算每个 Block 是否需要执行动画及对应的 runtime
  const streamAnimationMeta = showAnimation
    ? updateStreamBlockAnimations({
        blocks: markdownBlocks,
        renderNow: getStreamAnimationNow(),
        runtimes: streamRuntimesRef.current
      })
    : new Map();

  // 静态全量渲染时的格式化文本
  const formatSource = useMemo(
    () => (forbidZhFormat ? source : mdTextFormat(source)),
    [forbidZhFormat, source]
  );

  const markdownClassName = `markdown ${styles.markdown}
      ${className || ''}
      ${showAnimation ? `${sourceForBlocks ? styles.waitingAnimation : styles.animation}` : ''}
    `;

  useEffect(() => {
    const instanceId = instanceIdRef.current;
    logMarkdownStreamDebug('mount', { at: Date.now(), instanceId });

    return () => {
      logMarkdownStreamDebug('unmount', { at: Date.now(), instanceId });
    };
  }, []);

  useEffect(() => {
    logMarkdownStreamDebug('commit', {
      at: Date.now(),
      blocks: markdownBlocks.map((block) => ({
        length: block.source.length,
        offset: block.startOffset,
        tail: block.source.slice(-40)
      })),
      instanceId: instanceIdRef.current,
      renderStreamBlocks,
      showAnimation: !!showAnimation,
      streamVersion: streamVersionRef.current,
      ...getSourceDebugInfo(source)
    });
  }, [markdownBlocks, renderStreamBlocks, showAnimation, source]);

  return (
    <MarkdownRendererRuntimeContext.Provider value={renderContextValue}>
      <Box position={'relative'} className={renderStreamBlocks ? markdownClassName : undefined}>
        {renderStreamBlocks ? (
          markdownBlocks.map((block, blockIndex) => {
            const blockId = `${streamVersionRef.current}:${blockIndex}`;
            const meta = streamAnimationMeta.get(blockIndex);
            const animated = !!showAnimation && !!meta?.shouldAnimate;

            // 仅对当前正在打字动画的分块挂载包含动画计算的插件，其余已完成分块复用基础插件
            const rehypePlugins =
              animated && meta
                ? resolveStreamBlockPlugins({
                    basePlugins: markdownBaseRehypePlugins,
                    runtime: meta.runtime
                  })
                : markdownBaseRehypePlugins;

            return (
              <MarkdownStreamBlock
                animated={animated}
                blockId={blockId}
                blockOffset={block.startOffset}
                key={blockId}
                source={block.source}
                rehypePlugins={rehypePlugins}
              />
            );
          })
        ) : (
          /* 非流式一次性静态内容渲染分支 */
          <ReactMarkdown
            className={markdownClassName}
            remarkPlugins={markdownRemarkPlugins as any}
            rehypePlugins={markdownBaseRehypePlugins as any}
            components={markdownComponents as any}
            urlTransform={markdownUrlTransform}
          >
            {formatSource}
          </ReactMarkdown>
        )}
        {isDisabled && (
          <Box position={'absolute'} top={0} right={0} left={0} bottom={0} zIndex={1} />
        )}
      </Box>
    </MarkdownRendererRuntimeContext.Provider>
  );
};

export default React.memo(Markdown);
