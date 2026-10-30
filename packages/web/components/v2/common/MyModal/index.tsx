import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  type ModalContentProps,
  Box,
  Flex,
  type FlexProps,
  type BoxProps
} from '@chakra-ui/react';
import MyBox from '../../../common/MyBox';
import { useSystem } from '../../../../hooks/useSystem';

export type MyModalProps = Omit<ModalContentProps, 'title'> & {
  title?: any;
  isCentered?: boolean;
  isLoading?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  closeOnOverlayClick?: boolean;
  blockScrollOnMount?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  footer?: React.ReactNode;
  headerStyles?: FlexProps;
  bodyStyles?: BoxProps;
  footerStyles?: FlexProps;
};

const sizeMap = {
  sm: {
    w: '400px'
  },
  md: {
    w: '560px'
  },
  lg: {
    w: '800px'
  },
  xl: {
    w: '900px'
  }
};

/** 正文尺寸约束由外壳承接，内容样式留在滚动层，头部及 footer 保持固定。 */
const MyModal = ({
  isOpen = true,
  onClose,
  title,
  children,
  isCentered,
  isLoading,
  closeOnOverlayClick = true,
  blockScrollOnMount = false,
  size = 'sm',
  showCloseButton = true,
  headerStyles,
  bodyStyles,
  footerStyles,
  footer,
  ...props
}: MyModalProps) => {
  const { isPc } = useSystem();

  const sizeData = sizeMap[size] || sizeMap.sm;
  // 正文高度和 flex 约束属于可视外壳；padding 等内容样式留在实际滚动层。
  const { flex, h, height, minH, minHeight, maxH, maxHeight, ...bodyContentProps } =
    bodyStyles ?? {};
  const bodyOverflow = bodyContentProps.overflow ?? props.overflow ?? 'overlay';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose?.()}
      size={size}
      autoFocus={false}
      isCentered={isPc ? isCentered : true}
      blockScrollOnMount={blockScrollOnMount}
      allowPinchZoom
      scrollBehavior={'inside'}
      closeOnOverlayClick={closeOnOverlayClick}
      returnFocusOnClose={false}
    >
      <ModalOverlay zIndex={props.zIndex} />
      <ModalContent
        w={sizeData.w}
        maxW={'90vw'}
        position={'relative'}
        maxH={'80vh'}
        boxShadow={'3.5'}
        px={0}
        py={0}
        display={'flex'}
        flexDirection={'column'}
        containerProps={{
          zIndex: props.zIndex
        }}
        {...props}
      >
        {onClose && showCloseButton && (
          <ModalCloseButton position={'absolute'} fontSize={'xs'} top={3} right={3} />
        )}

        {!!title && (
          <Flex
            alignItems={'center'}
            fontSize={'lg'}
            fontWeight={'500'}
            px={8}
            pt={8}
            pb={0}
            gap={3}
            {...headerStyles}
          >
            <Box
              color="black"
              fontWeight={'500'}
              fontSize={'20px'}
              lineHeight={'26px'}
              letterSpacing={'0.15px'}
            >
              {title}
            </Box>
          </Flex>
        )}

        <MyBox
          isLoading={isLoading}
          position={'relative'}
          overflow={['visible', 'unset'].includes(String(bodyOverflow)) ? 'visible' : 'hidden'}
          flex={flex ?? '1 1 auto'}
          h={h ?? height ?? 'auto'}
          minH={minH ?? minHeight ?? 0}
          maxH={maxH ?? maxHeight}
          minW={0}
          display={'flex'}
          flexDirection={'column'}
        >
          <Box
            overflow={bodyOverflow}
            flex={'1 1 auto'}
            h={'auto'}
            minH={0}
            display={'flex'}
            flexDirection={'column'}
            px={8}
            pt={title ? 6 : 8}
            pb={footer ? 6 : 8}
            fontSize={'14px'}
            lineHeight={'20px'}
            letterSpacing={'0.25px'}
            color={'myGray.900'}
            {...bodyContentProps}
          >
            {children}
          </Box>
        </MyBox>

        {!!footer && (
          <Flex
            justifyContent={'flex-end'}
            gap={3}
            px={8}
            pb={8}
            pt={0}
            fontSize={'12px'}
            lineHeight={'16px'}
            letterSpacing={'0.5px'}
            {...footerStyles}
          >
            {footer}
          </Flex>
        )}
      </ModalContent>
    </Modal>
  );
};

export default React.memo(MyModal);
