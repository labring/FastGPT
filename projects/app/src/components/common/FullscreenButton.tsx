import { Box, IconButton } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';

/** 在普通尺寸和全屏尺寸之间切换。 */
const FullscreenButton = ({
  isFullscreen,
  onClick
}: {
  isFullscreen: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const { basePath } = useRouter();
  const label = isFullscreen ? t('common:exit_fullscreen') : t('common:enter_fullscreen');
  const icon = isFullscreen ? 'icon-exit-fullscreen' : 'icon-fullscreen';

  return (
    <MyTooltip label={label}>
      <IconButton
        aria-label={label}
        size={'smSquare'}
        w={'30px'}
        h={'30px'}
        minW={'30px'}
        minH={'30px'}
        variant={'ghost'}
        bg={'transparent'}
        color={'#111824'}
        borderRadius={'8px'}
        _hover={{ bg: 'myGray.05', color: 'primary.600' }}
        onClick={onClick}
        icon={
          <Box
            w={'16px'}
            h={'16px'}
            bg={'currentColor'}
            sx={{
              mask: `url("${basePath}/${icon}.svg") center / contain no-repeat`,
              WebkitMask: `url("${basePath}/${icon}.svg") center / contain no-repeat`
            }}
          />
        }
      />
    </MyTooltip>
  );
};

export default FullscreenButton;
