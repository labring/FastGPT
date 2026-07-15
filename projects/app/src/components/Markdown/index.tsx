import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMemoizedFn } from 'ahooks';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Box } from '@chakra-ui/react';
import { CodeClassNameEnum, hideStreamingIncompleteMarkdownTail, mdTextFormat } from './utils';
import type { AProps } from './A';
import MarkdownTable from '@fastgpt/web/components/common/Markdown/MarkdownTable';
import { MarkdownRendererRuntimeContext } from './runtimeContext';
import { getStreamingAppendLength, rehypeStreamAnimated } from './rehypeStreamAnimated';
import { splitMarkdownBlocks } from './streamMarkdownBlocks';
import { CachedMarkdown } from './CachedMarkdown';

const CodeLight = dynamic(() => import('./codeBlock/CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });
const VideoBlock = dynamic(() => import('./codeBlock/Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./codeBlock/Audio'), { ssr: false });
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const markdownRemarkPlugins = [RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks];
const markdownBaseRehypePlugins = [RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]];
const markdownUrlTransform = (val: string) => val;

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

/** 保留尾部边界；实际淡入由其下的有限数量 `stream-char` 节点完成。 */
function MarkdownStreamTailRenderer({ children, 'data-stream-tail-mode': mode }: any) {
  return (
    <span className={`stream-tail ${mode === 'text' ? 'stream-tail-text' : ''}`}>{children}</span>
  );
}

function MarkdownStreamCharRenderer({ children, 'data-stream-char-delay': delay }: any) {
  return (
    <span
      className="stream-char"
      style={delay ? { animationDelay: `${Number(delay)}ms` } : undefined}
    >
      {children}
    </span>
  );
}

const markdownComponents = {
  img: MarkdownImgRenderer,
  pre: RewritePre,
  code: MarkdownCodeRenderer,
  table: MarkdownTable as any,
  a: MarkdownLinkRenderer,
  'stream-tail': MarkdownStreamTailRenderer,
  'stream-char': MarkdownStreamCharRenderer
};

type MarkdownStreamBlockProps = {
  source: string;
  tailLength: number;
};

/**
 * 缓存已完成 Markdown block 的 React 子树。
 *
 * source 和 tailLength 都保持不变时，父级流式内容更新不会重新进入 react-markdown。
 * 只有最后一个正在增长的 block 会重新解析，并继续使用现有的尾部淡入插件。
 */
const MarkdownStreamBlock = React.memo(({ source, tailLength }: MarkdownStreamBlockProps) => {
  const getStreamTailLength = useMemoizedFn(() => tailLength);
  const rehypePlugins = useMemo(
    () => [
      ...markdownBaseRehypePlugins,
      [rehypeStreamAnimated, { getTailLength: getStreamTailLength }]
    ],
    [getStreamTailLength]
  );

  return (
    <CachedMarkdown
      source={source}
      remarkPlugins={markdownRemarkPlugins as any}
      rehypePlugins={rehypePlugins as any}
      components={markdownComponents as any}
    />
  );
});
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
    if (showAnimation) return hideStreamingIncompleteMarkdownTail(source);
    if (forbidZhFormat) return source;
    return mdTextFormat(source);
  }, [forbidZhFormat, showAnimation, source]);

  const previousSourceRef = useRef('');
  const previousFormatSourceRef = useRef('');
  // Markdown 尾部未闭合时会暂时隐藏；闭合后的首次 render 可能同时恢复整段文本，
  // 此时无法从原始 source 长度准确区分控制符和可见内容，跳过这一帧的尾部动画。
  // refs 保存的是上一次已 commit 的 raw/formatted source，只用于计算本次流式 append 的尾部长度。
  // eslint-disable-next-line react-hooks/refs
  const previousSource = previousSourceRef.current;
  // eslint-disable-next-line react-hooks/refs
  const previousFormatSource = previousFormatSourceRef.current;
  const hasRevealedMarkdownTail = previousSource !== previousFormatSource;
  const streamingTailLength = showAnimation
    ? getStreamingAppendLength({
        previousSource: previousFormatSource,
        currentSource: formatSource,
        previousSourceWasHidden: hasRevealedMarkdownTail
      })
    : 0;
  useBrowserLayoutEffect(() => {
    previousSourceRef.current = source;
    previousFormatSourceRef.current = formatSource;
  }, [formatSource, source]);

  const markdownBlocks = useMemo(
    () => (showAnimation ? splitMarkdownBlocks(formatSource) : []),
    [formatSource, showAnimation]
  );
  const markdownClassName = `markdown ${styles.markdown}
      ${className || ''}
      ${showAnimation ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''}
    `;

  return (
    <MarkdownRendererRuntimeContext.Provider value={renderContextValue}>
      <Box position={'relative'} className={showAnimation ? markdownClassName : undefined}>
        {showAnimation ? (
          markdownBlocks.map((block, index) => (
            <MarkdownStreamBlock
              key={block.startOffset}
              source={block.source}
              tailLength={index === markdownBlocks.length - 1 ? streamingTailLength : 0}
            />
          ))
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
