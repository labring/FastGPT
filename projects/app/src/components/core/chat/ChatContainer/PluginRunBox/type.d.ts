import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './constants';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import React from 'react';
import { onStartChatType } from '../type';
import { ChatBoxInputFormType } from '../ChatBox/type';

export type PluginRunBoxProps = OutLinkChatAuthProps & {
  pluginInputs: FlowNodeInputItemType[];
  variablesForm: UseFormReturn<ChatBoxInputFormType, any>;
  histories: ChatSiteItemType[]; // chatHistories[1] is the response
  setHistories: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;

  onStartChat?: onStartChatType;
  onNewChat?: () => void;

  appId: string;
  chatId?: string;
  tab: PluginRunBoxTabEnum;
  setTab: React.Dispatch<React.SetStateAction<PluginRunBoxTabEnum>>;
  chatConfig?: AppChatConfigType;
};
