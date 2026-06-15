import React from 'react';
import { Box } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

type ScrollToBottomButtonProps = {
  isVisible: boolean;
  onClick: () => void;
};

/**
 * 渲染聊天输入框上方的回到底部按钮。
 *
 * 组件只关心展示和点击事件，不读取滚动容器，也不处理 ChatBox 业务状态；是否展示由
 * `useChatScroll` 根据滚动位置决定，便于后续调整位置或替换图标时不影响滚动逻辑。
 */
const ScrollToBottomButton = ({ isVisible, onClick }: ScrollToBottomButtonProps) => {
  if (!isVisible) return null;

  return (
    <Box
      as="button"
      type="button"
      aria-label="Scroll to bottom"
      display="flex"
      alignItems="center"
      justifyContent="center"
      boxSize="32px"
      minW="32px"
      minH="32px"
      p="8px"
      boxSizing="border-box"
      position="absolute"
      top="-48px"
      left="50%"
      transform="translateX(-50%)"
      zIndex={1}
      borderRadius="full"
      border="1px solid"
      borderColor="myGray.250"
      boxShadow="0 1px 2px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08)"
      bg="white"
      color="myGray.600"
      cursor="pointer"
      _hover={{ bg: 'myGray.25' }}
      _active={{ bg: 'myGray.50' }}
      onClick={onClick}
    >
      <MyIcon
        name="common/arrowLeft"
        w="16px"
        h="16px"
        color="myGray.600"
        transform="rotate(-90deg)"
        transformOrigin="center"
      />
    </Box>
  );
};

export default React.memo(ScrollToBottomButton);
