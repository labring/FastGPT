import { UserError } from '@fastgpt/global/common/error/utils';
import {
  getWorkflowToolInputsFromStoreNodes,
  getWorkflowToolUnsupportedInputTypes
} from '@fastgpt/global/core/app/tool/workflowTool/utils';
import { MongoApp } from '../../schema';
import { getAppLatestVersion } from '../../version/controller';

const unsupportedInputMessage = '系统工具暂不支持关联包含文件、知识库、模型或外部动态输入的工作流';

/**
 * 校验工作流是否可以关联为系统工具。
 * 关联使用最新已发布版本；应用尚未发布时由 getAppLatestVersion 回退到应用当前草稿。
 * 内部变量由 JSON Schema 转换阶段过滤，因此不属于这里的禁止类型。
 */
export const validateSystemToolWorkflowAssociation = async (appId: string) => {
  const app = await MongoApp.findById(appId).lean();
  if (!app) {
    throw new UserError('Workflow app not found');
  }

  const { nodes } = await getAppLatestVersion(appId, app);
  const unsupportedInputTypes = getWorkflowToolUnsupportedInputTypes(
    getWorkflowToolInputsFromStoreNodes(nodes)
  );

  if (unsupportedInputTypes.length > 0) {
    throw new UserError(unsupportedInputMessage);
  }
};
