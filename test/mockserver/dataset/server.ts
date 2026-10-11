import http from 'node:http';
import { URL } from 'node:url';

export type CustomTreeShape = {
  l1: number;
  l2: number;
  l3: number;
  filesPerLeaf: number;
};

export type MockDatasetServerOptions = {
  // 1. 自定义 API 知识库拓扑配置
  customTree?: CustomTreeShape;
  // 2. 飞书数据量配置
  feishu?: {
    folderCount?: number;
    filesPerFolder?: number;
  };
  // 3. 钉钉数据量配置
  dingtalk?: {
    workspaceCount?: number;
    nodesPerWorkspace?: number;
    docsWithChildrenCount?: number;
  };
  // 4. 语雀数据量配置
  yuque?: {
    repoCount?: number;
    tocsPerRepo?: number;
  };
  // 5. 模拟公网延迟毫秒
  delayMs?: number;
};

/**
 * 外部知识库测试模拟服务：支持参数化动态生成不同规模的数据，模拟自定义 API、飞书、钉钉、语雀。
 */
export class ApiDatasetMockServer {
  private server: http.Server | null = null;
  public port: number = 0;
  public baseUrl: string = '';

  public delayMs = 0;
  public requestCount = 0;

  // 飞书状态
  public feishu503 = false;
  public feishu429 = false;
  public feishuNotFoundTokens = new Set<string>();
  public feishuMetas = new Map<string, { title: string; doc_type: 'docx' | 'folder' }>();
  public feishuFilesByFolder = new Map<string, any[]>();

  // 钉钉状态
  public dingtalkWorkspaces: any[] = [];
  public dingtalkNodes = new Map<string, any>();

  // 语雀状态
  public yuqueTocCalls = 0;
  public yuqueRepos = new Map<number, { id: number; name: string; type: string; slug: string }>();
  public yuqueTocs = new Map<number | string, any[]>();

  // 自定义 API 状态
  public customFiles = new Map<string, any[]>();

  constructor(options?: MockDatasetServerOptions) {
    if (options) {
      this.configure(options);
    } else {
      this.initDefaultData();
    }
  }

  /**
   * 动态指定参数重新配置模拟服务的数据规模与状态
   */
  public configure(options: MockDatasetServerOptions) {
    this.delayMs = options.delayMs ?? 0;
    this.initDefaultData();

    if (options.customTree) {
      this.generateCustomTree(options.customTree);
    }
    if (options.feishu) {
      this.generateFeishuData(options.feishu);
    }
    if (options.dingtalk) {
      this.generateDingtalkData(options.dingtalk);
    }
    if (options.yuque) {
      this.generateYuqueData(options.yuque);
    }
  }

  public initDefaultData() {
    this.feishu503 = false;
    this.feishu429 = false;
    this.feishuNotFoundTokens.clear();
    this.feishuMetas.clear();
    this.feishuFilesByFolder.clear();

    this.feishuMetas.set('fld-root', { title: 'Feishu Root Folder', doc_type: 'folder' });
    this.feishuMetas.set('fld-sub', { title: 'Feishu Sub Folder', doc_type: 'folder' });
    this.feishuMetas.set('doc-1', { title: 'Feishu Doc 1', doc_type: 'docx' });
    this.feishuFilesByFolder.set('fld-root', [
      { token: 'doc-1', name: 'Feishu Doc 1', type: 'docx', parent_token: 'fld-root' }
    ]);

    this.yuqueTocCalls = 0;
    this.yuqueRepos.clear();
    this.yuqueRepos.set(1001, { id: 1001, name: 'Yuque Repo 1', type: 'Book', slug: 'repo-1' });
    this.yuqueTocs.clear();
    this.yuqueTocs.set('1001', [
      {
        id: 101,
        uuid: 'u-fld1',
        parent_uuid: '',
        child_uuid: 'u-doc1',
        type: 'TITLE',
        title: 'Chapter 1',
        slug: 'chap-1'
      },
      {
        id: 102,
        uuid: 'u-doc1',
        parent_uuid: 'u-fld1',
        child_uuid: '',
        type: 'DOC',
        title: 'Doc 1',
        slug: 'doc-1'
      }
    ]);

    this.dingtalkWorkspaces = [
      { workspaceId: 'ws-1', workspaceName: 'Mock Workspace', rootNodeId: 'root-node' }
    ];
    this.dingtalkNodes.clear();
    this.dingtalkNodes.set('root-node', {
      nodeId: 'root-node',
      title: 'Dingtalk Root',
      nodeType: 'folder',
      hasChildren: true
    });
    this.dingtalkNodes.set('doc-with-children', {
      nodeId: 'doc-with-children',
      title: 'Online Doc With Children',
      docType: 'wiki_doc',
      hasChildren: true,
      parentNodeId: 'root-node'
    });
    this.dingtalkNodes.set('sub-doc', {
      nodeId: 'sub-doc',
      title: 'Child Sub Doc',
      docType: 'wiki_doc',
      hasChildren: false,
      parentNodeId: 'doc-with-children'
    });

    this.customFiles.clear();
    this.customFiles.set('root', [
      { id: 'fld-1', parentId: null, name: 'Custom Folder', type: 'folder', hasChild: true },
      { id: 'doc-root', parentId: null, name: 'Root File', type: 'file', hasChild: false }
    ]);
    this.customFiles.set('fld-1', [
      { id: 'doc-child', parentId: 'fld-1', name: 'Child File', type: 'file', hasChild: false }
    ]);
  }

