import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type {
  StoreNodeItemType,
  FlowNodeTemplateType
} from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { isToolInputValueConfigured } from '@fastgpt/global/core/app/formEdit/utils';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';

/**
 * 应用画布前查询工具的当前密钥状态，仅为空配置默认选择系统密钥，不改写归档节点。
 * 同一次应用复用相同来源、版本和语言的工具查询；查询失败或没有系统密钥时保留待激活状态。
 */
export const prepareWorkflowBuilderToolSecrets = async ({
  nodes
}: {
  nodes: StoreNodeItemType[];
}): Promise<StoreNodeItemType[]> => {
  const previewRequests = new Map<string, Promise<FlowNodeTemplateType | undefined>>();

  return Promise.all(
    nodes.map(async (node) => {
      const input = node.inputs.find((input) => input.key === NodeInputKeyEnum.systemInputConfig);
      if (!input || isToolInputValueConfigured({ input })) return node;

      const systemTool = node.toolConfig?.systemTool ?? node.toolConfig?.systemToolSet;
      const appId = node.pluginId ?? systemTool?.toolId;
      if (!appId) return node;
      const query = {
        appId,
        source: node.source ?? systemTool?.source,
        versionId: node.version ?? '',
        lang: node.metadataLocale
      };
      const key = JSON.stringify(query);
      if (!previewRequests.has(key)) {
        previewRequests.set(
          key,
          getClientToolPreviewNode(query).catch(() => undefined)
        );
      }
      const preview = await previewRequests.get(key);
      if (!preview?.hasSystemSecret) return node;

      return {
        ...node,
        inputs: node.inputs.map((item) =>
          item === input
            ? {
                ...item,
                value: { type: SystemToolSecretInputTypeEnum.system }
              }
            : item
        )
      };
    })
  );
};

/** 合并导入流程归一化后的聊天配置，保留用户管理的应用名称与简介。 */
export const mergeWorkflowBuilderAppliedAppDetail = ({
  current,
  chatConfig
}: {
  current: AppDetailType;
  chatConfig: AppDetailType['chatConfig'];
}): AppDetailType => ({
  ...current,
  chatConfig
});
