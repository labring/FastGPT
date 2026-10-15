import {
  AppResourcesSchema,
  type AppResourcesType,
  type AppChatConfigType,
  type AppResource
} from '@fastgpt/global/core/app/type';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { formatModels } from '@fastgpt/global/common/workflow/model';
import type { ClientSession } from '../../../common/mongo';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import { assertAuthModels, getAuthorizedModelIds } from '../../../support/permission/model/auth';
import {
  filterAuthorizedAppResources,
  checkAppResourceReadPermissions
} from '../../../support/permission/app/resource';
import { MongoApp } from '../schema';
import { getAppDraftVersion, getAppLatestVersion } from '../version/controller';
import { decodeToolSetNodesFromStorage } from '../jsonSchemaStorage';
import {
  extractAppResources,
  hasAppResource,
  mergeAppResources,
  splitExtractedAppResources,
  resolveStoredAppResources
} from './utils';

/**
 * 读取应用草稿授权基线。合法快照直接沿用；非法数组按空基线处理，避免提升未授权引用。
 * 历史缺字段记录先提取资源，再按应用所有者权限过滤；事务重试会重新读取版本与所有者。
 */
export const getAppDraftResourceBaseline = async ({
  appId,
  session,
  isRoot = false,
  allowRootCrossTeam = false,
  modelHandle
}: {
  appId: string;
  session?: ClientSession;
  isRoot?: boolean;
  allowRootCrossTeam?: boolean;
  modelHandle?: ModelHandle;
}): Promise<AppResourcesType> => {
  const draft = await getAppDraftVersion(appId, session);
  if (!draft) return [];
  if (Array.isArray(draft.resources)) {
    const parsed = AppResourcesSchema.safeParse(draft.resources);
    return parsed.success ? mergeAppResources(parsed.data) : [];
  }

  const resources = resolveStoredAppResources({
    resources: draft.resources,
    nodes: decodeToolSetNodesFromStorage(draft.nodes),
    chatConfig: draft.chatConfig,
    resourceRefs: (draft as { resourceRefs?: unknown }).resourceRefs
  });
  if (resources.length === 0) return [];

  const app = await MongoApp.findById(appId, 'tmbId')
    .session(session ?? null)
    .lean();
  if (!app?.tmbId) return [];
  return filterAuthorizedAppResources({
    resources,
    tmbId: String(app.tmbId),
    isRoot,
    allowRootCrossTeam,
    modelHandle
  });
};

/**
 * 按当前应用草稿快照解析资源，并只校验相对快照新增的 ACL 资源。
 * 保存/自动保存不阻断无权限新增；发布和 Test/Debug 通过 blockOnUnauthorized 阻断。
 * 历史未迁移草稿（缺失 resources 字段）统一按所属应用的所有者 app.tmbId 过滤基线。
 */
export const resolveAppResourcesByPermission = async ({
  appId,
  extracted,
  tmbId,
  isRoot = false,
  blockOnUnauthorized,
  allowRootCrossTeam = false,
  modelHandle,
  session
}: {
  appId: string;
  extracted: AppResource[];
  tmbId: string;
  isRoot?: boolean;
  blockOnUnauthorized: boolean;
  allowRootCrossTeam?: boolean;
  /** 调用方已读取的团队模型目录；不传时按需读取。 */
  modelHandle?: ModelHandle;
  session?: ClientSession;
}) => {
  const baseline = await getAppDraftResourceBaseline({
    appId,
    session,
    isRoot,
    allowRootCrossTeam,
    modelHandle
  });
  const { kept, added } = splitExtractedAppResources({ extracted, baseline });
  if (added.length === 0) return mergeAppResources(kept);

  if (blockOnUnauthorized) {
    await checkAppResourceReadPermissions({
      resources: added,
      tmbId,
      isRoot,
      allowRootCrossTeam,
      modelHandle
    });
    return mergeAppResources([...kept, ...added]);
  }

  const authorizedAdded = await filterAuthorizedAppResources({
    resources: added,
    tmbId,
    isRoot,
    allowRootCrossTeam,
    modelHandle
  });
  return mergeAppResources([...kept, ...authorizedAdded]);
};

