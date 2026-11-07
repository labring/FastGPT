import type { WorkflowCheckIssue } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

export type THelperLine = {
  position: number;
  nodes: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }[];
};

/** 规则输出不携带节点展示信息；汇总边界统一补全节点与翻译文案。 */
export type WorkflowRuleIssue = Pick<WorkflowCheckIssue, 'code' | 'inputKey'> & {
  input?: FlowNodeInputItemType;
  fallbackLabel?: string;
  fieldLabel?: 'variable' | 'value' | 'dataset_quote' | 'question_guide' | 'tts';
  model?: string;
  messageCode?: WorkflowCheckIssueCodeEnum;
  message?: string;
  level?: WorkflowCheckIssue['level'];
};
