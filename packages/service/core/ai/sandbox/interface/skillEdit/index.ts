/**
 * 沙盒接口层：提供 Skill Edit 运行态沙盒业务入口。
 *
 * 本文件收口编辑沙盒状态、初始化、升级、打包和保存发布能力；外部 Skill 业务
 * 不应直接访问 sandbox provider、repository 或 archive 原子能力。
 */
export {
  getSkillEditRuntimeContext,
  getSkillEditRuntimeStatus,
  initSkillEditRuntimeSandbox,
  triggerSkillEditRuntimeUpgrade,
  getRunningSkillEditSandbox,
  packageSkillEditWorkspace,
  SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR
} from '../../application/skillEdit/runtime';
export type {
  InitSkillEditRuntimeSandboxParams,
  SkillEditRuntimeContext
} from '../../application/skillEdit/runtime';
export { saveDeploySkillFromSandbox } from '../../application/skillEdit/deploy';
export type { SaveDeploySkillFromSandboxParams } from '../../application/skillEdit/deploy';
export { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from '../../../skill/edit/config';