/**
 * 校验独立辅助调用点（如问题引导、TTS 音频生成）使用的模型资源。
 * - 目标为 App：与工作流资源同一条链路，先查应用快照，再按身份决定是否允许成员鉴权兜底。
 *   1. 命中当前正式 Version 快照直接放行（正式对话、外链、API Key 共用）；
 *   2. 未命中时，只有登录成员（authType=token，唯一能进入 Test/Debug 的身份）继续走调试链路：
 *      草稿快照基线内的模型放行，相对草稿新增的模型按成员 `use` 权限阻断校验，
 *      与 chatTest/debug 中知识库等资源的 `resolveAppResourcesByPermission` 规则一致；
 *   3. 外链 / API Key 只能使用正式版本，未命中直接拒绝。
 * - 非 App（skillEdit、chatAgentHelper）：只有登录成员能进入，直接按成员 `use` 权限校验。
 * 模型类型与启用状态由调用方的 `getModelData` 校验；调用方必须传入读取模型时使用的 handle，避免重复读取目录。
 */
export const authTargetModelResource = async ({
  targetType,
  targetId,
  modelId,
  teamId,
  tmbId,
  isRoot,
  authType,
  handle,
  resources
}: {
  targetType: ChatSourceTypeEnum;
  targetId?: string;
  modelId: string;
  teamId: string;
  tmbId: string;
  isRoot: boolean;
  /** 本次请求身份类型；只有 token 允许走草稿快照与成员鉴权兜底。 */
  authType?: `${AuthUserTypeEnum}`;
  handle: ModelHandle;
  /** App 正式版本资源快照；调用方已读取版本时传入，避免重复查询。 */
  resources?: AppResourcesType;
}) => {
  if (targetType === ChatSourceTypeEnum.app && targetId) {
    const modelResource: AppResource = { type: 'model', id: modelId };
    const published = resources ?? (await getAppLatestVersion(targetId)).resources;
    if (hasAppResource({ resources: published, resource: modelResource })) return;

    if (authType !== AuthUserTypeEnum.token) {
      throw new UserError(ModelErrEnum.unAuthModel);
    }
    await resolveAppResourcesByPermission({
      appId: targetId,
      extracted: [modelResource],
      tmbId,
      isRoot,
      blockOnUnauthorized: true,
      allowRootCrossTeam: isRoot,
      modelHandle: handle
    });
    return;
  }
  await assertAuthModels({
    actor: { teamId, tmbId, isRoot },
    modelIds: [modelId],
    action: 'use',
    handle
  });
};

/**
 * 为应用调试准备资源快照：规范化模型引用后，校验相对草稿基线新增的资源。
 * 1. 规范化工作流模型引用与字段（formatModels）；
 * 2. 静态提取工作流节点与配置声明的资源快照（extractAppResources）；
 * 返回通过校验的资源列表；运行上下文由调用方在 Workflow 入口创建。
 */
export const prepareAppWorkflowResources = async ({
  appId,
  nodes,
  chatConfig,
  teamId,
  tmbId,
  isRoot = false
}: {
  appId: string;
  nodes?: Array<StoreNodeItemType | RuntimeNodeItemType>;
  chatConfig?: AppChatConfigType;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
}) => {
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });
  formatModels({
    nodes: nodes as StoreNodeItemType[] | undefined,
    chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds),
    modelReferencePolicy: 'preserve'
  });
  const extractedResources = extractAppResources({
    nodes,
    chatConfig
  });
  return resolveAppResourcesByPermission({
    appId,
    extracted: extractedResources,
    tmbId,
    isRoot,
    blockOnUnauthorized: true,
    allowRootCrossTeam: isRoot,
    modelHandle
  });
};
