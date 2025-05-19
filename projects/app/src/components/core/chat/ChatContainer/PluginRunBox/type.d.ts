import { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import { PluginRunBoxTabEnum } from './constants';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import React from 'react';
import { onStartChatType } from '../type';
import { ChatBoxInputFormType } from '../ChatBox/type';

export type PluginRunBoxProps = {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;

  onStartChat?: onStartChatType;
  onNewChat?: () => void;
  showTab?: PluginRunBoxTabEnum; // 如何设置了该字段，全局都 tab 不生效
};
