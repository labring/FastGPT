import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getSystemToolsWithInstalled } from '../../../../app/tool/controller';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/type';
export const generateResourceList = async ({
  teamId,
  isRoot,
  lang = 'zh-CN'
}: {
  teamId: string;
  isRoot: boolean;
  lang?: localeType;
}): Promise<string> => {
  const getPrompt = ({ tool }: { tool: string }) => {
    return `## 可用资源列表
### 工具
${tool}

### 知识库
暂未配置知识库

### 系统功能
- **file_upload**: 文件上传功能 (enabled, purpose, file_types)
`;
  };

  const tools = await getSystemToolsWithInstalled({
    teamId,
    isRoot
  });
  const installedTools = tools
    .filter((tool) => {
      return tool.installed && !tool.isFolder;
    })
    .map((tool) => {
      const toolId = tool.id;
      const name =
        typeof tool.name === 'string' ? tool.name : tool.name?.en || tool.name?.[lang] || '未命名';
      const intro =
        typeof tool.intro === 'string' ? tool.intro : tool.intro?.en || tool.intro?.[lang] || '';
      const description = tool.toolDescription || intro || '暂无描述';

      return `- **${toolId}** [工具]: ${name} - ${description}`;
    });

  return getPrompt({
    tool: installedTools.length > 0 ? installedTools.join('\n') : '暂无已安装的工具'
  });
};

// 构建预设信息部分
export const buildMetadataInfo = (metadata?: TopAgentParamsType): string => {
  if (!metadata) return '';

  const sections: string[] = [];

  if (metadata.role) {
    sections.push(`**预设角色**: ${metadata.role}`);
  }
  if (metadata.taskObject) {
    sections.push(`**预设任务目标**: ${metadata.taskObject}`);
  }
  if (metadata.selectedTools && metadata.selectedTools.length > 0) {
    sections.push(
      `**预设工具**: 搭建者已预先选择了以下工具 ID: ${metadata.selectedTools.join(', ')}`
    );
  }
  if (metadata.selectedDatasets && metadata.selectedDatasets.length > 0) {
    sections.push(
      `**预设知识库**: 搭建者已预先选择了以下知识库 ID: ${metadata.selectedDatasets.join(', ')}`
    );
  }
  if (metadata.fileUpload !== undefined && metadata.fileUpload !== null) {
    sections.push(
      `**文件上传**: ${metadata.fileUpload ? '搭建者已启用文件上传功能' : '搭建者已禁用文件上传功能'}`
    );
  }

  if (sections.length === 0) return '';

  return `
<preset_info>
搭建者已提供以下预设信息,这些信息具有**高优先级**,请在后续的信息收集和规划中优先参考:

${sections.join('\n')}

**重要提示**:
- 在信息收集阶段,如果预设信息已经提供了某个维度的答案,可以跳过相关问题或只做简单确认,快速完成信息收集
- 在规划阶段,**优先使用**预设的工具和知识库,但如果任务需要,你也可以添加其他合适的资源
- 预设的角色和任务目标应该作为规划的基础框架
- 如果预设信息与用户后续的描述存在冲突,以用户最新的明确表述为准
</preset_info>
`;
};
