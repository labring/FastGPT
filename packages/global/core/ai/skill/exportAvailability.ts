/**
 * Skill 详情页导出菜单的可用性判断。
 *
 * 编辑沙盒的初始化和状态查询都要求写权限；只读协作者的本地 sandboxState 可能因鉴权失败
 * 停留在 failed。导出接口本身按读权限放行并在服务端准备沙盒，因此不能把只读协作者的
 * 导出入口绑定到编辑沙盒的就绪状态。
 */
export type SkillExportSandboxState =
  'idle' | 'loading' | 'ready' | 'failed' | 'upgradeRequired' | 'upgrading';

export const isSkillExportDisabled = ({
  hasWritePer,
  sandboxState
}: {
  hasWritePer?: boolean;
  sandboxState: SkillExportSandboxState;
}) => !!hasWritePer && sandboxState !== 'ready';
