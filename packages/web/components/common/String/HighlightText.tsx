import { Box } from '@chakra-ui/react';
import React from 'react';

const HighlightText = ({
  rawText,
  matchText,
  color = 'primary.600'
}: {
  rawText: string;
  matchText: string;
  color?: string;
}) => {
  const regex = new RegExp(`(${matchText})`, 'gi');
  const parts = rawText.split(regex);

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
          <Box as="span" key={index} color={highLight ? color : 'inherit'}>
            {part}
          </Box>
        );
      })}
    </Box>
  );
};

export default HighlightText;
