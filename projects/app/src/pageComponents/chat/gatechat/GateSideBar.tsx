import React, { useState, useEffect, useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { BoxProps } from '@chakra-ui/react';
import FoldButton from './FoldButton';

interface Props extends BoxProps {
  externalTrigger?: Boolean;
  onFoldChange?: (isFolded: boolean) => void;
  defaultFolded?: boolean;
}

const GateSideBar = (e?: Props) => {
  const {
    w = ['100%', '0 0 250px', '0 0 250px', '0 0 270px', '0 0 290px'],
    children,
    externalTrigger,
    onFoldChange,
    defaultFolded = false,
    ...props
  } = e || {};

  const [isFolded, setIsFolded] = useState(defaultFolded);

  // 保存上一次折叠状态
  const preFoledStatus = useRef<Boolean>(defaultFolded);

  // 同步外部传入的折叠状态
  useEffect(() => {
    setIsFolded(defaultFolded);
  }, [defaultFolded]);

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

  const handleFoldToggle = () => {
    const newFoldState = !isFolded;
    setIsFolded(newFoldState);
    onFoldChange?.(newFoldState);
  };

  return (
    <Box
      position={'relative'}
      flex={isFolded ? '0 0 0' : w}
      w={['100%', 0]}
      h={'100%'}
      overflow={'visible'}
      transition={'0.2s'}
      _hover={{
        '& > div': { visibility: 'visible', opacity: 1 }
      }}
      {...props}
    >
      {/* 只在非完全折叠状态下显示侧边栏的折叠按钮 */}
      {!defaultFolded && (
        <FoldButton isFolded={isFolded} onClick={handleFoldToggle} position="sidebar" />
      )}
      <Box position={'relative'} h={'100%'} overflow={isFolded ? 'hidden' : 'visible'}>
        {children}
      </Box>
    </Box>
  );
};

export default GateSideBar;
