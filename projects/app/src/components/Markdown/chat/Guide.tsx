import React, { useMemo } from 'react';
import { Link } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';
import RemarkBreaks from 'remark-breaks';
import QuickQuestionButton from '@/components/core/chat/QuickQuestionButton';
import { useChatInstanceActions } from '../../core/chat/ChatContainer/context/chatInstanceActionsContext';

import 'katex/dist/katex.min.css';
import styles from '../index.module.scss';
import Image from '../img/Image';

function MyLink(e: any) {
  const href = e.href;
  const text = String(e.children);
  const { sendMessage } = useChatInstanceActions();

  return !!href ? (
    <Link href={href} target={'_blank'}>
      {text}
    </Link>
  ) : (
    <QuickQuestionButton mb={2} onClick={() => sendMessage({ text })}>
      {text}
    </QuickQuestionButton>
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
