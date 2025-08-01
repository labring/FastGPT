import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyInput from '@/components/MyInput';
import { useCallback, useMemo, useState } from 'react';
import SettingTabs from '@/components/core/chat/ChatSetting/SettingTabs';
import type { ChatSettingTabOptionEnum } from '@/global/core/chat/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { updateChatSetting } from '@/web/core/chat/api';

type Props = {
  settingTabOption: `${ChatSettingTabOptionEnum}`;
  onDiagramShow: (show: boolean) => void;
  onTabChange: (tab: `${ChatSettingTabOptionEnum}`) => void;
  onSettingsRefresh: () => Promise<void>;
  slogan?: string;
  dialogTips?: string;
};

const HomepageSetting = ({
  settingTabOption,
  slogan: _slogan,
  dialogTips: _dialogTips,
  onDiagramShow,
  onTabChange,
  onSettingsRefresh
}: Props) => {
  const { t } = useTranslation();

  const [slogan, setSlogan] = useState(_slogan || '');
  const [dialogTips, setDialogTips] = useState(_dialogTips || '');
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = slogan !== _slogan || dialogTips !== _dialogTips;

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      await updateChatSetting({
        slogan,
        dialogTips
      });
      onSettingsRefresh();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  }, [slogan, dialogTips, onSettingsRefresh]);

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
          <Box fontWeight={'500'}>
            <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
              <Box>{t('chat:setting.home.slogan')}</Box>

              <Button
                variant={'link'}
                size={'sm'}
                color={'primary.600'}
                _hover={{ textDecoration: 'none', color: 'primary.400' }}
                _active={{ color: 'primary.600' }}
                onClick={() => onDiagramShow(true)}
              >
                {t('chat:setting.home.diagram')}
              </Button>
            </Flex>

            <Box>
              <MyInput
                isDisabled={isSaving}
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                placeholder={t('chat:setting.home.slogan_placeholder')}
              />
            </Box>
          </Box>

          <Box fontWeight={'500'}>
            <Flex fontWeight={'500'} fontSize="14px" mb={2} alignItems={'center'} gap={2}>
              <Box>{t('chat:setting.home.dialogue_tips')}</Box>

              <Button
                variant={'link'}
                size={'sm'}
                color={'primary.600'}
                _hover={{ textDecoration: 'none', color: 'primary.400' }}
                _active={{ color: 'primary.600' }}
                onClick={() => onDiagramShow(true)}
              >
                {t('chat:setting.home.diagram')}
              </Button>
            </Flex>

            <Box>
              <MyInput
                isDisabled={isSaving}
                value={dialogTips}
                onChange={(e) => setDialogTips(e.target.value)}
                placeholder={t('chat:setting.home.dialogue_tips_placeholder')}
              />
            </Box>
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default HomepageSetting;
