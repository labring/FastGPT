import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import type { UseFormReturn } from 'react-hook-form';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { WorkflowRuntimeContext } from '../../../context/workflowRuntimeContext';
import ChatVariableForm from '../ChatVariableForm';
import { ChatTypeEnum } from '../../constants';

type Props = {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
};

const ChatHomeVariablesForm = ({ chatForm }: Props) => {
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const fileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

  return (
    <ChatVariableForm
      variables={variableList}
      variablesForm={variablesForm}
      chatForm={chatForm}
      chatType={ChatTypeEnum.home}
      fileUploading={fileUploading}
    />
  );
};

export default ChatHomeVariablesForm;
