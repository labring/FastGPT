/* eslint-disable react-hooks/refs -- 流式字符时间线必须在 render 中幂等扩展，rehype 才能同步读取本次 commit。 */
import React, { useContext, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { PluggableList } from 'unified';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Box } from '@chakra-ui/react';
import { CodeClassNameEnum, mdTextFormat, prepareStreamingMarkdown } from './utils';
import type { AProps } from './A';
import MarkdownTable from '@fastgpt/web/components/common/Markdown/MarkdownTable';
import { MarkdownRendererRuntimeContext } from './runtimeContext';
import { splitMarkdownBlocks } from './streamMarkdownBlocks';
import { CachedMarkdown } from './CachedMarkdown';
import {
  getStreamAnimationNow,
  resolveStreamRenderMode,
  resolveStreamBlockPlugins,
  updateStreamBlockAnimations,
  type StreamBlockRuntime,
  type StreamPluginsCacheEntry
} from './streamAnimationRuntime';

const CodeLight = dynamic(() => import('./codeBlock/CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });
const VideoBlock = dynamic(() => import('./codeBlock/Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./codeBlock/Audio'), { ssr: false });
const markdownRemarkPlugins: PluggableList = [
  RemarkMath,
  [RemarkGfm, { singleTilde: false }],
  RemarkBreaks
];
const markdownBaseRehypePlugins: PluggableList = [
  RehypeKatex,
  [RehypeExternalLinks, { target: '_blank' }]
];
const markdownUrlTransform = (val: string) => val;

const isMarkdownStreamDebugEnabled = process.env.NODE_ENV !== 'production';
let markdownDebugInstanceId = 0;

/** 输出可直接复制的流式 Markdown 生命周期日志，不在生产环境产生额外开销。 */
const logMarkdownStreamDebug = (event: string, payload: Record<string, unknown>) => {
  if (!isMarkdownStreamDebugEnabled) return;
  console.log(`[MarkdownStreamDebug] ${event}`, JSON.stringify(payload));
};

const getMarkdownDebugInstanceId = () => ++markdownDebugInstanceId;

/** 保留 source 尾部即可判断流式追加关系，避免调试日志输出整段对话。 */
const getSourceDebugInfo = (source: string) => ({
  sourceLength: source.length,
  sourceTail: source.slice(-80)
});

const ChatGuide = dynamic(() => import('./chat/Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'), { ssr: false });
const QuickReplies = dynamic(() => import('./chat/QuickReplies'), { ssr: false });
const A = dynamic(() => import('./A'), { ssr: false });

function MarkdownImgRenderer(props: any) {
  const { chatAuthData } = useContext(MarkdownRendererRuntimeContext);
  return <Image {...props} alt={props.alt} chatAuthData={chatAuthData} />;
}

function MarkdownCodeRenderer(props: any) {
  const { showAnimation, autoPreviewHtmlCodeBlock, markdownClassName } = useContext(
    MarkdownRendererRuntimeContext
  );

  return (
    <Code
      {...props}
      showAnimation={showAnimation}
      autoPreviewHtmlCodeBlock={autoPreviewHtmlCodeBlock}
      markdownClassName={markdownClassName}
    />
  );
}

function MarkdownLinkRenderer(props: any) {
  const { showAnimation, chatAuthData, allowedCitationIds, onOpenCiteModal } = useContext(
    MarkdownRendererRuntimeContext
  );

  return (
    <A
      {...props}
      showAnimation={showAnimation}
      chatAuthData={chatAuthData}
      allowedCitationIds={allowedCitationIds}
      onOpenCiteModal={onOpenCiteModal}
    />
  );
}

const markdownComponents = {
  img: MarkdownImgRenderer,
  pre: RewritePre,
  code: MarkdownCodeRenderer,
  table: MarkdownTable as any,
  a: MarkdownLinkRenderer
};

type MarkdownStreamBlockProps = {
  animated: boolean;
  blockOffset: number;
  rehypePlugins: PluggableList;
  source: string;
};

/**
 * 缓存已完成 Markdown block 的 React 子树。
 *
 * source 和 rehypePlugins 都保持不变时，父级流式内容更新不会重新解析该 block。
 * 活动 block 复用同一个 processor 和字符动画 runtime，已完成 block 则回到普通 DOM。
 */
const MarkdownStreamBlock = React.memo(
  ({ animated, blockOffset, source, rehypePlugins }: MarkdownStreamBlockProps) => {
    const instanceIdRef = useRef<number>();
    if (instanceIdRef.current === undefined) {
      instanceIdRef.current = getMarkdownDebugInstanceId();
    }

    useEffect(() => {
      const instanceId = instanceIdRef.current;
      logMarkdownStreamDebug('block-mount', {
        at: Date.now(),
        animated,
        blockOffset,
        instanceId,
        ...getSourceDebugInfo(source)
      });

      return () => {
        logMarkdownStreamDebug('block-unmount', {
          at: Date.now(),
          blockOffset,
          instanceId
        });
      };
      // 只记录真实挂载和卸载；source 变化由下面的 commit effect 单独记录。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      logMarkdownStreamDebug('block-commit', {
        at: Date.now(),
        animated,
        blockOffset,
        instanceId: instanceIdRef.current,
        ...getSourceDebugInfo(source)
      });
    }, [animated, blockOffset, source]);

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

type Props = {
  source?: string;
  showAnimation?: boolean;
  isDisabled?: boolean;
  forbidZhFormat?: boolean;
  className?: string;
  autoPreviewHtmlCodeBlock?: boolean;
} & AProps;

const Markdown = (props: Props) => {
  const source = props.source || '';

  if (source.length < 200000) {
    return <MarkdownRender {...props} />;
  }

  return <Box whiteSpace={'pre-wrap'}>{source}</Box>;
};
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
}: Props) => {
  const instanceIdRef = useRef<number>();
  if (instanceIdRef.current === undefined) {
    instanceIdRef.current = getMarkdownDebugInstanceId();
  }

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

  const formatSource = useMemo(() => {
    if (showAnimation) return prepareStreamingMarkdown(source);
    if (forbidZhFormat) return source;
    return mdTextFormat(source);
  }, [forbidZhFormat, showAnimation, source]);

  const hasStreamedRef = useRef(false);
  const renderStreamBlocks = resolveStreamRenderMode({
    hasStreamed: hasStreamedRef.current,
    showAnimation
  });
  hasStreamedRef.current = renderStreamBlocks;
  const markdownBlocks = useMemo(
    () => (renderStreamBlocks ? splitMarkdownBlocks(formatSource) : []),
    [formatSource, renderStreamBlocks]
  );
  const streamRuntimesRef = useRef<Map<number, StreamBlockRuntime>>(new Map());
  const streamPluginsCacheRef = useRef<Map<number, StreamPluginsCacheEntry>>(new Map());
  const revealClockRef = useRef({ lastTime: 0 });
  const previousStreamingSourceRef = useRef('');
  if (showAnimation && !source.startsWith(previousStreamingSourceRef.current)) {
    streamRuntimesRef.current.clear();
    streamPluginsCacheRef.current.clear();
    revealClockRef.current.lastTime = 0;
  }
  previousStreamingSourceRef.current = source;
  const streamAnimationMeta = showAnimation
    ? updateStreamBlockAnimations({
        blocks: markdownBlocks,
        pluginsCache: streamPluginsCacheRef.current,
        renderNow: getStreamAnimationNow(),
        revealClock: revealClockRef.current,
        runtimes: streamRuntimesRef.current
      })
    : new Map();
  const markdownClassName = `markdown ${styles.markdown}
      ${className || ''}
      ${showAnimation ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''}
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
      ...getSourceDebugInfo(source)
    });
  }, [markdownBlocks, renderStreamBlocks, showAnimation, source]);

  return (
    <MarkdownRendererRuntimeContext.Provider value={renderContextValue}>
      <Box position={'relative'} className={renderStreamBlocks ? markdownClassName : undefined}>
        {renderStreamBlocks ? (
          markdownBlocks.map((block) => {
            const meta = streamAnimationMeta.get(block.startOffset);
            const runtime = meta?.runtime ?? streamRuntimesRef.current.get(block.startOffset);
            const rehypePlugins =
              !runtime || runtime.settled
                ? markdownBaseRehypePlugins
                : resolveStreamBlockPlugins({
                    basePlugins: markdownBaseRehypePlugins,
                    pluginsCache: streamPluginsCacheRef.current,
                    runtime,
                    startOffset: block.startOffset
                  });

            return (
              <MarkdownStreamBlock
                animated={!!runtime && !runtime.settled}
                blockOffset={block.startOffset}
                key={block.startOffset}
                source={block.source}
                rehypePlugins={rehypePlugins}
              />
            );
          })
        ) : (
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

/* Custom dom */
function Code(e: any) {
  const {
    className,
    codeBlock,
    children,
    showAnimation,
    autoPreviewHtmlCodeBlock,
    markdownClassName
  } = e;
  const match = /language-([\w-]+)/.exec(className || '');
  const codeType = match?.[1]?.toLowerCase();

  const strChildren = String(children);

  if (codeType === CodeClassNameEnum.mermaid) {
    return <MermaidCodeBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.guide) {
    return <ChatGuide text={strChildren} className={markdownClassName} />;
  }
  if (codeType === CodeClassNameEnum.questionguide) {
    return <QuestionGuide text={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.echarts) {
    return <EChartsCodeBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.iframe) {
    return <IframeCodeBlock code={strChildren} />;
  }
  if (
    codeType === CodeClassNameEnum.html ||
    codeType === CodeClassNameEnum.htm ||
    codeType === CodeClassNameEnum.svg
  ) {
    return (
      <IframeHtmlCodeBlock
        className={className}
        codeBlock={codeBlock}
        match={match}
        showAnimation={showAnimation}
        autoPreviewHtmlCodeBlock={autoPreviewHtmlCodeBlock}
      >
        {children}
      </IframeHtmlCodeBlock>
    );
  }
  if (codeType === CodeClassNameEnum.video) {
    return <VideoBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.audio) {
    return <AudioBlock code={strChildren} />;
  }
  if (codeType === CodeClassNameEnum.quickReplies) {
    return <QuickReplies text={strChildren} />;
  }

  return (
    <CodeLight className={className} codeBlock={codeBlock} match={match}>
      {children}
    </CodeLight>
  );
}

function Image({ src, chatAuthData }: { src?: string; chatAuthData?: AProps['chatAuthData'] }) {
  return <MdImage src={src} chatAuthData={chatAuthData} />;
}

function RewritePre({ children }: any) {
  const modifiedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      // @ts-ignore
      return React.cloneElement(child, { codeBlock: true });
    }
    return child;
  });

  return <>{modifiedChildren}</>;
}
