import { ModelScopeEnum } from '../constants';

/**
 * 统一判定模型是否为系统全局模型。
 * 兼容未配置 scope 的旧模型及显式标记 isSystem 的场景。
 */
export const isSystemModel = (model?: {
  scope?: string | ModelScopeEnum;
  isSystem?: boolean;
  tmbId?: unknown;
}): boolean => {
  if (!model) return true;
  if (model.isSystem !== undefined) return Boolean(model.isSystem);
  if (model.scope !== undefined) return model.scope === ModelScopeEnum.system;
  return !model.tmbId;
};

/**
 * 统一判定模型是否为团队成员私有模型。
 */
export const isTeamModel = (model?: {
  scope?: string | ModelScopeEnum;
  isSystem?: boolean;
  tmbId?: unknown;
}): boolean => {
  return !isSystemModel(model);
};

/**
 * 统一安全获取模型拥有者的 tmbId 字符串。
 */
export const getModelOwnerTmbId = (model?: { tmbId?: unknown }): string | undefined => {
  return model?.tmbId ? String(model.tmbId) : undefined;
};
