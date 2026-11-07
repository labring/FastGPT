import type { ModelTypeEnum } from '../../ai/constants';
export type WorkflowModelFeature =
  | 'query_extension'
  | 'question_guide'
  | 'rerank'
  | 'tts'
  | 'node_model';

export type WorkflowModelValidationIssue = {
  code: 'model_unavailable' | 'model_required';
  feature: WorkflowModelFeature;
  modelRef?: string;
};

/** 校验已引用模型的最小状态；旧名称仅在确认是系统模型时提供。 */
export type WorkflowModelReferenceStatus = {
  modelId: string;
  type: ModelTypeEnum;
  legacyModel?: string;
};

/** 引用可用性与空槽位默认值分别提供，应用授权摘要不会进入默认候选。 */
export type WorkflowModelCheckData = {
  references: WorkflowModelReferenceStatus[];
  defaultModelIds: Partial<Record<ModelTypeEnum, string>>;
};
