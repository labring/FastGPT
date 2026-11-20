/**
 * 沙盒业务层：声明运行态 Skill 扫描和部署结果类型。
 *
 * 只定义 sandbox 内 Skill 元数据，不访问数据库或 provider。
 */
import type { SkillEntryContractType } from '@fastgpt/global/core/ai/skill/type';

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
};

export type DeployedSkillVersion = {
  skillId?: string;
  name?: string;
  description?: string;
  avatar?: string;
  versionId: string;
  targetDir: string;
  /**
   * 已发布版本元数据声明的入口（包内相对路径）。
   *
   * 仅当版本带有 `skillEntryContract === 'explicit-v1'` 且该数组非空时，运行态才把它
   * 当作完整入口清单严格过滤；旧版本/导入版本（契约字段缺失）回退到基点行为：
   * 递归扫描该版本目录，不按入口清单过滤。
   */
  skillMdPaths?: string[];
  /**
   * 发布该版本时使用的入口清单契约；缺失表示旧版本/导入版本。
   */
  skillEntryContract?: SkillEntryContractType;
};
