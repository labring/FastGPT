import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { BoxProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface Props extends BoxProps {
  externalTrigger?: Boolean;
}

const SideBar = (e?: Props) => {
  const {
    w = ['100%', '0 0 250px', '0 0 256px', '0 0 256px', '0 0 256px'],
    children,
    externalTrigger,
    ...props
  } = e || {};

  const [isFolded, setIsFolded] = useState(false);
  const [isButtonVisible, setIsButtonVisible] = useState(false);

  // 保存上一次折叠状态
  const preFoledStatus = useRef<Boolean>(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (externalTrigger) {
      setIsFolded(true);
      preFoledStatus.current = isFolded;
    } else {
      // @ts-ignore
      setIsFolded(preFoledStatus.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalTrigger]);

  const handleMouseEnter = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setIsButtonVisible(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimer.current = setTimeout(() => setIsButtonVisible(false), 80);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, []);

  return (
    <Box
      position={'relative'}
      flex={isFolded ? '0 0 0' : w}
      w={['100%', 0]}
      h={'100%'}
      zIndex={2}
      transition={'0.2s'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
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
        bg={'myGray.150'}
        cursor={'pointer'}
        transition={'0.2s'}
        visibility={isButtonVisible || isFolded ? 'visible' : 'hidden'}
        opacity={isButtonVisible ? 1 : isFolded ? 0.6 : 0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => setIsFolded(!isFolded)}
      >
        <MyIcon
          name={'common/backLight'}
          transform={isFolded ? 'rotate(180deg)' : ''}
          w={'14px'}
          color={'myGray.550'}
        />
      </Flex>
      <Box position={'relative'} h={'100%'} overflow={isFolded ? 'hidden' : 'visible'}>
        {children}
      </Box>
    </Box>
  );
};

export default SideBar;
