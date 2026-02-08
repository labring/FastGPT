import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getSystemToolsWithInstalled, getMyTools } from '../../../../app/tool/controller';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/topAgent/type';
import type { ExecutionPlanType, TopAgentGenerationAnswerType } from './type';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import { MongoDataset } from '../../../../dataset/schema';
import { MongoResourcePermission } from '../../../../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../../../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../../../support/permission/org/controllers';
import { getEmbeddingModel } from '../../../../ai/model';

const getAccessibleDatasets = async ({
  teamId,
  tmbId,
  isRoot
}: {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
}) => {
  if (isRoot) {
    return MongoDataset.find({
      teamId,
      deleteTime: null
    })
      .select('_id name intro avatar vectorModel')
      .sort({ updateTime: -1 })
      .lean();
  }

  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.dataset,
      teamId,
      resourceId: { $exists: true }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  const groupIdSet = new Set(myGroupMap.map((item) => String(item._id)));

  const datasetIds = roleList
    .filter(
      (item) =>
        String(item.tmbId) === String(tmbId) ||
        (item.groupId && groupIdSet.has(String(item.groupId))) ||
        (item.orgId && myOrgSet.has(String(item.orgId)))
    )
    .map((item) => String(item.resourceId));

  if (datasetIds.length === 0) return [];

  return MongoDataset.find({
    _id: { $in: Array.from(new Set(datasetIds)) },
    teamId,
    deleteTime: null
  })
    .select('_id name intro avatar vectorModel')
    .sort({ updateTime: -1 })
    .lean();
};

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
}): Promise<{
  resourceList: string;
}> => {
  const getPrompt = ({ tool, dataset }: { tool: string; dataset: string }) => {
    return `## 可用资源列表
### 工具
${tool}

### 知识库
${dataset}

### 系统功能
- **file_upload**: 文件上传功能 (enabled, purpose, file_types)
`;
  };

  const [systemTools, myTools, myDatasets] = await Promise.all([
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
    ),
    getAccessibleDatasets({ teamId, tmbId, isRoot })
  ]);

  const datasetLines = myDatasets.map((dataset) => {
    const id = String(dataset._id);
    const name = dataset.name || '未命名知识库';
    const intro = dataset.intro || '暂无描述';
    return `- **${id}** [知识库]: ${name} - ${intro}`;
  });

  const allTools = [...systemTools, ...myTools];
  const fileReadInfo = systemSubInfo[SubAppIds.fileRead];
  const fileReadTool = `- **${SubAppIds.fileRead}** [工具]: ${fileReadInfo.name} - ${fileReadInfo.toolDescription}`;
  allTools.push(fileReadTool);

  return {
    resourceList: getPrompt({
      tool: allTools.length > 0 ? allTools.join('\n') : '暂无已安装的工具',
      dataset: datasetLines.length > 0 ? datasetLines.join('\n') : '暂未配置知识库'
    })
  };
};

// 构建预设信息部分
export const buildMetadataInfo = (metadata?: TopAgentParamsType): string => {
  if (!metadata) return '';

  const sections: string[] = [];

  if (metadata.systemPrompt) {
    sections.push(`${metadata.systemPrompt}`);
  }
  if (metadata.selectedTools?.length) {
    sections.push(
      `**预设工具**: 搭建者已预先选择了以下工具 ID: ${metadata.selectedTools.join(', ')}`
    );
  }

  if (metadata.selectedDatasets?.length) {
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
搭建者已提供以下预设信息,这些信息具有**高优先级**,请在后续的信息收集和规划中优先参考:

${sections.join('\n')}

**重要提示**:
- 在规划阶段,优先使用预设知识库,但必须保证与任务语义相关
- 禁止把明显不相关的知识库纳入步骤（例如医疗知识库用于旅游规划）
- 若预设知识库不匹配任务,可从可访问知识库中选择更相关者
`;
};

export const getKnowledgeDatasetDetails = async ({
  teamId,
  tmbId,
  isRoot,
  datasetIds
}: {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
  datasetIds: string[];
}) => {
  if (!datasetIds.length) return [];

  const datasetIdSet = new Set(datasetIds);
  const accessible = await getAccessibleDatasets({ teamId, tmbId, isRoot });

  return accessible
    .filter((item) => datasetIdSet.has(String(item._id)))
    .map((item) => ({
      datasetId: String(item._id),
      name: item.name || '未命名知识库',
      avatar: item.avatar || '',
      vectorModel: {
        model: getEmbeddingModel(item.vectorModel).model
      }
    }));
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

      // 替换 description 中的资源引用：
      // - 工具: @工具ID -> {{@工具ID@}}
      // - 知识库: @知识库ID -> {{@dataset_search@}}
      if (step.expectedTools && step.expectedTools.length > 0) {
        step.expectedTools.forEach((resourceRef) => {
          const replaceId =
            resourceRef.type === 'knowledge' ? SubAppIds.datasetSearch : resourceRef.id;
          const regex = new RegExp(
            `@${resourceRef.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@?`,
            'g'
          );
          description = description.replace(regex, `{{@${replaceId}@}}`);
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
