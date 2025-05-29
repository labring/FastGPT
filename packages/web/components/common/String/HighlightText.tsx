import { Box } from '@chakra-ui/react';
import React, { useMemo } from 'react';

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
    const regx = new RegExp(`(${matchText})`, 'gi');
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
