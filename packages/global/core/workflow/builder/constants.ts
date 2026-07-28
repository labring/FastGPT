import type { AppChatConfigType } from '../../app/type';

/**
 * Workflow Builder 的独立对话配置。
 *
 * Builder 可以通过 WorkflowDocument 读取和修改原工作流的 chatConfig，
 * 但其自身对话不得继承这些运行前置配置。
 */
export const WORKFLOW_BUILDER_CHAT_CONFIG = {
  fileSelectConfig: {
    maxFiles: 0,
    canSelectFile: false,
    canSelectImg: false,
    customPdfParse: false,
    canSelectVideo: false,
    canSelectAudio: false,
    canSelectCustomFileExtension: false,
    customFileExtensionList: []
  }
} satisfies AppChatConfigType;
