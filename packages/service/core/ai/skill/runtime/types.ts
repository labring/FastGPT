// Info about a single SKILL.md entry available to the agent.
export type DeployedSkillInfo = {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  directory: string;
  skillMdPath: string;
};
