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

type SupportedImportAppType = ParsedImportConfig['appType'];

type ParseAppImportConfigOptions = {
  config: unknown;
  t: any;
  resolveScene?: JsonImportModalScene;
  allowedAppTypes?: readonly SupportedImportAppType[];
  expectedAppType?: SupportedImportAppType;
};

const supportedImportAppTypes = [
  AppTypeEnum.simple,
  AppTypeEnum.workflow,
  AppTypeEnum.workflowTool
] as const;

const dashboardImportAppTypesByScene: Record<
  JsonImportModalScene,
  readonly SupportedImportAppType[]
> = {
  agent: [AppTypeEnum.simple, AppTypeEnum.workflow],
  tool: [AppTypeEnum.workflowTool]
};

const isSupportedImportAppType = (
  type: unknown
): type is (typeof supportedImportAppTypes)[number] =>
  supportedImportAppTypes.includes(type as (typeof supportedImportAppTypes)[number]);

const importAppTypeAliasMap: Record<string, SupportedImportAppType> = {
  workflowTool: AppTypeEnum.workflowTool
};

const normalizeImportAppType = (type: unknown): SupportedImportAppType | '' => {
  if (isSupportedImportAppType(type)) return type;
  if (typeof type === 'string') return importAppTypeAliasMap[type] || '';
  return '';
};

export const isDashboardImportAppTypeAllowed = ({
  appType,
  scene
}: {
  appType: SupportedImportAppType;
  scene: JsonImportModalScene;
}) => dashboardImportAppTypesByScene[scene].includes(appType);

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

const assertImportConfigObject = (config: unknown, t: any): Record<string, unknown> => {
  if (!config || typeof config !== 'object') {
    throw new Error(t('app:type_not_recognized'));
  }

  return config as Record<string, unknown>;
};

export const resolveImportAppType = (
  config: Record<string, unknown>,
  scene?: JsonImportModalScene
) => {
  const metaType = config.type;

  if (metaType !== undefined) {
    const appType = normalizeImportAppType(metaType);
    if (!appType) {
      return '';
    }

    return appType;
  }

  if ('nodes' in config && !Array.isArray(config.nodes)) {
    return '';
  }

  if (Array.isArray(config.nodes)) {
    const hasPluginInputNode = config.nodes.some(
      (node) =>
        !!node &&
        typeof node === 'object' &&
        (node as { flowNodeType?: unknown }).flowNodeType === 'pluginInput'
    );
    const hasWorkflowStartNode = config.nodes.some(
      (node) =>
        !!node &&
        typeof node === 'object' &&
        (node as { flowNodeType?: unknown }).flowNodeType === 'workflowStart'
    );

    if (scene === 'tool' && hasPluginInputNode) return AppTypeEnum.workflowTool;
    if (scene === 'agent' && hasWorkflowStartNode) return AppTypeEnum.workflow;
  }

  try {
    return getAppType(config as any);
  } catch {
    return '';
  }
};

const assertImportAppTypeAllowed = ({
  appType,
  allowedAppTypes,
  expectedAppType,
  t
}: {
  appType: SupportedImportAppType;
  allowedAppTypes?: readonly SupportedImportAppType[];
  expectedAppType?: SupportedImportAppType;
  t: any;
}) => {
  if (expectedAppType && appType !== expectedAppType) {
    throw new Error(t('app:type_not_recognized'));
  }

  if (allowedAppTypes && !allowedAppTypes.includes(appType)) {
    throw new Error(t('app:type_not_recognized'));
  }
};

const parseSimpleImportWorkflow = ({
  config,
  t
}: {
  config: Record<string, unknown>;
  t: any;
}): ImportWorkflowConfig => {
  if (
    !config.aiSettings ||
    typeof config.aiSettings !== 'object' ||
    Array.isArray(config.aiSettings)
  ) {
    throw new Error(t('app:type_not_recognized'));
  }

  const parsedForm = normalizeSimpleImportForm(config);
  if (!parsedForm.success) {
    throw new Error(t('app:type_not_recognized'));
  }

  return form2AppWorkflow(parsedForm.data as AppFormEditFormType, t);
};

const parseWorkflowLikeImportConfig = ({
  config,
  appType,
  t
}: {
  config: Record<string, unknown>;
  appType: Exclude<SupportedImportAppType, AppTypeEnum.simple>;
  t: any;
}): ImportWorkflowConfig => {
  if (!Array.isArray(config.nodes)) {
    throw new Error(t('app:type_not_recognized'));
  }

  const matchedStartNodeType = appType === AppTypeEnum.workflow ? 'workflowStart' : 'pluginInput';
  const hasMatchedStartNode = config.nodes.some(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      (node as { flowNodeType?: unknown }).flowNodeType === matchedStartNodeType
  );

  if (!hasMatchedStartNode) {
    throw new Error(t('app:type_not_recognized'));
  }

  return {
    nodes: config.nodes as StoreNodeItemType[],
    edges: Array.isArray(config.edges) ? (config.edges as StoreEdgeItemType[]) : [],
    chatConfig: (config.chatConfig || {}) as AppChatConfigType
  };
};

/**
 * 统一解析导入 JSON。
 *
 * 这个入口只处理通用导入流程：识别导入类型、应用调用方约束、按类型解析为
 * workflow 数据。工作台导入和详情页导入只负责传入不同约束，避免把场景规则
 * 和结构解析散落在多个入口里。
 */
export const parseAppImportConfig = ({
  config,
  t,
  resolveScene,
  allowedAppTypes,
  expectedAppType
}: ParseAppImportConfigOptions): ParsedImportConfig => {
  const importConfig = assertImportConfigObject(config, t);
  const appType = resolveImportAppType(importConfig, resolveScene);

  if (!appType) {
    throw new Error(t('app:type_not_recognized'));
  }

  assertImportAppTypeAllowed({ appType, allowedAppTypes, expectedAppType, t });

  return {
    workflow:
      appType === AppTypeEnum.simple
        ? parseSimpleImportWorkflow({ config: importConfig, t })
        : parseWorkflowLikeImportConfig({ config: importConfig, appType, t }),
    appType
  };
};

/**
 * 解析工作台 JSON 导入配置。
 *
 * 顶层 `type` 存在时按导出元信息校验业务结构；无 `type` 时回退
 * 现有 `getAppType` 结构识别逻辑，以兼容老版本导出 JSON。
 */
export const parseDashboardImportConfig = ({
  config,
  scene,
  t
}: {
  config: unknown;
  scene: JsonImportModalScene;
  t: any;
}): ParsedImportConfig => {
  return parseAppImportConfig({
    config,
    t,
    resolveScene: scene,
    allowedAppTypes: dashboardImportAppTypesByScene[scene]
  });
};

/**
 * 解析应用详情内的 JSON 导入配置。
 *
 * 详情页导入只允许覆盖当前应用同类型的编排配置，避免普通工作流与插件工作流
 * 互相导入后缺少各自的入口节点。导出的 `name`、`intro` 等应用元信息只用于
 * 工作台新建应用，详情内导入时会忽略。
 */
export const parseWorkflowImportConfig = ({
  config,
  appType: expectedAppType = AppTypeEnum.workflow,
  t
}: {
  config: unknown;
  appType?: AppTypeEnum.workflow | AppTypeEnum.workflowTool;
  t: any;
}) => {
  const scene: JsonImportModalScene =
    expectedAppType === AppTypeEnum.workflowTool ? 'tool' : 'agent';
  const { workflow } = parseAppImportConfig({
    config,
    t,
    resolveScene: scene,
    expectedAppType
  });

  return workflow;
};
