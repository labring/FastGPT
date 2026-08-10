import React, { type Dispatch } from 'react';
import { Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import ChatFunctionTip from '@/components/core/app/Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { type AppChatConfigType, type AppDetailType } from '@fastgpt/global/core/app/type';

export type PluginConfigFormProps = {
  chatConfig: AppChatConfigType;
  setAppDetail: Dispatch<React.SetStateAction<AppDetailType>>;
};

export function PluginConfigForm({
  chatConfig: { instruction },
  setAppDetail
}: PluginConfigFormProps) {
  const { t } = useTranslation();

  return (
    <>
      <Flex alignItems={'center'}>
        <MyIcon name={'core/app/simpleMode/chat'} mr={2} w={'20px'} />
        <FormLabel color={'myGray.600'} fontWeight={'medium'} fontSize={'14px'}>
          {t('workflow:plugin.Instructions')}
        </FormLabel>
        <ChatFunctionTip type={'instruction'} />
      </Flex>
      <MyTextarea
        iconSrc={'core/app/simpleMode/chat'}
        title={t('workflow:plugin.Instructions')}
        mt={2}
        rows={6}
        fontSize={'14px'}
        bg={'white'}
        resize={'both'}
        placeholder={t('workflow:plugin.Instruction_Tip')}
        value={instruction}
        autoHeight
        minH={100}
        maxH={240}
        onChange={(e) => {
          setAppDetail((state) => ({
            ...state,
            chatConfig: {
              ...state.chatConfig,
              instruction: e.target.value
            }
          }));
        }}
      />
    </>
  );
}
