import { defaultAppSelectFileConfig } from '../../app/constants';
import type { AppChatConfigType } from '../../app/type';

export const WORKFLOW_BUILDER_MAX_FILE_AMOUNT = 10;

/**
 * Workflow Builder 的独立对话配置。
 *
 * Builder 可以通过 WorkflowDocument 读取和修改原工作流的 chatConfig，
 * 但其自身对话不得继承这些运行前置配置。
 */
export const WORKFLOW_BUILDER_CHAT_CONFIG = {
  whisperConfig: {
    open: true,
    autoSend: false,
    autoTTSResponse: false
  },
  fileSelectConfig: {
    ...defaultAppSelectFileConfig,
    maxFiles: WORKFLOW_BUILDER_MAX_FILE_AMOUNT,
    canSelectFile: true,
    canSelectImg: true,
    customPdfParse: false,
    canSelectVideo: true,
    canSelectAudio: true,
    canSelectCustomFileExtension: true,
    customFileExtensionList: []
  }
} satisfies AppChatConfigType;
