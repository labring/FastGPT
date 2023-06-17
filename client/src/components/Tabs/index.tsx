import React, { useMemo } from 'react';
import { Box, Grid, useTheme } from '@chakra-ui/react';
import type { GridProps } from '@chakra-ui/react';

// @ts-ignore
interface Props extends GridProps {
  list: { id: string; label: string }[];
  activeId: string;
  size?: 'sm' | 'md' | 'lg';
  onChange: (id: string) => void;
}

const Tabs = ({ list, size = 'md', activeId, onChange, ...props }: Props) => {
  const theme = useTheme();
  const sizeMap = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          fontSize: 'sm',
          outP: '3px',
          inlineP: 1
        };
      case 'md':
        return {
          fontSize: 'md',
          outP: '4px',
          inlineP: 1
        };
      case 'lg':
        return {
          fontSize: 'lg',
          outP: '5px',
          inlineP: 2
        };
    }
  }, [size]);

  return (
    <Grid
      gridTemplateColumns={`repeat(${list.length},1fr)`}
      p={sizeMap.outP}
      borderRadius={'sm'}
      fontSize={sizeMap.fontSize}
      {...props}
    >
      {list.map((item) => (
        <Box
          key={item.id}
          py={sizeMap.inlineP}
          borderRadius={'sm'}
          textAlign={'center'}
          {...(activeId === item.id
            ? {
                boxShadow: '0px 2px 2px rgba(137, 156, 171, 0.25)',
                backgroundImage: theme.lgColor.primary2,
                color: 'white',
                cursor: 'default'
              }
            : {
                cursor: 'pointer'
              })}
          onClick={() => {
            if (activeId === item.id) return;
            onChange(item.id);
          }}
        >
          {item.label}
        </Box>
      ))}
    </Grid>
  );
};

export default Tabs;
