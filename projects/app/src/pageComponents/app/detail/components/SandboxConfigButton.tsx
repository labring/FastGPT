import React from 'react';
import { Box, Button, Flex, HStack, Switch, useDisclosure, type FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useTranslation } from 'next-i18next';
import SandboxEntrypointEditor from './SandboxEntrypointEditor';
import SandboxNotSupportTip from './SandboxNotSupportTip';

type SandboxConfigButtonProps = Omit<FlexProps, 'onChange'> & {
  showSandbox: boolean;
  enableSandbox: boolean;
  isEnabled: boolean;
  entrypoint?: string;
  onChangeSandbox: (checked: boolean) => void;
  onChangeEntrypoint?: (value: string) => void;
};

/**
 * 统一渲染 Agent sandbox 配置入口。
 *
 * 列表行只保留状态提示与“配置”按钮，实际开关和启动脚本放在弹窗内，避免不同编辑入口
 * 各自维护一套开关与脚本编辑 UI。
 */
function SandboxConfigButton({
  showSandbox,
  enableSandbox,
  isEnabled,
  entrypoint,
  onChangeSandbox,
  onChangeEntrypoint,
  ...props
}: SandboxConfigButtonProps) {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [localEnabled, setLocalEnabled] = React.useState(isEnabled);
  const [localEntrypoint, setLocalEntrypoint] = React.useState(entrypoint || '');
  const canOpenConfig = (showSandbox && enableSandbox) || isEnabled;
  const openConfig = React.useCallback(() => {
    setLocalEnabled(isEnabled);
    setLocalEntrypoint(entrypoint || '');
    onOpen();
  }, [entrypoint, isEnabled, onOpen]);
  const confirmConfig = React.useCallback(() => {
    if (localEnabled !== isEnabled) {
      onChangeSandbox(localEnabled);
    }
    if (onChangeEntrypoint && localEntrypoint !== (entrypoint || '')) {
      onChangeEntrypoint(localEntrypoint);
    }
    onClose();
  }, [
    entrypoint,
    isEnabled,
    localEnabled,
    localEntrypoint,
    onChangeEntrypoint,
    onChangeSandbox,
    onClose
  ]);

  return (
    <Flex alignItems={'center'} gap={1} {...props}>
      {showSandbox && enableSandbox ? (
        <MyTag>{t('app:sandbox_free_tip')}</MyTag>
      ) : (
        <SandboxNotSupportTip type={showSandbox ? 'freeDisable' : 'systemDisable'} />
      )}

      <MyTooltip label={t('common:Config')}>
        <Button
          variant={'transparentBase'}
          leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          color={'myGray.600'}
          isDisabled={!canOpenConfig}
          onClick={openConfig}
        >
          {t('common:Config')}
        </Button>
      </MyTooltip>

      {isOpen && (
        <MyModal
          title={t('app:sandbox_config')}
          isOpen={isOpen}
          onClose={onClose}
          w={'640px'}
          maxW={'90vw'}
          isCentered
          borderRadius={'10px'}
          footer={
            <Button onClick={confirmConfig} px={8}>
              {t('common:Confirm')}
            </Button>
          }
        >
          <Flex alignItems={'center'}>
            <HStack spacing={1}>
              <FormLabel>{t('app:enable_agent_sandbox')}</FormLabel>
              <QuestionTip label={t('app:use_computer_desc')} />
            </HStack>
            <Box flex={1} />
            <Switch isChecked={localEnabled} onChange={(e) => setLocalEnabled(e.target.checked)} />
          </Flex>

          {onChangeEntrypoint && (
            <SandboxEntrypointEditor value={localEntrypoint} onChange={setLocalEntrypoint} />
          )}
        </MyModal>
      )}
    </Flex>
  );
}

export default React.memo(SandboxConfigButton);
