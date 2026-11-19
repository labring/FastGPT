import React from 'react';
import { Box, Flex, FocusLock, Portal } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { useDebugFullscreen } from '../hooks/useDebugFullscreen';

/** 在侧栏和全屏之间切换外壳，保持子组件挂载及输入状态。 */
const DebugFullscreenContainer = ({
  fullscreen,
  children
}: {
  fullscreen: ReturnType<typeof useDebugFullscreen>;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { isFullscreen, isClosing, prefersReducedMotion, animation, onAnimationEnd, close } =
    fullscreen;

  return (
    <Box h={'full'} w={'full'} sx={{ '& > div:not([data-focus-guard])': { display: 'contents' } }}>
      <Portal>
        <Box
          position={'fixed'}
          inset={0}
          zIndex={1299}
          bg={'myGray.100'}
          opacity={isFullscreen && !isClosing ? 1 : 0}
          pointerEvents={isFullscreen && !isClosing ? 'auto' : 'none'}
          transition={`opacity ${prefersReducedMotion ? '0ms' : '200ms'} ease`}
          onClick={close}
        />
      </Portal>
      <FocusLock isDisabled={!isFullscreen} autoFocus={false}>
        <Flex
          h={isFullscreen ? 'calc(100vh - 2.5rem)' : 'full'}
          w={isFullscreen ? 'calc(100vw - 2.5rem)' : undefined}
          position={isFullscreen ? 'fixed' : undefined}
          top={isFullscreen ? '1.25rem' : undefined}
          left={isFullscreen ? '1.25rem' : undefined}
          zIndex={isFullscreen ? 1300 : undefined}
          role={isFullscreen ? 'dialog' : undefined}
          aria-modal={isFullscreen ? true : undefined}
          aria-label={isFullscreen ? t('app:chat_debug') : undefined}
          data-debug-fullscreen={isFullscreen ? true : undefined}
          gap={2}
          {...(isFullscreen
            ? {
                borderRadius: '1rem',
                border: '1px solid',
                borderColor: 'myGray.250',
                bg: 'myGray.25',
                boxShadow: '1.5',
                overflow: 'hidden'
              }
            : {})}
          animation={animation}
          onAnimationEnd={onAnimationEnd}
        >
          {children}
        </Flex>
      </FocusLock>
    </Box>
  );
};

export default DebugFullscreenContainer;
