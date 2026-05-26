import React from 'react';
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerOverlay,
  Flex,
  type DrawerContentProps,
  type DrawerProps
} from '@chakra-ui/react';

type PhoneDrawerProps = Omit<DrawerProps, 'children' | 'placement'> & {
  children: React.ReactNode;
  bodyProps?: React.ComponentProps<typeof DrawerBody>;
  contentProps?: DrawerContentProps;
  overlayProps?: React.ComponentProps<typeof DrawerOverlay>;
  showHandle?: boolean;
};

/**
 * 移动端底部小抽屉容器。
 * 只负责统一底部弹出、遮罩、圆角和拖拽提示条；具体内容由 children 传入。
 */
const PhoneDrawer = ({
  children,
  bodyProps,
  contentProps,
  overlayProps,
  showHandle = true,
  size = 'xs',
  ...props
}: PhoneDrawerProps) => {
  return (
    <Drawer placement="bottom" size={size} {...props}>
      <DrawerOverlay backgroundColor="rgba(0, 0, 0, 0.16)" {...overlayProps} />
      <DrawerContent
        bg="white"
        borderTopRadius="16px"
        overflow="hidden"
        pt={0}
        pb="50px"
        {...contentProps}
      >
        {showHandle && (
          <Flex justifyContent="center" py={4}>
            <Box w="32px" h="4px" borderRadius="100px" bg="myGray.400" />
          </Flex>
        )}
        <DrawerBody px={4} py={0} {...bodyProps}>
          {children}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(PhoneDrawer);
