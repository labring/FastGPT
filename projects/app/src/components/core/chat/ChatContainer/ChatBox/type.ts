import type { ChatFileTypeEnum, ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatHistoryItemResType,
  ChatItemObjItemType,
  ResponseTagItemType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

export type UserInputFileItemType = {
  id: string;
  rawFile?: File;
  type: `${ChatFileTypeEnum}`;
  name: string;
  icon: string; // img is base64
  status: 0 | 1; // 0: uploading, 1: success
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
};

export type SendPromptFnType = (
  e: ChatBoxInputType & {
    autoTTSResponse?: boolean;
    history?: ChatSiteItemType[];
  }
) => void;

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
