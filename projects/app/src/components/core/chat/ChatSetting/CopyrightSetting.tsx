import { Box, Button, Flex } from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'react-i18next';
import ImageUpload from './ImageUpload';
import { useChatSettingContext } from '@/web/core/chat/context/chatSettingContext';
import type { PreviewFileItem } from '@/web/core/chat/context/chatSettingContext';

const CopyrightSetting = () => {
  const { t } = useTranslation();
  const {
    setShowDiagram,
    wideLogoPreview,
    setWideLogoPreview,
    squareLogoPreview,
    setSquareLogoPreview,
    currentLogoSettings
  } = useChatSettingContext();

  // 处理宽Logo文件选择
  const handleWideLogoSelect = (previewFiles: PreviewFileItem[]) => {
    setWideLogoPreview(previewFiles);
  };

  // 处理方形Logo文件选择
  const handleSquareLogoSelect = (previewFiles: PreviewFileItem[]) => {
    setSquareLogoPreview(previewFiles);
  };

  return (
    <Flex flexDir="column" gap={6} w="100%">
      <Flex
        fontWeight={'500'}
        alignItems={'center'}
        gap={3}
        _before={{
          content: '""',
          display: 'block',
          h: '14px',
          w: '4px',
          bg: 'primary.600',
          borderRadius: '8px'
        }}
      >
        {t('common:core.chat.setting.Copyright Basic Configuration')}
      </Flex>

      <Box>
        <Flex fontWeight={'500'} fontSize="14px" alignItems={'center'} gap={2} mb={2}>
          <Box>{t('common:core.chat.setting.Copyright Logo')}</Box>

          <Button
            variant={'link'}
            size={'sm'}
            color={'primary.600'}
            _hover={{ textDecoration: 'none', color: 'primary.400' }}
            _active={{ color: 'primary.600' }}
            onClick={() => setShowDiagram(true)}
          >
            {t('common:core.chat.setting.Copyright Diagram')}
          </Button>
        </Flex>

        <Flex alignItems="center">
          <ImageUpload
            height="100px"
            aspectRatio={2.84 / 1}
            imageSrc={currentLogoSettings?.wideLogoUrl}
            defaultImageSrc={'/imgs/fastgpt_slogan.png'}
            tips="建议比例 4:1"
            preview={true}
            onFileSelect={handleWideLogoSelect}
            previewFiles={wideLogoPreview}
          />

          <Box mx={8} w="1px" h="100px" alignSelf="flex-start" bg="myGray.200" />

          <ImageUpload
            height="100px"
            aspectRatio={1 / 1}
            imageSrc={currentLogoSettings?.squareLogoUrl}
            defaultImageSrc={'/imgs/fastgpt_slogan_fold.png'}
            tips="建议比例 1:1"
            preview={true}
            onFileSelect={handleSquareLogoSelect}
            previewFiles={squareLogoPreview}
          />
        </Flex>
      </Box>
    </Flex>
  );
};

export default CopyrightSetting;
