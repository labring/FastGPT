import type {
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';
import type { ChatSourceTarget } from '@/web/core/chat/utils';
import type {
  ChatHistoryItemResType,
  ChatItemObjItemType,
  ResponseTagItemType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export type UserInputFileItemType = {
  id: string;
  /** 本地上传任务 ID，只用于前端取消、进度写回和删除定位。历史消息可能没有该字段。 */
  uploadId?: string;
  rawFile?: File;
  type: `${ChatFileTypeEnum}`;
  name: string;
  icon: string; // img is base64
  status: 0 | 1; // 0: 待上传，1: 上传中或已成功；是否成功以 url 为准
  url?: string;
  key?: string; // S3 key for the file
  process?: number;
  error?: string;
};

export type ChatBoxInputFormType = {
  input: string;
  files: UserInputFileItemType[]; // global files
  chatStarted: boolean;
  variables: Record<string, any>;
};

export type ChatBoxInputType = {
  text?: string;
  files?: UserInputFileItemType[];
  interactive?: WorkflowInteractiveResponseType;
  hideInUI?: boolean;
  /** 发送后是否清空输入框；默认不清空，只有主输入框确认发送等占用输入框内容的场景显式设为 true。 */
  clearInput?: boolean;
};

export type SendPromptFnType = (
  e: ChatBoxInputType & {
    autoTTSResponse?: boolean;
    history?: ChatSiteItemType[];
  }
) => void;

export type StopChatFnResult = {
  chatGenerateStatus: ChatGenerateStatusEnum;
  completed: boolean;
};

export type ChatGenerateStatusChangePayload = {
  sourceTarget: ChatSourceTarget;
  chatId: string;
  status: ChatGenerateStatusEnum;
  hasBeenRead?: boolean;
  title?: string;
};

export type ChatGenerateStatusChangeHandler = (data: ChatGenerateStatusChangePayload) => void;

export type ComponentRef = {
  restartChat: () => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
};

// Frontend type
export type ChatSiteItemType = ChatItemObjItemType & {
  _id?: string;
  id: string;
  dataId: string;
  status: `${ChatStatusEnum}`;
  moduleName?: string;
  ttsBuffer?: Uint8Array;
  responseData?: ChatHistoryItemResType[];
  time?: Date;
  durationSeconds?: number;
  errorMsg?: string;
  deleteTime?: Date | null;
  collapseTop?: {
    count: number;
    dataIds: string[];
    isExpanded: boolean;
  };
  collapseBottom?: {
    count: number;
    dataIds: string[];
    isExpanded: boolean;
  };
} & ChatBoxInputType &
  ResponseTagItemType;
