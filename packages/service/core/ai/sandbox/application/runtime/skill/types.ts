import type { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';

/**
 * 沙盒业务层：声明运行态 Skill 扫描和部署结果类型。
 *
 * 只定义 sandbox 内 Skill 元数据，不访问数据库或 provider。
 */
export type DeployedSkillInfo = {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  directory: string;
  skillMdPath: string;
  appId?: string;
  appName?: string;
  appDescription?: string;
  appSource?: `${AgentSkillSourceEnum}`;
};

export type DeployedSkillVersion = {
  skillId?: string;
  name?: string;
  description?: string;
  avatar?: string;
  source?: `${AgentSkillSourceEnum}`;
  versionId: string;
  targetDir: string;
};
