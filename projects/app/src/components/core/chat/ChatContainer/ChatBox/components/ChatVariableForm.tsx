import React, { useMemo } from 'react';
import { Box, Button, Card, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { UseFormReturn } from 'react-hook-form';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import type { ChatBoxInputFormType } from '../type';
import { ChatTypeEnum } from '../constants';

export type VariableGroups = {
  commonVariableList: VariableItemType[];
  externalVariableList: VariableItemType[];
  internalVariableList: VariableItemType[];
};

type ChatVariableFormProps = {
  variables: VariableItemType[];
  variablesForm: UseFormReturn<any>;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatType: ChatTypeEnum;
  showAvatar?: boolean;
  chatStarted?: boolean;
  fileUploading?: boolean;
};

const ChatVariableCard = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card
      w={['100%', '360px']}
      maxW={'100%'}
      bg={'white'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'8px'}
      boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'}
      p={4}
    >
      {children}
    </Card>
  );
};

const ChatVariableTip = ({ children }: { children: React.ReactNode }) => {
  return (
    <Flex
      color={'primary.600'}
      bg={'primary.50'}
      mb={4}
      px={3}
      py={2}
      gap={2}
      fontSize={'sm'}
      borderRadius={'6px'}
      alignItems={'flex-start'}
    >
      <MyIcon name={'common/info'} color={'primary.600'} w={4} mt={'1px'} flexShrink={0} />
      <Box>{children}</Box>
    </Flex>
  );
};

export const getChatVariableGroups = ({
  variables,
  chatType
}: {
  variables: VariableItemType[];
  chatType: ChatTypeEnum;
}): VariableGroups => {
  const showExternalVariables = [
    ChatTypeEnum.log,
    ChatTypeEnum.test,
    ChatTypeEnum.chat,
    ChatTypeEnum.home
  ].includes(chatType);
  const showInternalVariables = [ChatTypeEnum.log, ChatTypeEnum.test].includes(chatType);
  const groups: VariableGroups = {
    commonVariableList: [],
    externalVariableList: [],
    internalVariableList: []
  };

  variables.forEach((item) => {
    if (item.type === VariableInputEnum.custom) {
      groups.externalVariableList.push(item);
    } else if (item.type === VariableInputEnum.internal) {
      groups.internalVariableList.push(item);
    } else {
      groups.commonVariableList.push(item);
    }
  });

  return {
    externalVariableList: showExternalVariables ? groups.externalVariableList : [],
    internalVariableList: showInternalVariables ? groups.internalVariableList : [],
    commonVariableList: groups.commonVariableList
  };
};

export const ChatVariableFields = ({
  variables,
  variablesForm,
  isUnChange
}: {
  variables: VariableItemType[];
  variablesForm: UseFormReturn<any>;
  isUnChange: boolean;
}) => {
  return (
    <>
      {variables.map((item) => (
        <LabelAndFormRender
          {...item}
          isUnChange={isUnChange}
          key={item.key}
          fieldName={`variables.${item.key}`}
          description={item.description}
          inputType={variableInputTypeToInputType(item.type, item.valueType)}
          form={variablesForm}
          bg={'white'}
        />
      ))}
    </>
  );
};

const ChatVariableStartButton = ({
  fileUploading,
  onClick
}: {
  fileUploading?: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex justifyContent={'flex-end'} mt={6}>
      <Button
        w={'69px'}
        h={'36px'}
        px={'20px'}
        py={'8px'}
        borderRadius={'8px'}
        fontSize={'14px'}
        variant={'primary'}
        isDisabled={fileUploading}
        onClick={onClick}
      >
        {t('common:Submit')}
      </Button>
    </Flex>
  );
};

/**
 * 渲染 ChatBox 内的全局变量填写表单。
 *
 * Home 和普通 App 对话都复用这个组件：调用方只提供当前变量声明和表单实例，
 * 组件内部按 chatType 保留原有 custom/internal/common 变量可见性规则，并统一卡片、
 * 字段列表和提交按钮样式，避免两个入口后续样式继续漂移。
 */
const ChatVariableForm = ({
  variables,
  variablesForm,
  chatForm,
  chatType,
  showAvatar = false,
  chatStarted = false,
  fileUploading
}: ChatVariableFormProps) => {
  const { t } = useTranslation();

  const { commonVariableList, externalVariableList, internalVariableList } = useMemo(
    () => getChatVariableGroups({ variables, chatType }),
    [chatType, variables]
  );

  const editableVariables = [...externalVariableList, ...commonVariableList];
  const visibleVariables = [...internalVariableList, ...editableVariables];
  const isUnChange = chatType === ChatTypeEnum.log;
  const canStartChat = editableVariables.length > 0 && !chatStarted;

  if (visibleVariables.length === 0) return null;

  const renderFormCard = () => (
    <ChatVariableCard>
      {internalVariableList.length > 0 && (
        <ChatVariableTip>{t('chat:internal_variables_tip')}</ChatVariableTip>
      )}

      {externalVariableList.length > 0 &&
        chatType !== ChatTypeEnum.chat &&
        chatType !== ChatTypeEnum.home && (
          <ChatVariableTip>{t('chat:variable_invisable_in_share')}</ChatVariableTip>
        )}

      <ChatVariableFields
        variables={visibleVariables}
        variablesForm={variablesForm}
        isUnChange={isUnChange}
      />

      {canStartChat && (
        <ChatVariableStartButton
          fileUploading={fileUploading}
          onClick={variablesForm.handleSubmit(() => {
            chatForm.setValue('chatStarted', true);
          })}
        />
      )}
    </ChatVariableCard>
  );

  return showAvatar ? (
    <Box py={showAvatar ? 3 : 0}>
      <Box className="chat-box-card" w={'100%'} maxW={['calc(100% - 25px)', '700px']} mx={'auto'}>
        <Box textAlign={'left'}>{renderFormCard()}</Box>
      </Box>
    </Box>
  ) : (
    <Box textAlign={'left'}>{renderFormCard()}</Box>
  );
};

export default React.memo(ChatVariableForm);
