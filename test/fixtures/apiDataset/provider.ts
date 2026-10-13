import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { createRemoteNode, createRemoteTree, type RemoteNode } from './tree';

export const providerNames = ['custom', 'yuque', 'feishu', 'dingtalk'] as const;
export type ProviderName = (typeof providerNames)[number];

/** 只依赖 transport 消费的字段，可直接接受 Axios adapter 传入的请求。 */
type ProviderRequest = {
  url?: string;
  baseURL?: string;
  method?: string;
  params?: Record<string, string | undefined>;
  data?: string | Record<string, any>;
  headers: { get: (name: string) => unknown };
};

/**
 * 模拟平台原始 HTTP 协议，生产适配器仍负责鉴权、分页、过滤及节点标准化。
 * 远端状态可在同步轮次间修改；未知请求直接报错，防止集成测试静默回退到真实外网。
 */
export const createProviderFixture = ({
  provider,
  nodes: initialNodes,
  rootKey = 'root',
  pageSize = 2
}: {
  provider: ProviderName;
  nodes: readonly RemoteNode[];
  rootKey?: string;
  pageSize?: number;
}) => {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0)
    throw new Error('Provider page size must be a positive safe integer');
  const serials = new Map<string, number>();
  const serial = (key: string) => {
    if (!serials.has(key)) serials.set(key, 101 + serials.size);
    return serials.get(key)!;
  };
  const id = (key: string): string =>
    provider === 'yuque'
      ? key === rootKey
        ? '100'
        : `100-${serial(key)}-uuid-${key}`
      : `${provider}-${encodeURIComponent(key)}`;
  const supportsDocumentChildren = provider !== 'feishu';
  const config: ApiDatasetServerType = (() => {
    if (provider === 'custom')
      return {
        apiServer: {
          baseUrl: 'https://fixture.test',
          authorization: 'fixture-token',
          basePath: id(rootKey)
        }
      };
    if (provider === 'yuque')
      return { yuqueServer: { userId: 'fixture-user', token: 'fixture-token', basePath: '100' } };
    if (provider === 'feishu')
      return {
        feishuServer: {
          appId: 'fixture-app',
          appSecret: 'fixture-secret',
          folderToken: id(rootKey)
        }
      };
    return {
      dingtalkServer: {
        appKey: 'fixture-app',
        appSecret: 'fixture-secret',
        userId: 'fixture-user',
        rootNodeId: id(rootKey)
      }
    };
  })();
  // 平台 ID 映射与树索引随拓扑快照一起更新，避免每次分页请求遍历整棵树。
  const indexNodes = (nodes: readonly RemoteNode[]) => {
    const tree = createRemoteTree(nodes);
    return { ...tree, byId: new Map(tree.nodes.map((item) => [id(item.key), item])) };
  };
  let tree = indexNodes(initialNodes);
  const calls: { kind: 'list' | 'detail' | 'content' | 'auth'; key: string; page?: string }[] = [];
  let fault:
    | { kind: 'list' | 'detail' | 'content'; key?: string; status: number; remaining?: number }
    | undefined;
  let onContent: ((key: string) => Promise<void>) | undefined;
  const date = new Date('2026-01-01T00:00:00Z');
  const byId = (apiFileId: string) => tree.byId.get(apiFileId);
  const children = (key: string) => tree.children.get(key) ?? [];
  const hasChild = (key: string) => children(key).length > 0;
  const normalized = (item: RemoteNode) => ({
    id: id(item.key),
    name: item.name,
    parentId: item.parent ? id(item.parent) : null,
    type: item.type,
    hasChild: item.type === 'folder' || hasChild(item.key),
    createTime: date,
    updateTime: date
  });
  const dingNode = (item: RemoteNode) => ({
    nodeId: id(item.key),
    parentNodeId: item.parent ? id(item.parent) : undefined,
    title: item.name,
    nodeType: item.type === 'folder' ? 'folder' : item.type === 'file' ? 'wiki_doc' : 'image',
    hasChildren: hasChild(item.key),
    createdAt: date.toISOString(),
    updatedAt: date.toISOString()
  });

  const respond = async (request: ProviderRequest) => {
    const url = new URL(request.url ?? '', request.baseURL ?? 'https://fixture.test');
    const path = url.pathname;
    const params = request.params ?? {};
    const body = typeof request.data === 'string' ? JSON.parse(request.data) : (request.data ?? {});
    const reply = (data: unknown) => ({
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: request
    });
    // 保留 HTTP 客户端消费的结构化错误合约，模拟设施无需引入 Axios 运行时。
    const failure = (message: string, status: number) =>
      Object.assign(new Error(message), {
        name: 'AxiosError',
        isAxiosError: true,
        code: 'ERR_BAD_RESPONSE',
        config: request,
        response: { ...reply({ message }), status }
      });
    const mark = async ({
      kind,
      key,
      page
    }: {
      kind: 'list' | 'detail' | 'content';
      key: string;
      page?: string;
    }) => {
      calls.push({ kind, key, page });
      if (fault?.kind === kind && (!fault.key || fault.key === key) && fault.remaining !== 0) {
        if (fault.remaining !== undefined) fault.remaining--;
        throw failure('Simulated provider failure', fault.status);
      }
      if (kind === 'content') await onContent?.(key);
    };
    const requireNode = (apiFileId?: string) => {
      const found = byId(apiFileId ?? '');
      if (!found) throw failure('Not found', 404);
      return found;
    };
    const page = (items: RemoteNode[], token?: string) => {
      const offset = Number(token ?? 0);
      return {
        items: items.slice(offset, offset + pageSize),
        next: offset + pageSize < items.length ? String(offset + pageSize) : undefined
      };
    };

    if (path.endsWith('/tenant_access_token/internal')) {
      calls.push({ kind: 'auth', key: 'feishu' });
      return reply({ tenant_access_token: 'fixture-token' });
    }
    if (path.endsWith('/oauth2/accessToken')) {
      calls.push({ kind: 'auth', key: 'dingtalk' });
      return reply({ accessToken: 'fixture-token', expireIn: 7200 });
    }
    if (path.endsWith('/topapi/v2/user/get')) {
      if (params.access_token !== 'fixture-token')
        throw new Error('Missing DingTalk operator access token');
      return reply({ errcode: 0, result: { unionid: 'fixture-union' } });
    }
    const authHeader =
      provider === 'yuque'
        ? 'X-Auth-Token'
        : provider === 'dingtalk'
          ? 'x-acs-dingtalk-access-token'
          : 'Authorization';
    const expectedAuth =
      provider === 'custom' || provider === 'feishu' ? 'Bearer fixture-token' : 'fixture-token';
    if (request.headers.get(authHeader) !== expectedAuth)
      throw new Error(`Missing ${provider} request credentials`);

    if (provider === 'custom') {
      if (path === '/v1/file/list') {
        const parent = requireNode(body.parentId ?? id(rootKey));
        await mark({ kind: 'list', key: parent.key });
        return reply({ success: true, data: children(parent.key).map(normalized) });
      }
      const apiFileId = String(params.id);
      const found = byId(apiFileId);
      if (path === '/v1/file/detail') {
        await mark({ kind: 'detail', key: found?.key ?? apiFileId });
        return reply({ success: true, data: normalized(requireNode(apiFileId)) });
      }
      if (path === '/v1/file/content') {
        const item = requireNode(apiFileId);
        await mark({ kind: 'content', key: item.key });
        return reply({ success: true, data: { title: item.name, content: item.content } });
      }
    }
    if (provider === 'yuque') {
      if (path.includes('/groups/')) {
        await mark({ kind: 'detail', key: rootKey });
        return reply({
          data: tree.nodes
            .filter((item) => item.key === rootKey)
            .map((item) => ({ id: 100, name: item.name, updated_at: date, created_at: date }))
        });
      }
      if (path.endsWith('/toc')) {
        await mark({ kind: 'list', key: rootKey });
        return reply({
          data: tree.nodes
            .filter((item) => item.key !== rootKey)
            .map((item) => ({
              uuid: `uuid-${item.key}`,
              id: serial(item.key),
              doc_id: serial(item.key),
              title: item.name,
              type: item.type === 'folder' ? 'TITLE' : item.type === 'ignored' ? 'LINK' : 'DOC',
              parent_uuid: item.parent === rootKey ? '' : `uuid-${item.parent}`,
              child_uuid: children(item.key)[0] ? `uuid-${children(item.key)[0].key}` : '',
              slug: item.key,
              url: item.key
            }))
        });
      }
      if (path.includes('/docs/')) {
        const found = tree.nodes.find((item) => String(serial(item.key)) === path.split('/').pop());
        if (!found) throw new Error(`Unknown Yuque document: ${path}`);
        await mark({ kind: 'content', key: found.key });
        return reply({ data: { title: found.name, body: found.content } });
      }
    }
    if (provider === 'feishu') {
      if (path.endsWith('/drive/v1/files')) {
        const parent = requireNode(params.folder_token);
        await mark({ kind: 'list', key: parent.key, page: params.page_token });
        const result = page(children(parent.key), params.page_token);
        return reply({
          code: 0,
          data: {
            files: result.items.map((item) => ({
              token: id(item.key),
              parent_token: id(parent.key),
              name: item.name,
              type: item.type === 'folder' ? 'folder' : item.type === 'file' ? 'docx' : 'sheet',
              modified_time: date.getTime() / 1000,
              created_time: date.getTime() / 1000
            })),
            has_more: !!result.next,
            next_page_token: result.next
          }
        });
      }
      if (path.endsWith('/metas/batch_query')) {
        const query = body.request_docs[0];
        const found = byId(query.doc_token);
        await mark({ kind: 'detail', key: found?.key ?? query.doc_token });
        const matches = found && query.doc_type === (found.type === 'folder' ? 'folder' : 'docx');
        return reply({
          code: 0,
          data: matches
            ? { metas: [{ title: found.name, doc_type: query.doc_type }] }
            : { failed_list: [{ token: query.doc_token, code: 970005 }] }
        });
      }
      if (path.includes('/docx/v1/documents/')) {
        const raw = path.endsWith('/raw_content');
        const found = requireNode(path.split('/')[5]);
        if (raw) await mark({ kind: 'content', key: found.key });
        return reply({
          code: 0,
          data: raw ? { content: found.content } : { document: { title: found.name } }
        });
      }
    }
    if (provider === 'dingtalk') {
      if (path === '/v2.0/wiki/nodes') {
        const parent = requireNode(params.parentNodeId);
        await mark({ kind: 'list', key: parent.key, page: params.nextToken });
        const result = page(children(parent.key), params.nextToken);
        return reply({ nodes: result.items.map(dingNode), nextToken: result.next });
      }
      if (path.startsWith('/v2.0/wiki/nodes/')) {
        const apiFileId = path.split('/').pop()!;
        const found = byId(apiFileId);
        await mark({ kind: 'detail', key: found?.key ?? apiFileId });
        return reply({ node: dingNode(requireNode(apiFileId)) });
      }
      if (path.includes('/doc/suites/documents/')) {
        const found = requireNode(path.split('/')[5]);
        await mark({ kind: 'content', key: found.key });
        return reply({ blocks: [{ text: found.content }] });
      }
    }
    throw new Error(`Unexpected external request for ${provider}: ${request.method} ${path}`);
  };
  return {
    provider,
    config,
    id,
    supportsDocumentChildren,
    calls,
    respond,
    get nodes() {
      return tree.nodes;
    },
    set nodes(value: readonly RemoteNode[]) {
      tree = indexNodes(value);
    },
    set fault(value: typeof fault) {
      fault = value;
    },
    set onContent(value: typeof onContent) {
      onContent = value;
    },
    node: createRemoteNode
  };
};
