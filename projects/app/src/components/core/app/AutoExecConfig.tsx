import { Box, Flex, ModalBody, Switch, Textarea, useDisclosure } from '@chakra-ui/react';
import { defaultAutoExecuteConfig } from '@fastgpt/global/core/app/constants';
import { type AppAutoExecuteConfigType } from '@fastgpt/global/core/app/type';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'next-i18next';
import ChatFunctionTip from './Tip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import AppConfigItem, { AppConfigItemAction } from './AppConfigItem';

const AutoExecConfig = ({
  value = defaultAutoExecuteConfig,
  onChange
}: {
  value?: AppAutoExecuteConfigType;
  onChange: (e: AppAutoExecuteConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const isOpenAutoExec = value.open;
  const defaultPrompt = value.defaultPrompt;

  const formLabel = isOpenAutoExec
    ? t('common:core.app.whisper.Open')
    : t('common:core.app.whisper.Close');

  return (
    <>
      <AppConfigItem
        icon={'core/app/simpleMode/autoExec'}
        label={t('app:auto_execute')}
        tip={<ChatFunctionTip type={'autoExec'} />}
        action={
          <AppConfigItemAction tooltip={t('common:core.app.Config_auto_execute')} onClick={onOpen}>
            {formLabel}
          </AppConfigItemAction>
        }
      />
      <MyModal
        title={t('common:core.app.Auto execute')}
        iconSrc="core/app/simpleMode/autoExec"
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody>
          <Flex justifyContent={'space-between'} alignItems={'center'}>
            <FormLabel flex={'0 0 100px'}>{t('app:open_auto_execute')}</FormLabel>
            <Switch
              isChecked={isOpenAutoExec}
              onChange={(e) => {
                onChange({
                  ...value,
                  open: e.target.checked
                });
              }}
            />
          </Flex>
          {isOpenAutoExec && (
            <Box mt={4}>
              <FormLabel mb={1}>{t('common:core.app.schedule.Default prompt')}</FormLabel>
              <Textarea
                value={defaultPrompt}
                rows={8}
                bg={'myGray.50'}
                placeholder={t('app:auto_execute_default_prompt_placeholder')}
                onChange={(e) => {
                  onChange({
                    ...value,
                    defaultPrompt: e.target.value
                  });
                }}
              />
            </Box>
          )}
        </ModalBody>
      </MyModal>
    </>
  );
};

export default AutoExecConfig;
