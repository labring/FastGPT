import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';
import RehypeRaw from 'rehype-raw';

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Box } from '@chakra-ui/react';
import { CodeClassNameEnum, mdTextFormat } from './utils';
import { useCreation } from 'ahooks';
import type { AProps } from './A';

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

const SafeA = (props: any) => {
  const href = props.href || '';

  if (href.toString().startsWith('abbr:')) {
    const hidden_text = decodeURIComponent(href.toString().split('abbr:')[1]);

    return (
      <abbr
        className="cursor-pointer underline !decoration-primary-700 decoration-dashed"
        onClick={() => props.onOpenCiteModal?.(hidden_text)}
        title={props.children?.[0]?.value || ''}
      >
        {props.children?.[0]?.value || ''}
      </abbr>
    );
  }

  const isUnsafeUrl =
    href.toLowerCase().startsWith('javascript:') ||
    (typeof window !== 'undefined' && href.startsWith(window.location.origin));

  const safeHref = isUnsafeUrl ? '#' : href;

  return (
    <a
      {...props}
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className="cursor-pointer underline !decoration-primary-700 decoration-dashed"
    >
      {props.children || 'Download'}
    </a>
  );
};

type Props = {
  source?: string;
  showAnimation?: boolean;
  isDisabled?: boolean;
  forbidZhFormat?: boolean;
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
  chatAuthData,
  onOpenCiteModal
}: Props) => {
  const components = useCreation(() => {
    return {
      img: Image,
      pre: RewritePre,
      code: Code,
      a: (props: any) => (
        <SafeA
          {...props}
          chatAuthData={chatAuthData}
          onOpenCiteModal={onOpenCiteModal}
          showAnimation={showAnimation}
        />
      )
    };
  }, [chatAuthData, onOpenCiteModal, showAnimation]);

  const formatSource = useMemo(() => {
    if (showAnimation || forbidZhFormat) return source;
    return mdTextFormat(source);
  }, [forbidZhFormat, showAnimation, source]);

  const urlTransform = useCallback((val: string) => val, []);

  return (
    <Box position={'relative'}>
      <ReactMarkdown
        className={`markdown ${styles.markdown} ${
          showAnimation ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''
        }`}
        remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
        rehypePlugins={[
          RehypeKatex,
          [RehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
          RehypeRaw as any,
          () => {
            return (tree) => {
              const iterate = (node: any) => {
                if (node.type === 'element' && node.properties?.ref) delete node.properties.ref;

                if (node.type === 'element' && !/^[a-z][a-z0-9]*$/i.test(node.tagName)) {
                  node.type = 'text';
                  node.value = `<${node.tagName}`;
                }

                if (node.children) node.children.forEach(iterate);
              };
              tree.children.forEach(iterate);
            };
          }
        ]}
        disallowedElements={['iframe', 'head', 'html', 'meta', 'link', 'style', 'body', 'svg']}
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

function Image({ src }: { src?: string }) {
  return <MdImage src={src} />;
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
