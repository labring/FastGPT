import { IconButton } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

/** 在普通尺寸和全屏尺寸之间切换。 */
const FullscreenButton = ({
  isFullscreen,
  onClick
}: {
  isFullscreen: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const label = isFullscreen ? t('common:exit_fullscreen') : t('common:enter_fullscreen');

  return (
    <MyTooltip label={label}>
      <IconButton
        aria-label={label}
        size={'smSquare'}
        variant={'ghost'}
        bg={'transparent'}
        color={'myGray.900'}
        borderRadius={'8px'}
        _hover={{ bg: 'myGray.05', color: 'primary.600' }}
        onClick={onClick}
        icon={
          <MyIcon
            name={isFullscreen ? 'common/exitFullscreen' : 'fullScreen'}
            w={'14px'}
            h={'14px'}
          />
        }
      />
    </MyTooltip>
  );
};

export default FullscreenButton;
