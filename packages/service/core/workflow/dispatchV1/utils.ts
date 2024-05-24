// @ts-nocheck
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index';
export const DYNAMIC_INPUT_KEY = 'DYNAMIC_INPUT_KEY';

export const setEntryEntries = (modules: StoreNodeItemType[]) => {
  const initRunningModuleType: Record<string, boolean> = {
    questionInput: true,
    [FlowNodeTypeEnum.pluginInput]: true
  };

  modules.forEach((item) => {
    if (initRunningModuleType[item.flowType]) {
      item.isEntry = true;
    }
  });
  return modules;
};

export const checkTheModuleConnectedByTool = (
  modules: FlowNodeItemType[],
  module: FlowNodeItemType
) => {
  let sign = false;
  const toolModules = modules.filter((item) => item.flowType === FlowNodeTypeEnum.tools);

  toolModules.forEach((item) => {
    const toolOutput = item.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.selectedTools
    );
    toolOutput?.targets.forEach((target) => {
      if (target.moduleId === module.moduleId) {
        sign = true;
      }
    });
  });

  return sign;
};

export const getHistories = (history?: ChatItemType[] | number, histories: ChatItemType[] = []) => {
  if (!history) return [];
  if (typeof history === 'number') return histories.slice(-history);
  if (Array.isArray(history)) return history;

  return [];
};

/* value type format */
export const valueTypeFormat = (value: any, type?: `${WorkflowIOValueTypeEnum}`) => {
  if (value === undefined) return;

  if (type === 'string') {
    if (typeof value !== 'object') return String(value);
    return JSON.stringify(value);
  }
  if (type === 'number') return Number(value);
  if (type === 'boolean') return Boolean(value);

  return value;
};
