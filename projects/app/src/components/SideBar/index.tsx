import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { BoxProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface Props extends BoxProps {
  isFolded?: boolean;
  onFoldChange?: (isFolded: boolean) => void;
}

const SideBar = (e?: Props) => {
  const {
    w = ['100%', '0 0 250px', '0 0 250px', '0 0 270px', '0 0 290px'],
    children,
    isFolded = false,
    onFoldChange,
    ...props
  } = e || {};

  const handleToggle = () => {
    if (onFoldChange) {
      onFoldChange(!isFolded);
    }
  };

  return (
    <Box
      position={'relative'}
      flex={isFolded ? '0 0 0' : w}
      w={['100%', 0]}
      h={'100%'}
      zIndex={1}
      transition={'0.2s'}
      _hover={{
        '& > div': { visibility: 'visible', opacity: 1 }
      }}
      {...props}
    >
      <Flex
        position={'absolute'}
        right={0}
        top={'50%'}
        transform={'translate(50%,-50%)'}
        alignItems={'center'}
        justifyContent={'flex-end'}
        pr={1}
        w={'36px'}
        h={'50px'}
        borderRadius={'10px'}
        bg={'rgba(0,0,0,0.5)'}
        cursor={'pointer'}
        transition={'0.2s'}
        {...(isFolded
          ? {
              opacity: 0.6
            }
          : {
              visibility: 'hidden',
              opacity: 0
            })}
        onClick={handleToggle}
      >
        <MyIcon
          name={'common/backLight'}
          transform={isFolded ? 'rotate(180deg)' : ''}
          w={'14px'}
          color={'white'}
        />
      </Flex>
      <Box position={'relative'} h={'100%'} overflow={isFolded ? 'hidden' : 'visible'}>
        {children}
      </Box>
    </Box>
  );
};

export default SideBar;
