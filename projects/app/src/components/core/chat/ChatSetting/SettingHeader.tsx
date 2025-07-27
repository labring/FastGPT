import {
  ChatSettingTabOptionEnum,
  useChatSettingContext
} from '@/web/core/chat/context/chatSettingContext';
import { useCallback, useMemo } from 'react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { Button, ButtonGroup, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';

const SettingHeader = () => {
  const { t } = useTranslation();
  const { settingTabOption, setSettingTabOption, handleCurrentTabSave, getCurrentTabSaveConfig } =
    useChatSettingContext();

  // 获取当前tab的保存配置
  const currentTabSaveConfig = getCurrentTabSaveConfig();
  const isSaving = currentTabSaveConfig?.isSaving || false;
  const hasUnsavedChanges = currentTabSaveConfig?.hasChanges || false;

  const tabOptions: Parameters<typeof FillRowTabs<`${ChatSettingTabOptionEnum}`>>[0]['list'] =
    useMemo(
      () => [
        // {
        //   label: t('common:core.chat.setting.Home'),
        //   value: ChatSettingTabOptionEnum.HOME
        // },
        {
          label: t('common:core.chat.setting.Copyright'),
          value: ChatSettingTabOptionEnum.COPYRIGHT
        }
      ],
      [t]
    );

  const handleChangeTab = useCallback(
    (value: string) => {
      setSettingTabOption(value as ChatSettingTabOptionEnum);
    },
    [setSettingTabOption]
  );

  // const handleShareSetting = useCallback(() => {}, []);

  const handleSaveSetting = useCallback(() => {
    handleCurrentTabSave();
  }, [handleCurrentTabSave]);

  return (
    <Flex alignItems={'center'} justifyContent={'space-between'} gap={4}>
      <FillRowTabs
        px={3}
        py={2}
        list={tabOptions}
        value={settingTabOption}
        onChange={handleChangeTab}
      />

      <ButtonGroup size="md" spacing={3}>
        <Button
          variant={'outline'}
          borderColor={'primary.300'}
          _hover={{ bg: 'primary.50' }}
          color={'primary.700'}
          leftIcon={<MyIcon name={'core/chat/setting/save'} />}
          onClick={handleSaveSetting}
          isLoading={isSaving}
          loadingText="保存中..."
          isDisabled={!hasUnsavedChanges}
        >
          {t('common:core.chat.setting.Save')}
        </Button>

        {/* <Button
          variant={'solid'}
          color="#fff"
          bg={'primary.600'}
          _hover={{ bg: 'primary.700' }}
          leftIcon={<MyIcon name={'core/chat/setting/share'} />}
          onClick={handleShareSetting}
        >
          {t('common:core.chat.setting.Share')}
        </Button> */}
      </ButtonGroup>
    </Flex>
  );
};

export default SettingHeader;