  /**
   * 参数化生成自定义 API 知识库树形数据
   */
  public generateCustomTree(shape: CustomTreeShape): { folders: number; files: number } {
    this.customFiles.clear();
    const rootList: any[] = [];
    let fileSeq = 0;
    for (let a = 0; a < shape.l1; a++) {
      const idA = `l1-${a}`;
      rootList.push({ id: idA, parentId: null, name: `L1-${a}`, type: 'folder', hasChild: true });
      const l2List: any[] = [];
      for (let b = 0; b < shape.l2; b++) {
        const idB = `${idA}_l2-${b}`;
        l2List.push({ id: idB, parentId: idA, name: `L2-${b}`, type: 'folder', hasChild: true });
        const l3List: any[] = [];
        for (let c = 0; c < shape.l3; c++) {
          const idC = `${idB}_l3-${c}`;
          l3List.push({ id: idC, parentId: idB, name: `L3-${c}`, type: 'folder', hasChild: true });
          const fileList: any[] = [];
          for (let f = 0; f < shape.filesPerLeaf; f++) {
            fileList.push({
              id: `f-${fileSeq++}`,
              parentId: idC,
              name: `File-${fileSeq}`,
              type: 'file',
              hasChild: false
            });
          }
          this.customFiles.set(idC, fileList);
        }
        this.customFiles.set(idB, l3List);
      }
      this.customFiles.set(idA, l2List);
    }
    this.customFiles.set('root', rootList);
    return {
      folders: shape.l1 + shape.l1 * shape.l2 + shape.l1 * shape.l2 * shape.l3,
      files: shape.l1 * shape.l2 * shape.l3 * shape.filesPerLeaf
    };
  }

  /**
   * 参数化生成飞书 Drive 数据
   */
  public generateFeishuData({
    folderCount = 5,
    filesPerFolder = 10
  }: {
    folderCount?: number;
    filesPerFolder?: number;
  }) {
    this.feishuMetas.clear();
    this.feishuFilesByFolder.clear();
    const rootFiles: any[] = [];
    this.feishuMetas.set('fld-root', { title: 'Feishu Root', doc_type: 'folder' });

    let docSeq = 0;
    for (let i = 0; i < folderCount; i++) {
      const fId = `feishu-folder-${i}`;
      this.feishuMetas.set(fId, { title: `Folder ${i}`, doc_type: 'folder' });
      rootFiles.push({ token: fId, name: `Folder ${i}`, type: 'folder', parent_token: 'fld-root' });

      const folderFiles: any[] = [];
      for (let j = 0; j < filesPerFolder; j++) {
        const dId = `feishu-doc-${docSeq++}`;
        this.feishuMetas.set(dId, { title: `Doc ${docSeq}`, doc_type: 'docx' });
        folderFiles.push({ token: dId, name: `Doc ${docSeq}`, type: 'docx', parent_token: fId });
      }
      this.feishuFilesByFolder.set(fId, folderFiles);
    }
    this.feishuFilesByFolder.set('fld-root', rootFiles);
  }

