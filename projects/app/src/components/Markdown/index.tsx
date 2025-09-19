import 'katex/dist/katex.min.css';
import React, { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import RehypeExternalLinks from 'rehype-external-links';
import RehypeKatex from 'rehype-katex'; // Math render
import RehypeRaw from 'rehype-raw';
import RemarkBreaks from 'remark-breaks'; // Line break
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RemarkMath from 'remark-math'; // Math syntax

import dynamic from 'next/dynamic';
import styles from './index.module.scss';

import { Box } from '@chakra-ui/react';
import { useCreation } from 'ahooks';
import type { AProps } from './A';
import { CodeClassNameEnum } from './utils';

import DomPurify from 'dompurify';

const CodeLight = dynamic(() => import('./codeBlock/CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });
const VideoBlock = dynamic(() => import('./codeBlock/Video'), { ssr: false });
const AudioBlock = dynamic(() => import('./codeBlock/Audio'), { ssr: false });
const TableBlock = dynamic(() => import('./codeBlock/Table'), { ssr: false });
const IndicatorCard = dynamic(() => import('./codeBlock/IndicatorCard'), { ssr: false });
const LinkBlock = dynamic(() => import('./codeBlock/Link'), { ssr: false });
const Tips = dynamic(() => import('./codeBlock/Tips'), { ssr: false });
const Divider = dynamic(() => import('./codeBlock/Divider'), { ssr: false });
const TextBlock = dynamic(() => import('./codeBlock/TextBlock'), { ssr: false });

const ChatGuide = dynamic(() => import('./chat/Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'), { ssr: false });
const A = dynamic(() => import('./A'), { ssr: false });

const formatCodeBlock = (lang: string, content: string) => `\`\`\`${lang}\n${content}\n\`\`\``;

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
        <A
          {...props}
          showAnimation={showAnimation}
          chatAuthData={chatAuthData}
          onOpenCiteModal={onOpenCiteModal}
        />
      )
    };
  }, [chatAuthData, onOpenCiteModal, showAnimation]);

  // convert single item to Markdown
  const convertRenderBlockToMarkdown = useCallback((jsonContent: string): string => {
    const converItem = (type: string, content: any) => {
      switch (type) {
        case 'TEXT':
          return (typeof content === 'string' ? content : JSON.stringify(content)) + '\n\n';

        case 'CHART':
          return content?.hasChart && content?.echartsData
            ? `\`\`\`echarts\n${JSON.stringify(content.echartsData, null, 2)}\n\`\`\`\n\n`
            : '';

        case 'TABLE':
          return content?.data
            ? `\`\`\`table\n${JSON.stringify(content.data, null, 2)}\n\`\`\`\n\n`
            : '';

        case 'INDICATOR':
          return content?.dataList
            ? `\`\`\`indicator\n${JSON.stringify(content.dataList, null, 2)}\n\`\`\`\n\n`
            : '';

        case 'LINK':
          return content?.text && content?.url
            ? `\`\`\`link\n${JSON.stringify(content, null, 2)}\n\`\`\`\n\n`
            : '';

        case 'ERROR_TIPS':
          return content ? `\`\`\`error_tips\n${content}\n\`\`\`\n\n` : '';

        case 'WARNING_TIPS':
          return content ? `\`\`\`warning_tips\n${content}\n\`\`\`\n\n` : '';

        case 'DIVIDER':
          return `\`\`\`divider\n\n\`\`\`\n\n`;

        case 'TEXTBLOCK':
          return content ? `\`\`\`textblock\n${content}\n\`\`\`\n\n` : '';

        default:
          return formatCodeBlock('json', jsonContent);
      }
    };
    try {
      const jsonObj = JSON.parse(jsonContent);
      if (Array.isArray(jsonObj)) {
        return jsonObj.map((item) => converItem(item.type, item.content)).join(`\n\n`);
      } else {
        return converItem(jsonObj.type, jsonObj.content);
      }
    } catch {
      return formatCodeBlock('json', jsonContent);
    }
  }, []);

  const formatSource = useMemo(() => {
    if (showAnimation || forbidZhFormat) return source;

    const result = source.replace(/```RENDER([\s\S]*?)```/g, (match, p1) => {
      // p1: the content inside ```RENDER ... ```
      const cleanedContent = p1
        .replace(/^```[\s\S]*?(\n)?/, '')
        .replace(/```$/, '')
        .trim();
      return convertRenderBlockToMarkdown(cleanedContent);
    });

    return result;
  }, [convertRenderBlockToMarkdown, forbidZhFormat, showAnimation, source]);

  const sanitizedSource = useMemo(() => {
    return DomPurify.sanitize(formatSource);
  }, [formatSource]);

  const urlTransform = useCallback((val: string) => {
    return val;
  }, []);

  return (
    <Box position={'relative'}>
      <ReactMarkdown
        className={`markdown ${styles.markdown}
      ${showAnimation ? `${sanitizedSource ? styles.waitingAnimation : styles.animation}` : ''}
    `}
        remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
        rehypePlugins={[
          RehypeKatex,
          [RehypeExternalLinks, { target: '_blank' }],
          [
            RehypeRaw,
            {
              tagfilter: [
                'script',
                'style',
                'iframe',
                'frame',
                'frameset',
                'object',
                'embed',
                'link',
                'meta',
                'base',
                'form',
                'input',
                'button',
                'img'
              ]
            }
          ]
        ]}
        components={components}
        urlTransform={urlTransform}
      >
        {sanitizedSource}
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
    if (codeType === CodeClassNameEnum.table) {
      return <TableBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.indicator) {
      return <IndicatorCard dataList={JSON.parse(strChildren)} />;
    }
    if (codeType === CodeClassNameEnum.link) {
      return <LinkBlock data={JSON.parse(strChildren)} />;
    }
    if (codeType === CodeClassNameEnum.error_tips) {
      return <Tips content={strChildren} type="error" />;
    }
    if (codeType === CodeClassNameEnum.warning_tips) {
      return <Tips content={strChildren} type="warning" />;
    }
    if (codeType === CodeClassNameEnum.divider) {
      return <Divider />;
    }
    if (codeType === CodeClassNameEnum.textblock) {
      return <TextBlock content={strChildren} />;
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
