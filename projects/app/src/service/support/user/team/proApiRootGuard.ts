import type { NextApiRequest } from 'next';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import {
  assertTargetMemberNotRoot,
  getForeignRootMemberInfo
} from '@fastgpt/service/support/user/team/controller';

const MAX_GUARDED_BODY_BYTES = 2 * 1024 * 1024;

type ForeignRootInfo = NonNullable<Awaited<ReturnType<typeof getForeignRootMemberInfo>>>;

const MUTATION_GUARD_ROUTES = new Set([
  'DELETE:support/user/team/member/delete',
  'PUT:support/user/team/member/updateNameByManager',
  'POST:support/user/team/member/restore',
  'POST:support/user/team/collaborator/update',
  'PUT:support/user/team/collaborator/updateOne',
  'DELETE:support/user/team/collaborator/delete',
  'PUT:support/user/team/changeOwner'
]);

const PRIVACY_FILTER_ROUTES = new Set([
  'POST:support/user/team/member/list',
  'GET:support/user/team/member/count',
  'GET:support/user/team/searchMembersOrgsGroups',
  'GET:support/user/team/collaborator/list'
]);

/** 规范化 `/api/proApi/[...path]` 的子路径片段，去除首尾斜杠以便精确匹配路由表。 */
export const normalizeProApiSubPath = (pathParam: unknown): string => {
  const segments = Array.isArray(pathParam)
    ? pathParam
    : typeof pathParam === 'string'
      ? [pathParam]
      : [];
  return segments
    .map((segment) => String(segment).trim())
    .filter(Boolean)
    .join('/');
};

/**
 * 读取需要前置校验或筛选参数感知的 JSON 请求体，同时返回原始字节供代理无损转发。
 * 若请求本身在测试或上游中间件中已被解析为对象，直接序列化恢复字节流。
 */
const readRequestBodyBuffer = async (
  req: NextApiRequest
): Promise<{ rawBody: Buffer; jsonBody: Record<string, any> | null }> => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const rawBody = Buffer.from(JSON.stringify(req.body), 'utf8');
    return { rawBody, jsonBody: req.body as Record<string, any> };
  }
  if (typeof req.body === 'string') {
    const rawBody = Buffer.from(req.body, 'utf8');
    try {
      return { rawBody, jsonBody: JSON.parse(req.body) };
    } catch {
      return { rawBody, jsonBody: null };
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return { rawBody: req.body, jsonBody: JSON.parse(req.body.toString('utf8')) };
    } catch {
      return { rawBody: req.body, jsonBody: null };
    }
  }

  if (typeof (req as any)?.[Symbol.asyncIterator] !== 'function') {
    return { rawBody: Buffer.alloc(0), jsonBody: null };
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_GUARDED_BODY_BYTES) {
      throw new Error('EntityTooLarge');
    }
    chunks.push(buf);
  }
  const rawBody = Buffer.concat(chunks);
  if (rawBody.length === 0) {
    return { rawBody, jsonBody: null };
  }

  try {
    return { rawBody, jsonBody: JSON.parse(rawBody.toString('utf8')) };
  } catch {
    return { rawBody, jsonBody: null };
  }
};

/**
 * 从非 root 视角过滤 Pro 团队成员相关只读响应中的 root 代管成员记录，保证列表、总数和搜索一致隐藏。
 */
export const filterProApiTeamReadPayload = ({
  subPath,
  payload,
  foreignRoot,
  requestBody
}: {
  subPath: string;
  payload: any;
  foreignRoot: ForeignRootInfo;
  requestBody?: Record<string, any> | null;
}): any => {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    return payload;
  }

  const isRootItem = (item: any) =>
    Boolean(
      item &&
      (String(item.userId) === foreignRoot.rootUserId ||
        (foreignRoot.rootTmbId && String(item.tmbId) === foreignRoot.rootTmbId))
    );

  // 1. 团队成员分页列表：移除 root 条目，并同步修正分页总数。
  if (subPath === 'support/user/team/member/list' && Array.isArray(payload.data.list)) {
    const originalList = payload.data.list;
    const nextList = originalList.filter((item: any) => !isRootItem(item));
    const removedCount = originalList.length - nextList.length;

    const shouldDecrementTotalFromOtherPage = (() => {
      if (removedCount > 0 || !foreignRoot.rootTmbId) return false;
      const hasNarrowFilter = Boolean(
        requestBody?.searchKey ||
        requestBody?.groupId ||
        requestBody?.orgId !== undefined ||
        Array.isArray(requestBody?.tmbIds)
      );
      if (hasNarrowFilter) return false;
      if (requestBody?.status && requestBody.status !== foreignRoot.rootStatus) return false;
      return true;
    })();

    const delta = removedCount > 0 ? removedCount : shouldDecrementTotalFromOtherPage ? 1 : 0;
    return {
      ...payload,
      data: {
        ...payload.data,
        list: nextList,
        ...(typeof payload.data.total === 'number'
          ? { total: Math.max(0, payload.data.total - delta) }
          : {})
      }
    };
  }

  // 2. 团队有效成员计数：排除活跃态的外来 root 代管记录。
  if (subPath === 'support/user/team/member/count' && typeof payload.data.count === 'number') {
    const isCountedStatus =
      Boolean(foreignRoot.rootTmbId) &&
      foreignRoot.rootStatus !== TeamMemberStatusEnum.leave &&
      foreignRoot.rootStatus !== TeamMemberStatusEnum.forbidden;
    if (!isCountedStatus) return payload;
    return {
      ...payload,
      data: {
        ...payload.data,
        count: Math.max(0, payload.data.count - 1)
      }
    };
  }

  // 3. 成员/组织/成员组聚合检索：隐藏 members 中的 root 条目。
  if (
    subPath === 'support/user/team/searchMembersOrgsGroups' &&
    Array.isArray(payload.data.members)
  ) {
    return {
      ...payload,
      data: {
        ...payload.data,
        members: payload.data.members.filter((item: any) => !isRootItem(item))
      }
    };
  }

  // 4. 团队协作者权限列表：隐藏 clbs 中的 root 条目。
  if (subPath === 'support/user/team/collaborator/list' && Array.isArray(payload.data.clbs)) {
    return {
      ...payload,
      data: {
        ...payload.data,
        clbs: payload.data.clbs.filter((item: any) => !isRootItem(item))
      }
    };
  }

  return payload;
};

