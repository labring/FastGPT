import type { SkillAgentParamsType } from '@fastgpt/global/core/chat/helperBot/type';

export const buildSkillAgentMetadataInfo = (metadata?: SkillAgentParamsType): string => {
  if (!metadata) return '';

  const sections: string[] = [];

  if (metadata.skillAgent) {
    const { name, description, prompt } = metadata.skillAgent;
    if (name || description || prompt) {
      sections.push('**Skill 配置** (当前 Skill 的专属配置):');
      if (name) sections.push(`- skill名称: ${name}`);
      if (description) sections.push(`- skill描述: ${description}`);
      if (prompt) sections.push(`-  详细的步骤信息: ${prompt}`);
      // TODO 已有步骤的加入
    }
  }

  if (metadata.topAgent) {
    const topAgentSections: string[] = [];
    const { role, taskObject, selectedTools, selectedDatasets, fileUpload } = metadata.topAgent;

    if (role) topAgentSections.push(`- 预设角色: ${role}`);
    if (taskObject) topAgentSections.push(`- 预设任务目标: ${taskObject}`);
    if (selectedTools && selectedTools.length > 0) {
      topAgentSections.push(`- 预设工具: ${selectedTools.join(', ')}`);
    }
    if (selectedDatasets && selectedDatasets.length > 0) {
      topAgentSections.push(`- 预设知识库: ${selectedDatasets.join(', ')}`);
    }
    if (fileUpload !== undefined && fileUpload !== null) {
      topAgentSections.push(`- 文件上传: ${fileUpload ? '已启用' : '已禁用'}`);
    }

    if (topAgentSections.length > 0) {
      sections.push('\n**Agent 的整体背景信息配置** :');
      sections.push(...topAgentSections);
    }
  }

  if (sections.length === 0) return '';

  return `
<preset_info>
搭建者已提供以下预设信息,这些信息具有**高优先级**,请在后续的信息收集和规划中优先参考:

${sections.join('\n')}

**重要提示**:
- **Skill 配置**优先级最高,如果已有 name、description、prompt,说明这是已配置的 skill,应基于这些信息执行任务
- **TopAgent 通用配置**提供了全局的角色、工具、知识库等配置,可以在 skill 执行中使用
- 在信息收集阶段,如果预设信息已经提供了某个维度的答案,可以跳过相关问题
- 在规划阶段,**优先使用**预设的工具和知识库
</preset_info>
`;
};
