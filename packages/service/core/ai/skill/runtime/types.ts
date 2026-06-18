// Info about a single SKILL.md entry available to the agent.
export type DeployedSkillInfo = {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  directory: string;
  skillMdPath: string;
};

export type DeployedSkillVersion = {
  versionId: string;
  targetDir: string;
  /** 本轮重新解压时，即使 HOME 已记录该 versionId 成功，也需要重跑 entrypoint。 */
  freshlyDeployed: boolean;
};
