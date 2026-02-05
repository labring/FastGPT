import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getSystemToolsWithInstalled, getMyTools } from '../../../../app/tool/controller';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/topAgent/type';
import type { ExecutionPlanType, TopAgentGenerationAnswerType } from './type';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';

export const generateResourceList = async ({
  teamId,
  tmbId,
  isRoot,
  lang = 'zh-CN'
}: {
  teamId: string;
  tmbId: string;
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

  // TODO: 知识库加进去
  const [systemTools, myTools] = await Promise.all([
    getSystemToolsWithInstalled({
      teamId,
      isRoot
    }).then((res) =>
      res
        .filter((tool) => {
          return tool.installed && !tool.parentId;
        })
        .map((tool) => {
          const toolId = tool.id;
          const name =
            typeof tool.name === 'string'
              ? tool.name
              : tool.name?.en || tool.name?.[lang] || '未命名';
          const intro =
            typeof tool.intro === 'string'
              ? tool.intro
              : tool.intro?.en || tool.intro?.[lang] || '';
          const description = tool.toolDescription || intro || '暂无描述';

          return `- **${toolId}** [工具]: ${name} - ${description}`;
        })
    ),
    getMyTools({ teamId, tmbId }).then((res) =>
      res.map((tool) => {
        const toolId = tool._id;
        return `- **${toolId}** [工具]: ${tool.name} - ${tool.intro}`;
      })
    )
  ]);
  // console.log('systemTools tools ', systemTools);
  // console.log('my tools ', myTools);
  const allTools = [...systemTools, ...myTools];
  // 添加文件读取工具
  const fileReadInfo = systemSubInfo[SubAppIds.fileRead];
  const fileReadTool = `- **${SubAppIds.fileRead}** [工具]: ${fileReadInfo.name} - ${fileReadInfo.toolDescription}`;
  allTools.push(fileReadTool);

  return getPrompt({
    tool: allTools.length > 0 ? allTools.join('\n') : '暂无已安装的工具'
  });
};

// 构建预设信息部分
export const buildMetadataInfo = (metadata?: TopAgentParamsType): string => {
  if (!metadata) return '';

  const sections: string[] = [];

  // if (metadata.role) {
  //   sections.push(`**预设角色**: ${metadata.role}`);
  // }
  // if (metadata.taskObject) {
  //   sections.push(`**预设任务目标**: ${metadata.taskObject}`);
  // }
  if (metadata.systemPrompt) {
    sections.push(`${metadata.systemPrompt}`);
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

/**
 * 从 execution_plan 中提取并去重所有使用的资源
 */
export const extractResourcesFromPlan = (executionPlan?: ExecutionPlanType) => {
  if (!executionPlan) {
    return { tools: [], knowledges: [] };
  }

  const toolSet = new Set<string>();
  const knowledgeSet = new Set<string>();

  executionPlan.steps.forEach((step) => {
    step.expectedTools?.forEach((resourceRef) => {
      if (resourceRef.type === 'tool') {
        toolSet.add(resourceRef.id);
      } else if (resourceRef.type === 'knowledge') {
        knowledgeSet.add(resourceRef.id);
      }
    });
  });

  return {
    tools: Array.from(toolSet),
    knowledges: Array.from(knowledgeSet)
  };
};

/**
 * 构建包含所有信息的 system prompt 文本
 * 使用 {{@toolId@}} 格式引用工具，可被 parseSystemPrompt 解析
 */
export const buildSystemPrompt = (data: TopAgentGenerationAnswerType): string => {
  const parts: string[] = [];

  // 1. 任务分析
  if (data.task_analysis) {
    const { goal, role, key_features } = data.task_analysis;
    parts.push(`---\n**任务目标**\n${goal}\n`);
    parts.push(`**角色定位**\n${role}\n`);
    if (key_features) {
      parts.push(`**核心特征**\n${key_features}\n`);
    }
  }

  // 2. 执行计划
  if (data.execution_plan) {
    parts.push(`---\n**参考计划**`);
    data.execution_plan.steps.forEach((step, index) => {
      let description = step.description;

      // 替换 description 中的工具引用：@工具名 -> {{@工具ID@}}
      if (step.expectedTools && step.expectedTools.length > 0) {
        step.expectedTools.forEach((tool) => {
          // 匹配 @工具名 或 @工具名@ 格式，替换为 {{@工具ID@}}
          const regex = new RegExp(`@${tool.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@?`, 'g');
          description = description.replace(regex, `{{@${tool.id}@}}`);
        });
      }

      parts.push(`\n步骤 ${index + 1}. ${step.title} \n${description}`);
      // if (step.expectedTools && step.expectedTools.length > 0) {
      //   const toolList = step.expectedTools
      //     .map((t) => {
      //       const ref = `{{@${t.id}@}}`;
      //       return `${ref}`;
      //     })
      //     .join('、');
      //   parts.push(`预期资源: ${toolList}`);
      // }
    });
    parts.push('');
  }

  // 3. 系统功能
  // if (data.resources?.system_features?.file_upload?.enabled) {
  //   parts.push(`---\n**系统功能**\n`);
  //   parts.push(
  //     `**文件上传**: 已启用\n${data.resources.system_features.file_upload.purpose}`
  //   );
  // }

  return parts.join('\n');
};

/**
 * 构建用于显示的文本（与 system prompt 格式一致）
 */
export const buildDisplayText = (data: TopAgentGenerationAnswerType): string => {
  return buildSystemPrompt(data);
};