  /**
   * 参数化生成钉钉知识库节点数据
   */
  public generateDingtalkData({
    workspaceCount = 2,
    nodesPerWorkspace = 20,
    docsWithChildrenCount = 5
  }: {
    workspaceCount?: number;
    nodesPerWorkspace?: number;
    docsWithChildrenCount?: number;
  }) {
    this.dingtalkWorkspaces = [];
    this.dingtalkNodes.clear();
    let nodeSeq = 0;

    for (let w = 0; w < workspaceCount; w++) {
      const wsId = `ws-${w}`;
      const rootNodeId = `root-ws-${w}`;
      this.dingtalkWorkspaces.push({
        workspaceId: wsId,
        workspaceName: `Workspace ${w}`,
        rootNodeId
      });
      this.dingtalkNodes.set(rootNodeId, {
        nodeId: rootNodeId,
        title: `Root WS ${w}`,
        nodeType: 'folder',
        hasChildren: true
      });

      for (let n = 0; n < nodesPerWorkspace; n++) {
        const nId = `node-${nodeSeq++}`;
        const isDocWithChild = n < docsWithChildrenCount;
        this.dingtalkNodes.set(nId, {
          nodeId: nId,
          title: `Node ${nodeSeq}`,
          docType: isDocWithChild ? 'wiki_doc' : 'document',
          hasChildren: isDocWithChild,
          parentNodeId: rootNodeId
        });
        if (isDocWithChild) {
          const childId = `child-${nodeSeq}`;
          this.dingtalkNodes.set(childId, {
            nodeId: childId,
            title: `Sub Child of ${nId}`,
            docType: 'wiki_doc',
            hasChildren: false,
            parentNodeId: nId
          });
        }
      }
    }
  }

  /**
   * 参数化生成语雀知识库与 TOC 数据
   */
  public generateYuqueData({
    repoCount = 5,
    tocsPerRepo = 20
  }: {
    repoCount?: number;
    tocsPerRepo?: number;
  }) {
    this.yuqueRepos.clear();
    this.yuqueTocs.clear();
    this.yuqueTocCalls = 0;

    for (let r = 0; r < repoCount; r++) {
      const repoId = 2000 + r;
      this.yuqueRepos.set(repoId, {
        id: repoId,
        name: `Yuque Knowledge Base ${r}`,
        type: 'Book',
        slug: `kb-${r}`
      });
      const tocs: any[] = [];
      for (let t = 0; t < tocsPerRepo; t++) {
        const isTitle = t % 5 === 0;
        tocs.push({
          id: t + 1,
          uuid: `uuid-r${repoId}-t${t}`,
          parent_uuid: t > 0 && !isTitle ? `uuid-r${repoId}-t0` : '',
          child_uuid: isTitle ? `uuid-r${repoId}-t${t + 1}` : '',
          type: isTitle ? 'TITLE' : 'DOC',
          title: `${isTitle ? 'Section' : 'Article'} ${t}`,
          slug: `slug-${t}`
        });
      }
      this.yuqueTocs.set(String(repoId), tocs);
    }
  }

