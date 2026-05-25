import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';
import RehypeRaw from 'rehype-raw'; // Support raw HTML

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Box } from '@chakra-ui/react';
import { CodeClassNameEnum, mdTextFormat, convertMdImagesToHtml } from './utils';
import { useCreation } from 'ahooks';
import type { AProps } from './A';
import MarkdownTable from '@fastgpt/web/components/common/Markdown/MarkdownTable';

const CodeLight = dynamic(() => import('./codeBlock/CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });
const VideoBlock = dynamic(() => import('./codeBlock/Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./codeBlock/Audio'), { ssr: false });

const ChatGuide = dynamic(() => import('./chat/Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'), { ssr: false });
const A = dynamic(() => import('./A'), { ssr: false });

type Props = {
  source?: string;
  showAnimation?: boolean;
  hideCursor?: boolean;
  isDisabled?: boolean;
  forbidZhFormat?: boolean;
  hideCiteIcon?: boolean;
  citeStyle?: 'icon' | 'index';
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
  hideCursor,
  isDisabled,
  forbidZhFormat,
  hideCiteIcon,
  citeStyle,

  chatAuthData,
  onOpenCiteModal,
  citeSourceMap
}: Props) => {
  const citeIndexMap = useMemo(() => {
    if (citeStyle !== 'index') return undefined;
    const map = new Map<string, number>();
    const collectionIndexMap = new Map<string, number>();
    const regex = /[\[【]([a-f0-9]{24})[\]】]\((?:CITE|QUOTE)[^)]*\)/g;
    let match;
    let index = 1;
    while ((match = regex.exec(source)) !== null) {
      const quoteId = match[1];
      if (!map.has(quoteId)) {
        const collectionId = citeSourceMap?.get(quoteId)?.collectionId;
        if (!collectionId) continue; // 跳过不在 citeSourceMap 中的引用，避免产生多余序号
        if (collectionIndexMap.has(collectionId)) {
          map.set(quoteId, collectionIndexMap.get(collectionId)!);
        } else {
          map.set(quoteId, index);
          collectionIndexMap.set(collectionId, index);
          index++;
        }
      }
    }
    return map;
  }, [citeStyle, source, citeSourceMap]);

  // imgComponent 只依赖 chatAuthData，流式期间保持稳定引用，防止 Image 被 unmount/remount 导致闪烁
  const imgComponent = useCreation(() => {
    const ImgComponent = (props: any) => (
      <Image {...props} alt={props.alt} chatAuthData={chatAuthData} />
    );
    ImgComponent.displayName = 'ImgComponent';
    return ImgComponent;
  }, [chatAuthData]);

  const components = useCreation(() => {
    return {
      img: imgComponent,
      pre: RewritePre,
      code: Code,
      table: MarkdownTable as any,
      a: (props: any) => (
        <A
          {...props}
          showAnimation={showAnimation}
          chatAuthData={chatAuthData}
          onOpenCiteModal={onOpenCiteModal}
          hideCiteIcon={hideCiteIcon}
          citeStyle={citeStyle}
          citeIndexMap={citeIndexMap}
          citeSourceMap={citeSourceMap}
        />
      )
    };
  }, [
    imgComponent,
    chatAuthData,
    onOpenCiteModal,
    showAnimation,
    citeStyle,
    citeIndexMap,
    citeSourceMap
  ]);

  const formatSource = useMemo(() => {
    const text = showAnimation || forbidZhFormat ? source : mdTextFormat(source);
    return convertMdImagesToHtml(text);
  }, [forbidZhFormat, showAnimation, source]);

  const urlTransform = useCallback((val: string) => {
    return val;
  }, []);

  return (
    <Box position={'relative'}>
      <ReactMarkdown
        className={`markdown ${styles.markdown}
      ${showAnimation ? `${formatSource && !hideCursor ? styles.waitingAnimation : ''}` : ''}
    `}
        remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
        rehypePlugins={[
          RehypeKatex,
          [RehypeExternalLinks, { target: '_blank' }],
          RehypeRaw,
          rehypeStripDangerousTags
        ]}
        components={components}
        urlTransform={urlTransform}
      >
        {formatSource}
      </ReactMarkdown>
      {isDisabled && <Box position={'absolute'} top={0} right={0} left={0} bottom={0} />}
    </Box>
  );
};

export default React.memo(Markdown);

/* Custom dom */
function Code(e: any) {
  const { className, codeBlock, children } = e;
  const match = /language-(\w+)/.exec(className || '');
  const codeType = match?.[1]?.toLowerCase();

  const strChildren = String(children);

  const Component = useMemo(() => {
    if (codeType === CodeClassNameEnum.mermaid) {
      return <MermaidCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.guide) {
      return <ChatGuide text={strChildren} />;
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
    if (codeType === CodeClassNameEnum.html || codeType === CodeClassNameEnum.svg) {
      return (
        <IframeHtmlCodeBlock className={className} codeBlock={codeBlock} match={match}>
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

    return (
      <CodeLight className={className} codeBlock={codeBlock} match={match}>
        {children}
      </CodeLight>
    );
  }, [codeType, className, codeBlock, match, children, strChildren]);

  return Component;
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

// Strip <style> and <script> tags injected via rehype-raw to prevent global style pollution
function rehypeStripDangerousTags() {
  return (tree: any) => {
    const strip = (node: any) => {
      if (!node.children) return;
      node.children = node.children.filter(
        (child: any) => child.tagName !== 'style' && child.tagName !== 'script'
      );
      node.children.forEach(strip);
    };
    strip(tree);
  };
}
