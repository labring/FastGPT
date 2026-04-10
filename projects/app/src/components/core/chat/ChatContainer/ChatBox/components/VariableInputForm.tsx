import React, { useMemo } from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import { ChatTypeEnum } from '../constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { type ChatBoxInputFormType } from '../type';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';

const VariableInputForm = ({
  chatForm,
  chatStarted,
  chatType
}: {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
  chatType: ChatTypeEnum;
}) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const fileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);
  const isAssistantType = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.type === AppTypeEnum.assistant
  );

  const showExternalVariables = [ChatTypeEnum.log, ChatTypeEnum.test, ChatTypeEnum.chat].includes(
    chatType
  );
  const showInternalVariables = [ChatTypeEnum.log, ChatTypeEnum.test].includes(chatType);
  const { commonVariableList, externalVariableList, internalVariableList } = useMemo(() => {
    const {
      commonVariableList,
      externalVariableList,
      internalVariableList
    }: {
      commonVariableList: VariableItemType[];
      externalVariableList: VariableItemType[];
      internalVariableList: VariableItemType[];
    } = {
      commonVariableList: [],
      externalVariableList: [],
      internalVariableList: []
    };
    variables.forEach((item) => {
      if (item.type === VariableInputEnum.custom) {
        externalVariableList.push(item);
      } else if (item.type === VariableInputEnum.internal) {
        internalVariableList.push(item);
      } else {
        commonVariableList.push(item);
      }
    });
    return {
      externalVariableList: showExternalVariables ? externalVariableList : [],
      internalVariableList: showInternalVariables ? internalVariableList : [],
      commonVariableList
    };
  }, [showExternalVariables, showInternalVariables, variables]);

  const hasVariables =
    commonVariableList.length > 0 ||
    internalVariableList.length > 0 ||
    externalVariableList.length > 0;

  const isUnChange = chatType === ChatTypeEnum.log;

  return !hasVariables || isAssistantType ? null : (
    <Box py={3}>
      {internalVariableList.length > 0 && (
        <Box textAlign={'left'} mt={2}>
          <Flex
            color={'primary.600'}
            bg={'primary.100'}
            mb={3}
            px={3}
            py={1.5}
            gap={1}
            fontSize={'mini'}
            rounded={'sm'}
          >
            <MyIcon name={'common/info'} color={'primary.600'} w={4} />
            {t('chat:internal_variables_tip')}
          </Flex>
          <Box>
            {internalVariableList.map((item) => {
              return (
                <LabelAndFormRender
                  {...item}
                  isUnChange={isUnChange}
                  key={item.key}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type, item.valueType)}
                  form={variablesForm}
                  fieldName={`variables.${item.key}`}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {externalVariableList.length > 0 && (
        <Box textAlign={'left'} mt={2}>
          {chatType !== ChatTypeEnum.chat && (
            <Flex
              color={'primary.600'}
              bg={'primary.100'}
              mb={3}
              px={3}
              py={1.5}
              gap={1}
              fontSize={'mini'}
              rounded={'sm'}
            >
              <MyIcon name={'common/info'} color={'primary.600'} w={4} />
              {t('chat:variable_invisable_in_share')}
            </Flex>
          )}
          <Box>
            {externalVariableList.map((item) => {
              return (
                <LabelAndFormRender
                  {...item}
                  isUnChange={isUnChange}
                  key={item.key}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type, item.valueType)}
                  form={variablesForm}
                  fieldName={`variables.${item.key}`}
                />
              );
            })}
          </Box>
          {!chatStarted && commonVariableList.length === 0 && (
            <Button
              leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
              mt={4}
              h={'36px'}
              px={'14px'}
              pl={'10px'}
              borderRadius={'6px'}
              bg={'primary.600'}
              color={'white'}
              _hover={{ bg: 'primary.700' }}
              isDisabled={fileUploading}
              onClick={variablesForm.handleSubmit(() => {
                chatForm.setValue('chatStarted', true);
              })}
            >
              {t('chat:start_chat')}
            </Button>
          )}
        </Box>
      )}

      {commonVariableList.length > 0 && (
        <Box textAlign={'left'} mt={2}>
          <Box>
            {commonVariableList.map((item) => {
              return (
                <LabelAndFormRender
                  {...item}
                  isUnChange={isUnChange}
                  key={item.key}
                  placeholder={item.description}
                  inputType={variableInputTypeToInputType(item.type)}
                  form={variablesForm}
                  fieldName={`variables.${item.key}`}
                />
              );
            })}
          </Box>
          {!chatStarted && (
            <Button
              leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
              mt={4}
              h={'36px'}
              px={'14px'}
              pl={'10px'}
              borderRadius={'6px'}
              bg={'primary.600'}
              color={'white'}
              _hover={{ bg: 'primary.700' }}
              isDisabled={fileUploading}
              onClick={variablesForm.handleSubmit(() => {
                chatForm.setValue('chatStarted', true);
              })}
            >
              {t('chat:start_chat')}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

export default VariableInputForm;
