import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import { Button, useDisclosure } from '@chakra-ui/react';
import { AIChatModuleProps } from '@fastgpt/global/core/module/node/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AIChatSettingsModal from '@/components/core/module/AIChatSettingsModal';

const AiSettingRender = ({ inputs = [], moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const chatModulesData = useMemo(() => {
    const obj: Record<string, any> = {};
    inputs.forEach((item) => {
      obj[item.key] = item.value;
    });
    return obj as AIChatModuleProps;
  }, [inputs]);

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();

  return (
    <>
      <Button
        variant={'whitePrimary'}
        leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
        onClick={onOpenAIChatSetting}
      >
        {t('app.AI Settings')}
      </Button>
      {isOpenAIChatSetting && (
        <AIChatSettingsModal
          isAdEdit
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            for (let key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key,
                value: {
                  ...item,
                  //@ts-ignore
                  value: e[key]
                }
              });
            }
            onCloseAIChatSetting();
          }}
          defaultData={chatModulesData}
        />
      )}
    </>
  );
};

export default React.memo(AiSettingRender);
