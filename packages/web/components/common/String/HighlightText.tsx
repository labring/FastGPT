import { Box } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

const HighlightText = ({
  rawText,
  matchText,
  color = 'primary.600',
  mode = 'text'
}: {
  rawText: string;
  matchText: string;
  color?: string;
  mode?: 'text' | 'bg';
}) => {
  const { parts } = useMemo(() => {
    // matchText 是用户输入的搜索词，按字面匹配；不转义时输入 `(`、`[`、`+` 等会抛出
    // Invalid regular expression，整个渲染树报错。
    const regx = new RegExp(`(${replaceRegChars(matchText)})`, 'gi');
    const parts = rawText.split(regx);

    return {
      regx,
      parts
    };
  }, [rawText, matchText]);

  return (
    <Box>
      {parts.map((part, index) => {
        let highLight = part.toLowerCase() === matchText.toLowerCase();

        if (highLight) {
          parts.find((item, i) => {
            if (i >= index) return;
            if (item.toLowerCase() === matchText.toLowerCase()) {
              highLight = false;
            }
          });
        }

        return (
          <Box
            as="span"
            key={index}
            {...(mode === 'bg'
              ? {
                  bg: highLight ? color : 'transparent'
                }
              : {
                  color: highLight ? color : 'inherit'
                })}
          >
            {part}
          </Box>
        );
      })}
    </Box>
  );
};

export default React.memo(HighlightText);
