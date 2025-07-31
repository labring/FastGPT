import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import ImageUpload from '../ImageUpload';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';
import type { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getLogos, updateChatSetting } from '@/web/core/chat/api';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';
import type { UploadedFileItem } from '../ImageUpload/hooks/useImageUpload';

type Props = {
  logos: { wideLogoUrl?: string; squareLogoUrl?: string };
  settingTabOption: `${ChatSettingTabOptionEnum}`;
  onDiagramShow: (show: boolean) => void;
  onTabChange: (tab: `${ChatSettingTabOptionEnum}`) => void;
  onSettingsRefresh: () => Promise<void>;
};

const CopyrightSetting = ({
  logos,
  settingTabOption,
  onDiagramShow,
  onTabChange,
  onSettingsRefresh
}: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Local state management
  const [isSaving, setIsSaving] = useState(false);
  const [wideLogoUploaded, setWideLogoUploaded] = useState<UploadedFileItem[]>([]);
  const [squareLogoUploaded, setSquareLogoUploaded] = useState<UploadedFileItem[]>([]);
  const [currentLogoSettings, setCurrentLogoSettings] = useState<Props['logos']>(logos);

  // Save copyright settings
  const handleSave = useCallback(async () => {
    if (wideLogoUploaded.length === 0 && squareLogoUploaded.length === 0) {
      toast({
        status: 'warning',
        title: t('chat:setting.copyright.select_logo_image')
      });
      return;
    }

    setIsSaving(true);
    try {
      const updateData: Partial<ChatSettingSchema> = {};
      if (wideLogoUploaded.length > 0) {
        updateData.wideLogoUrl = wideLogoUploaded[0].url;
      }
      if (squareLogoUploaded.length > 0) {
        updateData.squareLogoUrl = squareLogoUploaded[0].url;
      }

      await updateChatSetting(updateData);

      // Clear uploaded state
      setWideLogoUploaded([]);
      setSquareLogoUploaded([]);

      // Refresh all settings
      await onSettingsRefresh();

      toast({
        status: 'success',
        title: t('chat:setting.copyright.save_success')
      });
    } catch (error) {
      const errorMessage = getErrText(error, t('chat:setting.copyright.save_fail'));
      toast({
        status: 'error',
        title: errorMessage
      });
    } finally {
      setIsSaving(false);
    }
  }, [wideLogoUploaded, squareLogoUploaded, toast, onSettingsRefresh, t]);

  // Check if there are changes to enable/disable save button
  const hasChanges = wideLogoUploaded.length > 0 || squareLogoUploaded.length > 0;

  useEffect(() => {
    setCurrentLogoSettings(logos);
  }, [logos]);

  return (
    <Flex flexDir="column" px={6} py={5} gap={'52px'} h="full">
      <Flex flexShrink={0} justifyContent={'space-between'} gap={4} alignItems={'center'}>
        <SettingTabs settingTabOption={settingTabOption} onTabChange={onTabChange} />

        <Button
          variant={'outline'}
          borderColor={'primary.300'}
          _hover={{ bg: 'primary.50' }}
          color={'primary.700'}
          isLoading={isSaving}
          isDisabled={!hasChanges}
          leftIcon={<MyIcon name={'core/chat/setting/save'} />}
          onClick={handleSave}
        >
          {t('chat:setting.save')}
        </Button>
      </Flex>

      <Flex
        flexGrow={1}
        overflowY={'auto'}
        justifyContent={'flex-start'}
        alignItems={'center'}
        flexDir="column"
        w="630px"
        alignSelf="center"
      >
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
            {t('chat:setting.copyright.basic_configuration')}
          </Flex>

          <Box>
            <Flex fontWeight={'500'} fontSize="14px" alignItems={'center'} gap={2} mb={2}>
              <Box>{t('chat:setting.copyright.logo')}</Box>

              <Button
                variant={'link'}
                size={'sm'}
                color={'primary.600'}
                _hover={{ textDecoration: 'none', color: 'primary.400' }}
                _active={{ color: 'primary.600' }}
                onClick={() => onDiagramShow(true)}
              >
                {t('chat:setting.copyright.diagram')}
              </Button>
            </Flex>

            <Flex alignItems="center">
              <ImageUpload
                height="100px"
                aspectRatio={2.84 / 1}
                imageSrc={currentLogoSettings?.wideLogoUrl}
                defaultImageSrc={'/imgs/fastgpt_slogan.png'}
                tips={t('chat:setting.copyright.tips')}
                onFileSelect={setWideLogoUploaded}
                uploadedFiles={wideLogoUploaded}
              />

              <Box mx={8} w="1px" h="100px" alignSelf="flex-start" bg="myGray.200" />

              <ImageUpload
                height="100px"
                aspectRatio={1 / 1}
                imageSrc={currentLogoSettings?.squareLogoUrl}
                defaultImageSrc={'/imgs/fastgpt_slogan_fold.png'}
                tips={t('chat:setting.copyright.tips.square')}
                onFileSelect={setSquareLogoUploaded}
                uploadedFiles={squareLogoUploaded}
              />
            </Flex>
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default CopyrightSetting;