  public async start(): Promise<{ baseUrl: string; port: number }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err: any) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: err?.message || 'Server error' }));
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as any;
        this.port = addr.port;
        this.baseUrl = `http://127.0.0.1:${this.port}`;
        resolve({ baseUrl: this.baseUrl, port: this.port });
      });
      this.server.on('error', reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  private readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve({});
        }
      });
    });
  }

  private json(res: http.ServerResponse, status: number, data: any) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    this.requestCount++;
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = (req.method || 'GET').toUpperCase();

    // 0. 动态配置 API（方便在测试运行时通过 HTTP 热更新模拟服务数据量）
    if (pathname === '/mock/configure' && method === 'POST') {
      const body = await this.readBody(req);
      this.configure(body);
      return this.json(res, 200, { success: true, message: 'Mock server reconfigured' });
    }

    // 1. 飞书 Open APIs
    if (pathname === '/open-apis/auth/v3/tenant_access_token/internal') {
      return this.json(res, 200, {
        code: 0,
        msg: 'ok',
        data: { tenant_access_token: 'mock-feishu-token', expire: 7200 }
      });
    }

    if (pathname === '/open-apis/drive/v1/metas/batch_query') {
      if (this.feishu503) {
        return this.json(res, 503, { code: 99991663, msg: 'Service Unavailable' });
      }
      if (this.feishu429) {
        return this.json(res, 429, { code: 99991400, msg: 'Too Many Requests' });
      }

      const body = await this.readBody(req);
      const requestDocs: Array<{ doc_token: string; doc_type: 'docx' | 'folder' }> =
        body.request_docs || [];
      const metas: any[] = [];
      const failed_list: any[] = [];

      for (const item of requestDocs) {
        if (this.feishuNotFoundTokens.has(item.doc_token)) {
          failed_list.push({ token: item.doc_token, code: 970005 });
          continue;
        }
        const existing = this.feishuMetas.get(item.doc_token);
        if (existing && existing.doc_type === item.doc_type) {
          metas.push({ title: existing.title, doc_type: existing.doc_type });
        } else {
          failed_list.push({ token: item.doc_token, code: 970005 });
        }
      }

      return this.json(res, 200, {
        code: 0,
        msg: 'ok',
        data: { metas, failed_list }
      });
    }

    if (pathname === '/open-apis/drive/v1/files') {
      const folderToken = url.searchParams.get('folder_token') || 'fld-root';
      const files = this.feishuFilesByFolder.get(folderToken) || [];
      return this.json(res, 200, {
        code: 0,
        msg: 'ok',
        data: {
          files,
          has_more: false
        }
      });
    }

    if (pathname.includes('/raw_content')) {
      return this.json(res, 200, {
        code: 0,
        msg: 'ok',
        data: { content: 'Mock Feishu doc raw markdown content' }
      });
    }

    // 2. 钉钉 Open APIs
    if (pathname.includes('/v1.0/oauth2/accessToken')) {
      return this.json(res, 200, { accessToken: 'mock-dingtalk-token', expireIn: 7200 });
    }

    if (pathname.includes('/topapi/v2/user/get')) {
      return this.json(res, 200, {
        errcode: 0,
        result: { unionid: 'mock-operator-id', userid: 'mock-user-id' }
      });
    }

    if (pathname.includes('/v2.0/wiki/workspaces') || pathname.includes('/v1.0/yida/workspaces')) {
      return this.json(res, 200, {
        workspaces: this.dingtalkWorkspaces
      });
    }

    if (pathname === '/v2.0/wiki/nodes') {
      const parentNodeId = url.searchParams.get('parentNodeId') || 'root-node';
      const nodes = Array.from(this.dingtalkNodes.values()).filter(
        (n) => n.parentNodeId === parentNodeId || (!n.parentNodeId && parentNodeId === 'root-node')
      );
      return this.json(res, 200, { nodes });
    }

    if (pathname.startsWith('/v2.0/wiki/nodes/')) {
      const nodeId = pathname.split('/').pop() || '';
      const node = this.dingtalkNodes.get(nodeId);
      if (!node) {
        return this.json(res, 404, { code: 404, message: 'Node not found' });
      }
      return this.json(res, 200, { node });
    }

    if (pathname.includes('/blocks')) {
      return this.json(res, 200, {
        data: { blocks: [{ text: 'Dingtalk online doc content' }] }
      });
    }

    // 3. 语雀 Open APIs
    if (pathname.includes('/repos') && !pathname.includes('/toc') && !pathname.includes('/docs/')) {
      if (method === 'GET' && pathname.includes('/groups/')) {
        return this.json(res, 200, { data: Array.from(this.yuqueRepos.values()) });
      }
      if (method === 'GET' && pathname.startsWith('/api/v2/repos/')) {
        const repoId = Number(pathname.split('/')[4]);
        const repo = this.yuqueRepos.get(repoId);
        return this.json(res, 200, { data: repo || { id: repoId, slug: 'repo', name: 'Repo' } });
      }
    }

    if (pathname.includes('/toc')) {
      this.yuqueTocCalls++;
      const match = pathname.match(/\/repos\/([^\/]+)\/toc/);
      const repoKey = match ? match[1] : '1001';
      const tocs = this.yuqueTocs.get(repoKey) || this.yuqueTocs.get('1001') || [];
      return this.json(res, 200, { data: tocs });
    }

    if (pathname.includes('/docs/')) {
      return this.json(res, 200, {
        data: {
          title: 'Mock Yuque Doc Title',
          body: 'Mock Yuque Doc Content Text'
        }
      });
    }

    // 4. 自定义 API 知识库
    if (pathname === '/v1/file/list') {
      const body = await this.readBody(req);
      const pId = body.parentId || 'root';
      const files = this.customFiles.get(pId) || [];
      return this.json(res, 200, {
        success: true,
        message: 'ok',
        data: files
      });
    }

    if (pathname === '/v1/file/detail') {
      const id = url.searchParams.get('id') || '';
      let found: any = null;
      for (const list of this.customFiles.values()) {
        const f = list.find((item: any) => item.id === id);
        if (f) {
          found = f;
          break;
        }
      }
      if (!found) {
        return this.json(res, 200, { success: false, message: 'File not found' });
      }
      return this.json(res, 200, {
        success: true,
        message: 'ok',
        data: found
      });
    }

    if (pathname === '/v1/file/content') {
      return this.json(res, 200, {
        success: true,
        message: 'ok',
        data: {
          title: 'Custom Doc Title',
          content: 'Custom Doc Full Content'
        }
      });
    }

    return this.json(res, 404, { message: 'Not found' });
  }
}
