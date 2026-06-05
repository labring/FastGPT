import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getAppType, getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { AppFormEditFormV1TypeSchema } from '@fastgpt/global/core/app/formEdit/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { form2AppWorkflow } from '@/pageComponents/app/detail/Edit/SimpleApp/utils';

export type JsonImportModalScene = 'agent' | 'tool';

type ImportWorkflowConfig = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};

type ParsedImportConfig = {
  workflow: ImportWorkflowConfig;
  appType: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.workflowTool;
};

const supportedImportAppTypes = [
  AppTypeEnum.simple,
  AppTypeEnum.workflow,
  AppTypeEnum.workflowTool
] as const;

const isSupportedImportAppType = (
  type: unknown
): type is (typeof supportedImportAppTypes)[number] =>
  supportedImportAppTypes.includes(type as (typeof supportedImportAppTypes)[number]);

/**
 * 归一化 simple 应用表单配置。
 *
 * 老版本导出的 simple JSON 可能缺少数组或默认字段，这里只补齐表单编辑器
 * 已有默认值并做 schema 校验，避免在转换 workflow 前因为历史字段缺失报错。
 */
export const normalizeSimpleImportForm = (config: Record<string, unknown>) => {
  const defaultForm = getDefaultAppForm();
  const form = {
    ...defaultForm,
    ...config,
    aiSettings: {
      ...defaultForm.aiSettings,
      ...((config.aiSettings as Record<string, unknown> | undefined) || {})
    },
    dataset: {
      ...defaultForm.dataset,
      ...((config.dataset as Record<string, unknown> | undefined) || {})
    },
    selectedTools: Array.isArray(config.selectedTools) ? config.selectedTools : [],
    selectedAgentSkills: Array.isArray(config.selectedAgentSkills)
      ? config.selectedAgentSkills
      : [],
    chatConfig: {
      ...defaultForm.chatConfig,
      ...((config.chatConfig as Record<string, unknown> | undefined) || {})
    }
  };

  return AppFormEditFormV1TypeSchema.safeParse(form);
};

export const resolveImportAppType = (config: Record<string, unknown>) => {
  const metaType = config.type;

  if (metaType !== undefined) {
    if (!isSupportedImportAppType(metaType)) {
      return '';
    }

    return metaType;
  }

  if ('nodes' in config && !Array.isArray(config.nodes)) {
    return '';
  }

  try {
    return getAppType(config as any);
  } catch {
    return '';
  }
};

/**
 * 解析工作台 JSON 导入配置。
 *
 * 顶层 `type` 存在时按导出元信息校验业务结构；无 `type` 时回退
 * 现有 `getAppType` 结构识别逻辑，以兼容老版本导出 JSON。
 */
export const parseDashboardImportConfig = ({
  config,
  t
}: {
  config: unknown;
  t: any;
}): ParsedImportConfig => {
  if (!config || typeof config !== 'object') {
    throw new Error(t('app:type_not_recognized'));
  }

  const workflowConfig = config as Record<string, unknown>;
  const appType = resolveImportAppType(config as Record<string, unknown>);

  if (!appType) {
    throw new Error(t('app:type_not_recognized'));
  }

  if (appType === AppTypeEnum.simple) {
    if (
      !workflowConfig.aiSettings ||
      typeof workflowConfig.aiSettings !== 'object' ||
      Array.isArray(workflowConfig.aiSettings)
    ) {
      throw new Error(t('app:type_not_recognized'));
    }

    const parsedForm = normalizeSimpleImportForm(workflowConfig);
    if (!parsedForm.success) {
      throw new Error(t('app:type_not_recognized'));
    }

    return {
      workflow: form2AppWorkflow(parsedForm.data as AppFormEditFormType, t),
      appType
    };
  }

  if (!Array.isArray(workflowConfig.nodes)) {
    throw new Error(t('app:type_not_recognized'));
  }

  const matchedStartNodeType = appType === AppTypeEnum.workflow ? 'workflowStart' : 'pluginInput';
  const hasMatchedStartNode = workflowConfig.nodes.some(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      (node as { flowNodeType?: unknown }).flowNodeType === matchedStartNodeType
  );

  if (!hasMatchedStartNode) {
    throw new Error(t('app:type_not_recognized'));
  }

  return {
    workflow: {
      nodes: workflowConfig.nodes as StoreNodeItemType[],
      edges: Array.isArray(workflowConfig.edges)
        ? (workflowConfig.edges as StoreEdgeItemType[])
        : [],
      chatConfig: (workflowConfig.chatConfig || {}) as AppChatConfigType
    },
    appType
  };
};

/**
 * 解析工作流详情内的 JSON 导入配置。
 *
 * 该入口只允许导入 workflow 配置。导出的 `name`、`intro` 等应用元信息
 * 只用于工作台新建应用，工作流内部导入时会忽略。
 */
export const parseWorkflowImportConfig = ({ config, t }: { config: unknown; t: any }) => {
  const { workflow, appType } = parseDashboardImportConfig({ config, t });

  if (appType !== AppTypeEnum.workflow) {
    throw new Error(t('app:type_not_recognized'));
  }

  return workflow;
};