export type ProApiRootGuardPlan =
  | {
      kind: 'passthrough';
    }
  | {
      kind: 'guarded';
      rawBody?: Buffer;
      transformJsonResponse?: (responseText: string) => string;
    };

/**
 * 在 `/api/proApi` 代理边界执行系统 root 成员的防篡改拦截与非 root 视角隐私过滤。
 *
 * - 未命中成员/协作者敏感路由，或当前请求者本身为系统 root 时，直接返回 `passthrough`，不消费请求流。
 * - 命中写路由且目标成员包含系统 root 时，在转发前直接抛出 `TeamErrEnum.unPermission`（HTTP 403）。
 * - 命中只读路由且当前团队不属于 root 时，返回响应转换函数以剥离 root 成员记录。
 */
export const prepareProApiRootGuard = async ({
  req,
  subPath
}: {
  req: NextApiRequest;
  subPath: string;
}): Promise<ProApiRootGuardPlan> => {
  const method = (req.method || 'GET').toUpperCase();
  const routeKey = `${method}:${subPath}`;
  const isMutationRoute = MUTATION_GUARD_ROUTES.has(routeKey);
  const isPrivacyRoute = PRIVACY_FILTER_ROUTES.has(routeKey);

  if (!isMutationRoute && !isPrivacyRoute) {
    return { kind: 'passthrough' };
  }

  // 1. 解析当前请求者身份；未认证请求保持原样交给下游鉴权，root 本人拥有完整视野与操作权。
  const auth = await parseHeaderCert({
    req,
    authToken: true,
    authApiKey: true,
    allowAccountCancellation: true
  }).catch(() => null);

  if (!auth || auth.isRoot) {
    return { kind: 'passthrough' };
  }

  const hasBody = method !== 'GET' && method !== 'HEAD';
  const { rawBody, jsonBody } = hasBody
    ? await readRequestBodyBuffer(req)
    : { rawBody: undefined, jsonBody: null };

  // 2. 写操作前置防篡改校验：禁止任何租户成员（含原团队 Owner）修改、移除或向 root 转让所有权。
  if (isMutationRoute) {
    const queryTmbId = typeof req.query.tmbId === 'string' ? req.query.tmbId : undefined;
    const bodyTmbId = typeof jsonBody?.tmbId === 'string' ? jsonBody.tmbId : undefined;
    const collaboratorTmbIds = Array.isArray(jsonBody?.collaborators)
      ? jsonBody.collaborators
          .map((item: any) => (typeof item?.tmbId === 'string' ? item.tmbId : undefined))
          .filter((id): id is string => Boolean(id))
      : [];
    const bodyUserId = typeof jsonBody?.userId === 'string' ? jsonBody.userId : undefined;

    await assertTargetMemberNotRoot({
      tmbIds: [queryTmbId, bodyTmbId, ...collaboratorTmbIds].filter((id): id is string =>
        Boolean(id)
      ),
      userIds: bodyUserId ? [bodyUserId] : []
    });

    return { kind: 'guarded', rawBody };
  }

  // 3. 只读操作后置隐私过滤：当该团队并非 root 自有团队时隐藏 root 成员记录。
  const foreignRoot = await getForeignRootMemberInfo(auth.teamId);
  if (!foreignRoot) {
    return { kind: 'guarded', rawBody };
  }

  return {
    kind: 'guarded',
    rawBody,
    transformJsonResponse: (responseText: string) => {
      try {
        const parsed = JSON.parse(responseText);
        const filtered = filterProApiTeamReadPayload({
          subPath,
          payload: parsed,
          foreignRoot,
          requestBody: jsonBody
        });
        return JSON.stringify(filtered);
      } catch {
        return responseText;
      }
    }
  };
};

export const isRootMemberForbiddenError = (error: unknown): boolean =>
  error === TeamErrEnum.unPermission;
