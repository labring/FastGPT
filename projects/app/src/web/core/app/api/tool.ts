import { GET, POST } from '@/web/common/api/request';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { getMyApps } from '../api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type {
  GetPreviewNodeQuery,
  GetToolSetChildrenResponseType,
  GetSystemToolTemplatesBodyType,
  GetToolPathQueryType
} from '@fastgpt/global/openapi/core/app/tool/api';

/* ============ team plugin ============== */
/** parentType 来自已加载的列表项；普通目录和 Agent 查询直接走 list，不额外探测父资源。 */
export const getTeamAppTemplates = async (data?: {
  parentId?: ParentIdType;
  parentType?: AppTypeEnum;
  searchKey?: string;
  type?: AppTypeEnum[];
}) => {
  const { parentType, ...listQuery } = data ?? {};
  // 列表项已经提供 appType；普通目录和 Agent 不再请求接口探测父资源类型。
  if (
    data?.parentId &&
    (parentType === AppTypeEnum.mcpToolSet || parentType === AppTypeEnum.httpToolSet) &&
    (!data.type || data.type.includes(parentType))
  ) {
    const { type, tools } = await GET<GetToolSetChildrenResponseType>(
      '/core/app/tool/getToolSetChildren',
      {
        appId: data.parentId,
        searchKey: data.searchKey
      }
    );
    if (type === AppTypeEnum.mcpToolSet || type === AppTypeEnum.httpToolSet) {
      return tools.map((item) => ({
        ...item,
        intro: item.description || '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        appType: type,
        isTool: true,
        isFolder: false
      }));
    }
  }
  return getMyApps(data ? listQuery : undefined).then((res) =>
    res.map((app) => ({
      tmbId: app.tmbId,
      id: app._id,
      pluginId: app._id,
      isFolder:
        app.type === AppTypeEnum.folder ||
        app.type === AppTypeEnum.toolFolder ||
        app.type === AppTypeEnum.httpToolSet ||
        app.type === AppTypeEnum.httpPlugin ||
        app.type === AppTypeEnum.mcpToolSet,
      templateType: FlowNodeTemplateTypeEnum.teamApp,
      flowNodeType:
        app.type === AppTypeEnum.workflow
          ? FlowNodeTypeEnum.appModule
          : app.type === AppTypeEnum.mcpToolSet || app.type === AppTypeEnum.httpToolSet
            ? FlowNodeTypeEnum.toolSet
            : FlowNodeTypeEnum.pluginModule,
      avatar: app.avatar,
      name: app.name,
      intro: app.intro,
      showStatus: false,
      version: app.pluginData?.nodeVersion,
      isTool: true,
      sourceMember: app.sourceMember,
      appType: app.type
    }))
  );
};

/* ============ Tool ============== */
export const getAppToolTemplates = (data: GetSystemToolTemplatesBodyType) =>
  POST<NodeTemplateListItemType[]>('/core/app/tool/getSystemToolTemplates', data);

export const getAppToolPaths = (data: GetToolPathQueryType) => {
  if (!data.sourceId) return Promise.resolve<ParentTreePathItemType[]>([]);
  return GET<ParentTreePathItemType[]>('/core/app/tool/path', data);
};

export const getClientToolPreviewNode = (data: GetPreviewNodeQuery) =>
  GET<FlowNodeTemplateType>('/core/app/tool/getPreviewNode', data);
