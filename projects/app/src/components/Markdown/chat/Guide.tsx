import React, { useMemo } from 'react';
import { Box, Link } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import QuickQuestionButton from '@/components/core/chat/QuickQuestionButton';
import { isSafeHref } from '@fastgpt/global/common/string/url';

import 'katex/dist/katex.min.css';
import styles from '../index.module.scss';
import Image from '../img/Image';

function MyLink(e: any) {
  const href = e.href;
  const text = String(e.children);

  if (!href) {
    return (
      <QuickQuestionButton
        mb={2}
        onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
      >
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

const Guide = ({ text, className }: { text: string; className?: string }) => {
  const formatText = useMemo(
    () => text.replace(/\[(.*?)\]($|\n)/g, '[$1]()').replace(/\\n/g, '\n&nbsp;'),
    [text]
  );

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown} ${className || ''}`}
      remarkPlugins={[RemarkGfm, RemarkMath, RemarkBreaks]}
      rehypePlugins={[RehypeKatex]}
      components={{
        a: MyLink,
        p: 'div',
        img: Image
      }}
    >
      {formatText}
    </ReactMarkdown>
  );
};

export default React.memo(Guide);
