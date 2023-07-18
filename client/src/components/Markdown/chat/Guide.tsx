import React, { useMemo } from 'react';
import { Box } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import RemarkGfm from 'remark-gfm';
import RemarkMath from 'remark-math';
import RehypeKatex from 'rehype-katex';

import 'katex/dist/katex.min.css';
import styles from '../index.module.scss';
import { EventNameEnum } from '../constant';

const Guide = ({ text, onClick }: { text: string; onClick?: (e: any) => void }) => {
  const formatText = useMemo(() => text.replace(/\[(.*?)\]/g, '[$1]()'), [text]);

  return (
    <ReactMarkdown
      className={`markdown ${styles.markdown}`}
      remarkPlugins={[RemarkGfm, RemarkMath]}
      rehypePlugins={[RehypeKatex]}
      components={{
        a({ children }: any) {
          return (
            <Box as={'li'} py={1} m={0}>
              <Box
                as={'span'}
                color={'blue.600'}
                textDecoration={'underline'}
                cursor={'pointer'}
                onClick={() => {
                  if (!onClick) return;
                  onClick({
                    event: EventNameEnum.guideClick,
                    data: String(children)
                  });
                }}
              >
                {String(children)}
              </Box>
            </Box>
          );
        }
      }}
    >
      {formatText}
    </ReactMarkdown>
  );
};

export default React.memo(Guide);
