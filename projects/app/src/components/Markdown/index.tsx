import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math';
import RemarkBreaks from 'remark-breaks';
import RehypeKatex from 'rehype-katex';
import RemarkGfm from 'remark-gfm';

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Link, Button } from '@chakra-ui/react';
import MyTooltip from '../MyTooltip';
import { useTranslation } from 'next-i18next';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getFileAndOpen } from '@/web/core/dataset/utils';
import { MARKDOWN_QUOTE_SIGN } from '@fastgpt/global/core/chat/constants';

const CodeLight = dynamic(() => import('./CodeLight'));
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'));
const MdImage = dynamic(() => import('./img/Image'));
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'));

const ChatGuide = dynamic(() => import('./chat/Guide'));
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'));
const ImageBlock = dynamic(() => import('./chat/Image'));

export enum CodeClassName {
  guide = 'guide',
  questionGuide = 'questionGuide',
  mermaid = 'mermaid',
  echarts = 'echarts',
  quote = 'quote',
  img = 'img'
}

const Markdown = ({ source, isChatting = false }: { source: string; isChatting?: boolean }) => {
  const components = useMemo<any>(
    () => ({
      img: Image,
      pre: 'div',
      p: (pProps: any) => <p {...pProps} dir="auto" />,
      code: Code,
      a: A
    }),
    []
  );

  const formatSource = source
    .replace(/\\n/g, '\n&nbsp;')
    .replace(/(http[s]?:\/\/[^\s，。]+)([。，])/g, '$1 $2')
    .replace(/\n*(\[QUOTE SIGN\]\(.*\))/g, '$1');

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}
      ${isChatting ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''}
    `}
      remarkPlugins={[RemarkMath, RemarkGfm, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      components={components}
      linkTarget={'_blank'}
    >
      {formatSource}
    </ReactMarkdown>
  );
};

export default React.memo(Markdown);

const Code = React.memo(function Code(e: any) {
  const { inline, className, children } = e;

  const match = /language-(\w+)/.exec(className || '');
  const codeType = match?.[1];

  const strChildren = String(children);

  const Component = useMemo(() => {
    if (codeType === CodeClassName.mermaid) {
      return <MermaidCodeBlock code={strChildren} />;
    }

    if (codeType === CodeClassName.guide) {
      return <ChatGuide text={strChildren} />;
    }
    if (codeType === CodeClassName.questionGuide) {
      return <QuestionGuide text={strChildren} />;
    }
    if (codeType === CodeClassName.echarts) {
      return <EChartsCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassName.img) {
      return <ImageBlock images={strChildren} />;
    }
    return (
      <CodeLight className={className} inline={inline} match={match}>
        {children}
      </CodeLight>
    );
  }, [codeType, className, inline, match, children, strChildren]);

  return Component;
});

const Image = React.memo(function Image({ src }: { src?: string }) {
  return <MdImage src={src} />;
});
const A = React.memo(function A({ children, ...props }: any) {
  const { t } = useTranslation();

  // empty href link
  if (!props.href && typeof children?.[0] === 'string') {
    const text = useMemo(() => String(children), [children]);

    return (
      <MyTooltip label={t('core.chat.markdown.Quick Question')}>
        <Button
          variant={'whitePrimary'}
          size={'xs'}
          borderRadius={'md'}
          my={1}
          onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
        >
          {text}
        </Button>
      </MyTooltip>
    );
  }

  // quote link
  if (children?.length === 1 && typeof children?.[0] === 'string') {
    const text = String(children);
    if (text === MARKDOWN_QUOTE_SIGN && props.href) {
      return (
        <MyTooltip label={props.href}>
          <MyIcon
            name={'core/chat/quoteSign'}
            transform={'translateY(-2px)'}
            w={'18px'}
            color={'primary.500'}
            cursor={'pointer'}
            _hover={{
              color: 'primary.700'
            }}
            onClick={() => getFileAndOpen(props.href)}
          />
        </MyTooltip>
      );
    }
  }

  return <Link {...props}>{children}</Link>;
});
