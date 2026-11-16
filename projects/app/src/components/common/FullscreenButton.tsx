import { Box, IconButton, Image } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';

/** 在普通尺寸和全屏尺寸之间切换，并保留设计稿的悬停图标。 */
const FullscreenButton = ({
  isFullscreen,
  onClick
}: {
  isFullscreen: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const { basePath } = useRouter();
  const label = t(isFullscreen ? 'common:exit_fullscreen' : 'common:enter_fullscreen');
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
        borderRadius={'8px'}
        _hover={{
          bg: 'myGray.05',
          '.fullscreen-default': { display: 'none' },
          '.fullscreen-hover': { display: 'block' }
        }}
        onClick={onClick}
        icon={
          <Box
            w={'20px'}
            h={'20px'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <Image className={'fullscreen-default'} src={`${basePath}/${icon}.svg`} alt={''} />
            <Image
              className={'fullscreen-hover'}
              src={`${basePath}/${icon}-hover.svg`}
              alt={''}
              display={'none'}
            />
          </Box>
        }
      />
    </MyTooltip>
  );
};

export default FullscreenButton;
