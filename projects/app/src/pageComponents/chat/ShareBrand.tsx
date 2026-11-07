import React, { useRef } from 'react';
import { Box, Flex, IconButton, Image, Link } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ShareChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useShareBrandTracking, type ShareBrandSession } from './useShareBrandTracking';

/** 渲染品牌入口；页面级曝光和点击由专用 hook 管理。 */
const ShareBrand = ({
  narrow,
  session,
  outLinkAuthData,
  onDismiss
}: {
  narrow: boolean;
  session: React.MutableRefObject<ShareBrandSession>;
  outLinkAuthData?: ShareChatAuthProps;
  onDismiss: () => void;
}) => {
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const element = useRef<HTMLDivElement>(null);

  const trackClick = useShareBrandTracking({
    element,
    session,
    outLinkAuthData,
    enabled: !!feConfigs.isPlus
  });

  return (
    <Flex
      ref={element}
      data-share-brand={narrow ? 'narrow' : 'wide'}
      position="relative"
      zIndex={10}
      justifyContent="center"
      flexShrink={0}
      pb={narrow ? 4 : 0}
      px={narrow ? 0 : 2}
      w={narrow ? '100%' : undefined}
      minW={narrow ? undefined : '120px'}
      h={narrow ? undefined : '32px'}
      gap={narrow ? 1 : 0}
      borderRadius={narrow ? undefined : 'full'}
      borderWidth={narrow ? 0 : '1px'}
      borderColor="myGray.200"
      bg={narrow ? 'white' : 'rgba(17, 24, 36, 0.05)'}
      role="group"
      alignItems="center"
      sx={
        narrow
          ? undefined
          : {
              // 以宽度和透明度过渡，让胶囊平滑展开、收起。
              '&:hover [data-brand-close], &:focus-within [data-brand-close]': {
                maxWidth: '25px',
                marginLeft: 2,
                opacity: 1,
                visibility: 'visible',
                pointerEvents: 'auto'
              },
              '&:hover a, &:focus-within a': { gap: 2 }
            }
      }
    >
      <MyTooltip
        label={t('common:share_brand_visit')}
        shouldWrapChildren={false}
        placement="bottom"
        offset={[0, 12]}
      >
        <Link
          href={getWebReqUrl('/')}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('common:share_brand_visit')}
          display="flex"
          alignItems="center"
          justifyContent="center"
          gap={narrow ? 0 : 1}
          h={narrow ? '16px' : '26px'}
          color={narrow ? '#8A95A7' : 'black'}
          fontFamily={'"PingFang SC", sans-serif'}
          fontSize={narrow ? '12px' : '18px'}
          fontWeight={narrow ? 400 : 600}
          lineHeight={narrow ? '16px' : '26px'}
          letterSpacing={narrow ? '0.048px' : '0.15px'}
          whiteSpace="nowrap"
          transition={narrow ? undefined : 'gap 200ms ease-out'}
          _hover={{
            textDecoration: 'none',
            color: narrow ? '#8A95A7' : 'black'
          }}
          onClick={trackClick}
        >
          {!narrow && <Image src={getWebReqUrl('/icon/logo.svg')} w="22px" h="22px" alt="" />}
          {narrow ? (
            <>
              <Box as="span" whiteSpace="pre">
                Made by{' '}
              </Box>
              <Box as="span" color="#2B5FD9" fontWeight={500} letterSpacing="0.5px">
                FastGPT
              </Box>
              <MyIcon name="common/upperRight" w="16px" h="16px" color="#2B5FD9" ml={1} />
            </>
          ) : (
            <Box>FastGPT</Box>
          )}
        </Link>
      </MyTooltip>
      {!narrow && (
        <Flex
          data-brand-close
          alignItems="center"
          gap={2}
          w="25px"
          maxW={0}
          ml={0}
          opacity={0}
          visibility="hidden"
          pointerEvents="none"
          overflow="hidden"
          flexShrink={0}
          transition="max-width 200ms ease-out, margin-left 200ms ease-out, opacity 200ms ease-out, visibility 200ms linear"
        >
          <Box w="1px" h="12px" bg="myGray.500" flexShrink={0} />
          <IconButton
            aria-label={t('common:share_brand_dismiss')}
            icon={<MyIcon name="common/closeLight" w="16px" />}
            size="xs"
            variant="unstyled"
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            minW="16px"
            minH="16px"
            w="16px"
            h="16px"
            color="myGray.500"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDismiss();
            }}
          />
        </Flex>
      )}
    </Flex>
  );
};
export default React.memo(ShareBrand);
