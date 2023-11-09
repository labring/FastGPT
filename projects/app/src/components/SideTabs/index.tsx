import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { GridProps } from '@chakra-ui/react';
import MyIcon, { type IconName } from '../Icon';

// @ts-ignore
export interface Props extends GridProps {
  list: { id: string; label: string; icon: string }[];
  activeId: string;
  size?: 'sm' | 'md' | 'lg';
  onChange: (id: string) => void;
}

const SideTabs = ({ list, size = 'md', activeId, onChange, ...props }: Props) => {
  const sizeMap = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          fontSize: 'sm',
          inlineP: 1
        };
      case 'md':
        return {
          fontSize: 'md',
          inlineP: 2
        };
      case 'lg':
        return {
          fontSize: 'lg',
          inlineP: 3
        };
    }
  }, [size]);

  return (
    <Box fontSize={sizeMap.fontSize} {...props}>
      {list.map((item) => (
        <Flex
          key={item.id}
          py={sizeMap.inlineP}
          borderRadius={'md'}
          px={3}
          mb={2}
          alignItems={'center'}
          {...(activeId === item.id
            ? {
                bg: ' myBlue.300 !important',
                fontWeight: 'bold',
                color: 'myBlue.700 ',
                cursor: 'default'
              }
            : {
                cursor: 'pointer'
              })}
          _hover={{
            bg: 'myWhite.600'
          }}
          onClick={() => {
            if (activeId === item.id) return;
            onChange(item.id);
          }}
        >
          <MyIcon mr={2} name={item.icon as IconName} w={'16px'} />
          {item.label}
        </Flex>
      ))}
    </Box>
  );
};

export default React.memo(SideTabs);
