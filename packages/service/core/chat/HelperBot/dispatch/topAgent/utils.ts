import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getSystemToolsWithInstalled } from '../../../../app/tool/controller';

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
