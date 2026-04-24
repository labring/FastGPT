import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCallback, useEffect, useRef, useState } from 'react';

type Tab = {
  key: string;
  label: string;
  // count 为可选；传入时在非 "all" 标签后展示数量
  count?: number;
};

type MyTabBarProps = {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
};

const MyTabBar = ({ tabs, activeKey, onChange }: MyTabBarProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 4);
    setShowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    el?.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);
    return () => {
      el?.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows, tabs]);

  return (
    <Box position="relative">
      {showLeft && (
        <>
          <Box
            position="absolute"
            left={0}
            top={0}
            bottom={0}
            w="60px"
            zIndex={1}
            bgGradient="linear(to-r, white, transparent)"
            pointerEvents="none"
          />
          <Flex
            position="absolute"
            left={0}
            top="50%"
            transform="translateX(-50%) translateY(-50%)"
            zIndex={2}
            w="28px"
            h="28px"
            bg="white"
            boxShadow="0 1px 6px rgba(0,0,0,0.12)"
            borderRadius="full"
            align="center"
            justify="center"
            cursor="pointer"
            onClick={() => scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })}
          >
            <MyIcon name="common/leftArrow2" w="24px" color="myGray.500" />
          </Flex>
        </>
      )}

      <Flex
        ref={scrollRef}
        overflowX="auto"
        gap="12px"
        h="36px"
        alignItems="center"
        sx={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
        pl={showLeft ? '36px' : 0}
        pr={showRight ? '36px' : 0}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          const showCount = tab.count !== undefined && tab.key !== 'all';
          const label = showCount ? `${tab.label}(${tab.count})` : tab.label;
          return (
            <Box
              key={tab.key}
              flexShrink={0}
              px="12px"
              h="36px"
              display="flex"
              alignItems="center"
              fontSize="14px"
              borderRadius="6px"
              cursor="pointer"
              userSelect="none"
              transition="all 0.15s"
              bg={isActive ? 'rgba(50, 136, 250, 0.06)' : '#FFFFFF'}
              border={isActive ? '1px solid rgba(50, 136, 250, 0.4)' : '1px solid #DCE0E6'}
              color={isActive ? '#1770E6' : '#333333'}
              fontWeight={isActive ? 'semibold' : 'normal'}
              onClick={() => onChange(tab.key)}
            >
              {label}
            </Box>
          );
        })}
      </Flex>

      {showRight && (
        <>
          <Box
            position="absolute"
            right={0}
            top={0}
            bottom={0}
            w="60px"
            zIndex={1}
            bgGradient="linear(to-l, white, transparent)"
            pointerEvents="none"
          />
          <Flex
            position="absolute"
            right={0}
            top="50%"
            transform="translateX(50%) translateY(-50%)"
            zIndex={2}
            w="28px"
            h="28px"
            bg="white"
            boxShadow="0 1px 6px rgba(0,0,0,0.12)"
            borderRadius="full"
            align="center"
            justify="center"
            cursor="pointer"
            onClick={() =>
              scrollRef.current?.scrollTo({
                left: scrollRef.current.scrollWidth,
                behavior: 'smooth'
              })
            }
          >
            <MyIcon name="common/rightArrow2" w="24px" color="myGray.500" />
          </Flex>
        </>
      )}
    </Box>
  );
};

export default MyTabBar;
