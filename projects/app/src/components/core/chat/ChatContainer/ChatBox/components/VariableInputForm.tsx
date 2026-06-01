import React from 'react';
import { type UseFormReturn } from 'react-hook-form';
import { ChatTypeEnum } from '../constants';
import { type ChatBoxInputFormType } from '../type';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import ChatVariableForm from './ChatVariableForm';

const VariableInputForm = ({
  chatForm,
  chatStarted,
  chatType
}: {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
  chatType: ChatTypeEnum;
}) => {
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variables = useContextSelector(
    ChatItemContext,
    (v) => v.chatBoxData?.app?.chatConfig?.variables ?? []
  );
  const fileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

  return (
    <ChatVariableForm
      variables={variables}
      variablesForm={variablesForm}
      chatForm={chatForm}
      chatType={chatType}
      showAvatar
      chatStarted={chatStarted}
      fileUploading={fileUploading}
    />
  );
};

export default VariableInputForm;
