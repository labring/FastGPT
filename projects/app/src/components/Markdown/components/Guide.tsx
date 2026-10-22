import React, { useMemo } from 'react';
import { Box, Link } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';
import QuickQuestionButton from '@/components/core/chat/QuickQuestionButton';
import type { MarkdownActionProps } from '../type';
import { isSafeHref } from '@fastgpt/global/common/string/url';

import 'katex/dist/katex.min.css';
import styles from '../index.module.scss';
import Image from './Image';

function MyLink(e: any) {
  const href = e.href;
  const text = String(e.children);
  const onSendQuestion: MarkdownActionProps['onSendQuestion'] = e.onSendQuestion;

  if (!href) {
    if (!onSendQuestion) return <Box as="span">{text}</Box>;
    return (
      <QuickQuestionButton mb={2} onClick={() => onSendQuestion(text)}>
        {text}
      </QuickQuestionButton>
    );
  }

  if (!isSafeHref(href)) {
    return <Box as={'span'}>{text}</Box>;
  }

  return (
    <Link href={href} target={'_blank'}>
      {text}
    </Link>
  );
}

const Guide = ({
  text,
  className,
  onSendQuestion
}: {
  text: string;
  className?: string;
} & Pick<MarkdownActionProps, 'onSendQuestion'>) => {
  const formatText = useMemo(
    () => text.replace(/\[(.*?)\]($|\n)/g, '[$1]()').replace(/\\n/g, '\n&nbsp;'),
    [text]
  );
  const components = useMemo(
    () => ({
      a: (props: any) => <MyLink {...props} onSendQuestion={onSendQuestion} />,
      p: 'div' as const,
      img: Image
    }),
    [onSendQuestion]
  );

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown} ${className || ''}`}
      remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      components={components}
    >
      {formatText}
    </ReactMarkdown>
  );
};

export default React.memo(Guide);
