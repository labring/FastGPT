import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import type { PluginRunBoxTabEnum } from './constants';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import React from 'react';
import type { onStartChatType } from '../type';
import type { ChatGenerateStatusChangeHandler } from '../ChatBox/type';
import type { MarkChatReadBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { ChatBoxInputFormType } from '../ChatBox/type';

export type PluginRunBoxProps = {
  complianceTipPlacement?: 'default' | 'external';
  isReady?: boolean;
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  fileUploadMode?: 'runtime' | 'draft';

  onStartChat?: onStartChatType;
  onNewChat?: () => void;
  onMarkChatRead?: (data: MarkChatReadBodyType) => Promise<unknown>;
  onChatGenerateStatusChange?: ChatGenerateStatusChangeHandler;
  showTab?: PluginRunBoxTabEnum; // 如何设置了该字段，全局都 tab 不生效
};
