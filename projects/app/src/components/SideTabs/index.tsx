import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { GridProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';

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
                bg: ' primary.100 !important',
                fontWeight: 'bold',
                color: 'primary.600 ',
                cursor: 'default'
              }
            : {
                cursor: 'pointer'
              })}
          _hover={{
            bg: 'myGray.05'
          }}
          onClick={() => {
            if (activeId === item.id) return;
            onChange(item.id);
          }}
        >
          <MyIcon mr={2} name={item.icon as IconNameType} w={'16px'} />
          {item.label}
        </Flex>
      ))}
    </Box>
  );
};

export default React.memo(SideTabs);
