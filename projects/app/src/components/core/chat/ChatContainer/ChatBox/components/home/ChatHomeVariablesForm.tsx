import React, { useState, useEffect } from 'react';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { Box, Flex, Card, Button } from '@chakra-ui/react';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'react-i18next';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';

type Props = {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
};

const ChatHomeVariablesForm = ({ chatForm }: Props) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const setVariableUploading = useContextSelector(ChatBoxContext, (v) => v.setVariableUploading);

  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const externalVariableList = variableList.filter(
    (item) => item.type === VariableInputEnum.custom
  );
  const commonVariableList = variableList.filter(
    (item) => item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
  );

  const [uploadingKeys, setUploadingKeys] = useState<Record<string, boolean>>({});
  const uploading = Object.values(uploadingKeys).some(Boolean);
  const getSetUploading = (key: string) => (val: boolean | ((prev: boolean) => boolean)) => {
    setUploadingKeys((prev) => ({
      ...prev,
      [key]: typeof val === 'function' ? val(prev[key] || false) : val
    }));
  };

  useEffect(() => {
    setVariableUploading(uploading);
  }, [uploading, setVariableUploading]);

  return (
    <Card
      bg={'white'}
      border={'sm'}
      borderColor={'myGray.200'}
      boxShadow={'0 0 8px rgba(0,0,0,0.05)'}
    >
      <Box p={3}>
        {/* custom variables */}
        {externalVariableList.length > 0 && (
          <>
            {externalVariableList.map((item) => (
              <LabelAndFormRender
                {...item}
                key={item.key}
                fieldName={`variables.${item.key}`}
                placeholder={item.description}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                bg={'myGray.50'}
                setUploading={getSetUploading(item.key)}
              />
            ))}
          </>
        )}
        {/* normal variables */}
        {commonVariableList.length > 0 && (
          <>
            {commonVariableList.map((item) => (
              <LabelAndFormRender
                {...item}
                key={item.key}
                fieldName={`variables.${item.key}`}
                placeholder={item.description}
                inputType={variableInputTypeToInputType(item.type)}
                form={variablesForm}
                bg={'myGray.50'}
                setUploading={getSetUploading(item.key)}
              />
            ))}
          </>
        )}
        <Button
          leftIcon={<MyIcon name={'core/chat/sendLight'} w={'1rem'} />}
          w={'100%'}
          mt={6}
          variant={'primaryOutline'}
          isDisabled={uploading}
          onClick={variablesForm.handleSubmit(() => {
            chatForm.setValue('chatStarted', true);
          })}
        >
          {t('chat:start_chat')}
        </Button>
      </Box>
    </Card>
  );
};

export default ChatHomeVariablesForm;
