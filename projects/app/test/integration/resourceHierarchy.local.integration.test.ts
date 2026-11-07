import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type {} from '../../../../test/globalSetup';
import { connectionMongo, connectionLogMongo, type Model } from '@fastgpt/service/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { configureRedisRuntime, closeRedisRuntime } from '@fastgpt/dal/redis/runtime';
import { serviceEnv } from '@fastgpt/service/env';
import { initS3Buckets } from '@fastgpt/service/common/s3';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { getUser } from '@test/datas/users';
import setupModels from '@test/setupModels';
import { initGlobalVariables } from '@/service/common/system';
import appCreate from '@/pages/api/core/app/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';

import appFolderCreate from '@/pages/api/core/app/folder/create';
import appUpdate from '@/pages/api/core/app/update';
import appPath from '@/pages/api/core/app/folder/path';
import datasetCreate from '@/pages/api/core/dataset/create';
import datasetFolderCreate from '@/pages/api/core/dataset/folder/create';
import datasetUpdate from '@/pages/api/core/dataset/update';
import datasetList from '@/pages/api/core/dataset/listV2';
import collectionCreate from '@/pages/api/core/dataset/collection/create';
import collectionUpdate from '@/pages/api/core/dataset/collection/update';
import collectionPaths from '@/pages/api/core/dataset/collection/paths';
import skillCreate from '@/pages/api/core/ai/skill/create';
import skillFolderCreate from '@/pages/api/core/ai/skill/folder/create';
import skillUpdate from '@/pages/api/core/ai/skill/update';
import skillPath from '@/pages/api/core/ai/skill/folder/path';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  PerResourceTypeEnum,
  OwnerRoleVal,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';

import {
  bulkInsertFolderCollections,
  createApiFileCollectionsBatch,
  createCollections
} from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

type Handler = (req: ApiRequestProps, res: ApiResponseType) => unknown;
type Envelope = { code: number; data?: any; message?: string; statusText?: string };
const requests: Array<{ path: string; method: string; http: number; code: number; ms: number }> =
  [];
const servers: Server[] = [];
const environment: Record<string, unknown> = {
  node: process.version,
  platform: process.platform,
  mongo: 'local ephemeral replica set',
  redisDatabase: 14,
  mockedModules: []
};
let owner: Awaited<ReturnType<typeof getUser>>;
let reader: typeof owner;
let foreign: typeof owner;
const tokens = new Map<string, string>();
let appUrl: string;
let ownsRedisKeys = false;
let datasetId: string;
let proUrl: string;
let serial = 0;
const name = () => `resource-http-${++serial}`;
const routes = new Map<string, Handler>(
  Object.entries({
    '/api/core/app/create': appCreate,
    '/api/core/app/folder/create': appFolderCreate,
    '/api/core/app/update': appUpdate,
    '/api/core/app/folder/path': appPath,
    '/api/core/dataset/create': datasetCreate,
    '/api/core/dataset/folder/create': datasetFolderCreate,
    '/api/core/dataset/update': datasetUpdate,
    '/api/core/dataset/listV2': datasetList,
    '/api/core/dataset/collection/create': collectionCreate,
    '/api/core/dataset/collection/update': collectionUpdate,
    '/api/core/dataset/collection/paths': collectionPaths,
    '/api/core/ai/skill/create': skillCreate,
    '/api/core/ai/skill/folder/create': skillFolderCreate,
    '/api/core/ai/skill/update': skillUpdate,
    '/api/core/ai/skill/folder/path': skillPath
  }) as Array<[string, Handler]>
);
const proEntryPaths = [
  '/api/core/app/collaborator/update',
  '/api/core/dataset/collaborator/update',
  '/api/core/dataset/collection/collaborator/update',
  '/api/core/ai/skill/collaborator/update'
];

/** 用真实 Node HTTP 承载生产 NextAPI 包装器，只适配框架提供的 body/query/status/json。 */
const startHttp = async (port: number, handlers: Map<string, Handler>) => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${port}`);
    const handler = handlers.get(url.pathname);
    if (!handler) {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = Object.assign(req, {
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {},
      query: Object.fromEntries(url.searchParams),
      cookies: {}
    });
    const response = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return response;
      },
      json(data: unknown) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(data));
        return response;
      },
      send(data: unknown) {
        return response.json(data);
      }
    });
    try {
      await handler(request as unknown as ApiRequestProps, response as unknown as ApiResponseType);
    } catch {
      if (!res.writableEnded)
        res.writeHead(500).end(JSON.stringify({ code: 500, message: 'HTTP host error' }));
    }
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${port}`;
};

/** 所有被测接口经真实 HTTP、生产鉴权和 JSON 入参校验；报告不记录令牌或请求正文。 */
const request = async (
  path: string,
  {
    body,
    actor = owner,
    method = 'POST',
    base = appUrl
  }: { body?: unknown; actor?: typeof owner; method?: string; base?: string } = {}
) => {
  const start = performance.now();
  const response = await fetch(new URL(path, base), {
    method,
    headers: { token: tokens.get(actor.userId)!, 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000)
  });
  const data = (await response.json()) as Envelope;
  requests.push({
    path: path.split('?')[0],
    method,
    http: response.status,
    code: data.code,
    ms: Math.round(performance.now() - start)
  });
  return data;
};

describe.skipIf(!process.env.FASTGPT_RESOURCE_ENV_FILE)(
  'local production HTTP resource integration',
  () => {
    beforeAll(async () => {
      await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
      await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });
      const runtime = configureRedisRuntime({ redisUrl: serviceEnv.REDIS_URL });
      // DB 14 必须为空才开始；清理仅针对本次运行创建的 key，不清空共享开发 DB。
      const redis = runtime.getCommandConnection();
      expect(await redis.dbsize()).toBe(0);
      ownsRedisKeys = true;
      environment.mongoVersion = (
        await connectionMongo.connection.db!.admin().serverInfo()
      ).version;
      environment.redisVersion = (await redis.info('server')).match(
        /redis_version:([^\r\n]+)/
      )?.[1];
      initGlobalVariables();
      global.agentUserTmbIds = new Set();
      global.systemEnv = {} as any;
      global.feConfigs = {
        isPlus: true,
        teamMode: 'multi',
        limit: { uploadFileMaxAmount: 1000, uploadFileMaxSize: 1000 }
      } as any;
      global.licenseData = {
        startTime: '2000-01-01',
        expiredTime: '2099-01-01',
        licenseType: 'commercial',
        functions: {},
        limits: {}
      } as any;
      await initS3Buckets();
      await setupModels();
      const prefix = `resource-e2e-${Date.now()}`;
      owner = await getUser(`${prefix}-owner`);
      reader = await getUser(`${prefix}-reader`, owner.teamId);
      foreign = await getUser(`${prefix}-foreign`);
      for (const actor of [owner, reader, foreign])
        tokens.set(actor.userId, await createUserSession({ ...actor, isRoot: false }));
      appUrl = await startHttp(3310, routes);
      // Pro 有独立 @ alias；运行时加载实际入口，避免 App 的 TS 项目递归纳入 Pro 源码。
      const proRoutes = new Map<string, Handler>();
      for (const path of proEntryPaths) {
        const file = resolvePath(
          import.meta.dirname,
          '../../../../pro/admin/src/pages',
          `.${path}.ts`
        );
        proRoutes.set(path, (await import(/* @vite-ignore */ file)).default);
      }
      proUrl = await startHttp(3311, proRoutes);
      const created = await request('/api/core/dataset/create', {
        body: { name: name(), type: 'dataset', intro: '' }
      });
      expect(created.code, created.message).toBe(200);
      datasetId = created.data;
      await MongoDataset.updateOne({ _id: datasetId }, { collectionPermissionEnabled: true });
    });

    afterAll(async () => {
      writeFileSync(
        '/tmp/fastgpt-pr8155-local-http-requests.json',
        JSON.stringify(requests, null, 2)
      );
      for (const server of servers) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const runtime = configureRedisRuntime({ redisUrl: serviceEnv.REDIS_URL });
      const redis = runtime.getCommandConnection();
      const keys = [
        ...(await redis.keys('fastgpt:*')),
        ...(await redis.keys('bull:agentSkillCreate:*'))
      ];
      if (ownsRedisKeys && keys.length) await redis.del(...keys);
      if (ownsRedisKeys) expect(await redis.dbsize()).toBe(0);
      writeFileSync(
        '/tmp/fastgpt-pr8155-local-http-environment.json',
        JSON.stringify(environment, null, 2)
      );
      await closeRedisRuntime();
      await connectionLogMongo.disconnect();
      await connectionMongo.disconnect();
    });

    type Family = {
      label: string;
      model: Model<any>;
      resourceType: PerResourceTypeEnum;
      folderType: string;
      leafType: string;
      createPath: string;
      folderPath: string;
      movePath: (id: string) => string;
      moveKey: string;
      proPath: string;
      proKey: string;
      path?: string;
    };
    const families: Family[] = [
      {
        label: 'app',
        model: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        folderType: 'folder',
        leafType: 'simple',
        createPath: '/api/core/app/create',
        folderPath: '/api/core/app/folder/create',
        movePath: (id) => `/api/core/app/update?appId=${id}`,
        moveKey: '',
        proPath: '/api/core/app/collaborator/update',
        proKey: 'appId',
        path: '/api/core/app/folder/path'
      },
      {
        label: 'tool',
        model: MongoApp,
        resourceType: PerResourceTypeEnum.app,
        folderType: 'toolFolder',
        leafType: 'plugin',
        createPath: '/api/core/app/create',
        folderPath: '/api/core/app/folder/create',
        movePath: (id) => `/api/core/app/update?appId=${id}`,
        moveKey: '',
        proPath: '/api/core/app/collaborator/update',
        proKey: 'appId',
        path: '/api/core/app/folder/path'
      },
      {
        label: 'dataset',
        model: MongoDataset,
        resourceType: PerResourceTypeEnum.dataset,
        folderType: 'folder',
        leafType: 'dataset',
        createPath: '/api/core/dataset/create',
        folderPath: '/api/core/dataset/folder/create',
        movePath: () => '/api/core/dataset/update',
        moveKey: 'id',
        proPath: '/api/core/dataset/collaborator/update',
        proKey: 'datasetId'
      },
      {
        label: 'collection',
        model: MongoDatasetCollection,
        resourceType: PerResourceTypeEnum.collection,
        folderType: 'folder',
        leafType: 'virtual',
        createPath: '/api/core/dataset/collection/create',
        folderPath: '/api/core/dataset/collection/create',
        movePath: () => '/api/core/dataset/collection/update',
        moveKey: 'id',
        proPath: '/api/core/dataset/collection/collaborator/update',
        proKey: 'collectionId',
        path: '/api/core/dataset/collection/paths'
      },
      {
        label: 'skill',
        model: MongoAgentSkills,
        resourceType: PerResourceTypeEnum.agentSkill,
        folderType: 'folder',
        leafType: 'skill',
        createPath: '/api/core/ai/skill/create',
        folderPath: '/api/core/ai/skill/folder/create',
        movePath: () => '/api/core/ai/skill/update',
        moveKey: 'skillId',
        proPath: '/api/core/ai/skill/collaborator/update',
        proKey: 'skillId',
        path: '/api/core/ai/skill/folder/path'
      }
    ];

    /** 同一验收矩阵应用于五类资源，业务差异仅保留在实际 HTTP 合约中。 */
    const create = async ({
      family,
      folder = false,
      parentId,
      actor = owner,
      generic = false,
      extra = {}
    }: {
      family: Family;
      folder?: boolean;
      parentId?: string;
      actor?: typeof owner;
      generic?: boolean;
      extra?: Record<string, unknown>;
    }) => {
      const createdName = name();
      const response = await request(folder && !generic ? family.folderPath : family.createPath, {
        body: {
          name: createdName,
          intro: '',
          description: '',
          nodes: [],
          category: [],
          type: folder ? family.folderType : family.leafType,
          ...(family.label === 'collection' ? { datasetId } : {}),
          ...(parentId ? { parentId } : {}),
          ...extra
        },
        actor
      });
      // App/Dataset 专用目录接口成功不返回 ID，按本次唯一名称检查持久化结果。
      if (response.code === 200 && response.data === null) {
        response.data = String((await family.model.collection.findOne({ name: createdName }))?._id);
      }
      // Skill 创建只负责入队；层级移动夹具显式设为 ready，不验证异步生成 worker。
      if (response.code === 200 && family.label === 'skill' && !folder) {
        await MongoAgentSkills.updateOne({ _id: response.data }, { creationStatus: 'ready' });
      }
      return response;
    };

    /** 从底层集合读取已提交结果，不复用被测 API 的返回值作为持久化证明。 */
    const readDoc = (family: Family, id: string) =>
      family.model.collection.findOne({ _id: new Types.ObjectId(id) });

    const idOf = (response: Envelope) => {
      expect(response.code, response.message).toBe(200);
      const id = typeof response.data === 'string' ? response.data : response.data?.folderId;
      expect(id).toMatch(/^[a-f0-9]{24}$/);
      return id as string;
    };
    const rejected = (response: Envelope, statusText?: string) => {
      expect(response.code, JSON.stringify(response)).not.toBe(200);
      expect(response.message).not.toBe('HTTP host error');
      if (statusText) expect(response.statusText).toBe(statusText);
    };
    const move = async ({
      family,
      id,
      parentId,
      actor = owner
    }: {
      family: Family;
      id: string;
      parentId: string | null;
      actor?: typeof owner;
    }) =>
      request(family.movePath(id), {
        body: { ...(family.moveKey ? { [family.moveKey]: id } : {}), parentId },
        actor
      });

    /** 绕过业务创建仅用于构造历史脏数据，验证真实接口在该输入下的行为。 */
    const clone = async ({
      family,
      sourceId,
      parentId,
      extra = {}
    }: {
      family: Family;
      sourceId: string;
      parentId: string | null;
      extra?: Record<string, unknown>;
    }) => {
      const doc = await family.model.collection.findOne({ _id: new Types.ObjectId(sourceId) });
      if (!doc) throw new Error('Missing fixture');
      const _id = new Types.ObjectId();
      await family.model.collection.insertOne({
        ...doc,
        _id,
        name: name(),
        parentId: parentId ? new Types.ObjectId(parentId) : null,
        ancestorIds: [],
        ...extra
      });
      return _id.toString();
    };
    const chain = async ({
      family,
      depth,
      historical = false
    }: {
      family: Family;
      depth: number;
      historical?: boolean;
    }) => {
      const ids: string[] = [];
      for (let i = 0; i < depth; i++) {
        ids.push(
          historical && i > 0
            ? await clone({ family, sourceId: ids[0], parentId: ids[i - 1] })
            : idOf(await create({ family, folder: true, parentId: ids.at(-1) }))
        );
      }
      return ids;
    };
    const read = async ({
      family,
      id,
      actor = owner
    }: {
      family: Family;
      id: string;
      actor?: typeof owner;
    }) => {
      if (family.path)
        return request(`${family.path}?sourceId=${id}&type=current`, { actor, method: 'GET' });
      return request('/api/core/dataset/listV2', {
        body: {
          parentId: id,
          pageNum: 1,
          pageSize: 100,
          withFileCount: false,
          withAppCount: false
        },
        actor
      });
    };
    const share = async ({
      family,
      id,
      includeReader = true
    }: {
      family: Family;
      id: string;
      includeReader?: boolean;
    }) =>
      request(family.proPath, {
        body: {
          [family.proKey]: id,
          collaborators: [
            { tmbId: owner.tmbId, permission: OwnerRoleVal },
            ...(includeReader ? [{ tmbId: reader.tmbId, permission: ReadRoleVal }] : [])
          ]
        },
        base: proUrl
      });

    for (const family of families)
      describe(`HTTP ${family.label}`, () => {
        it('allows four folder levels and a leaf at level four; rejects dedicated and generic level five', async () => {
          const ids = await chain({ family, depth: 4 });
          idOf(await create({ family, parentId: ids[3] }));
          const count = await family.model.countDocuments({ teamId: owner.teamId });
          rejected(
            await create({ family, folder: true, parentId: ids[3] }),
            CommonErrEnum.folderDepthLimit
          );
          if (family.label !== 'skill')
            rejected(
              await create({ family, folder: true, parentId: ids[3], generic: true }),
              CommonErrEnum.folderDepthLimit
            );
          expect(await family.model.countDocuments({ teamId: owner.teamId })).toBe(count);
        });

        it('validates whole moved subtree depth and persists accepted moves', async () => {
          const targets = await chain({ family, depth: 4 });
          const subtree = await chain({ family, depth: 2 });
          const leaf = idOf(await create({ family, parentId: subtree[1] }));
          rejected(
            await move({ family, id: subtree[0], parentId: targets[2] }),
            CommonErrEnum.folderMoveDepthLimit
          );
          expect((await readDoc(family, subtree[0]))?.parentId).toBeFalsy();
          expect((await move({ family, id: subtree[0], parentId: targets[1] })).code).toBe(200);
          expect(String((await readDoc(family, subtree[0]))?.parentId)).toBe(targets[1]);
          const movedChild = await readDoc(family, subtree[1]);
          expect(String(movedChild?.parentId)).toBe(subtree[0]);
          if (['app', 'tool', 'dataset'].includes(family.label)) {
            expect(movedChild?.ancestorIds?.map(String)).toEqual([
              ...targets.slice(0, 2),
              subtree[0]
            ]);
          }
          const leafMoved = await move({ family, id: leaf, parentId: targets[3] });
          expect(leafMoved.code, leafMoved.message).toBe(200);
          expect(String((await readDoc(family, leaf))?.parentId)).toBe(targets[3]);
          if (family.path && family.label !== 'collection') {
            const leafPath = await request(`${family.path}?sourceId=${leaf}&type=parent`, {
              method: 'GET'
            });
            expect(leafPath.code, leafPath.message).toBe(200);
            expect(leafPath.data.map((item: { parentId: string }) => item.parentId)).toEqual(
              targets
            );
          }
          expect((await move({ family, id: subtree[0], parentId: null })).code).toBe(200);
        });

        it('rejects self, descendants, and non-folder parents for create and move', async () => {
          const ids = await chain({ family, depth: 2 });
          const leaf = idOf(await create({ family }));
          rejected(await move({ family, id: ids[0], parentId: ids[0] }));
          rejected(await move({ family, id: ids[0], parentId: ids[1] }));
          rejected(await move({ family, id: ids[0], parentId: leaf }));
          rejected(await create({ family, parentId: leaf }));
          rejected(await create({ family, folder: true, parentId: leaf }));
          expect((await readDoc(family, ids[0]))?.parentId).toBeFalsy();
        });

        it('rejects wrong-type, missing, cyclic and foreign-team ancestors without writing', async () => {
          const folder = idOf(await create({ family, folder: true }));
          const leaf = idOf(await create({ family }));
          const wrong = await clone({ family, sourceId: folder, parentId: leaf });
          const missing = await clone({
            family,
            sourceId: folder,
            parentId: new Types.ObjectId().toString()
          });
          const cycleA = await clone({ family, sourceId: folder, parentId: null });
          const cycleB = await clone({ family, sourceId: folder, parentId: cycleA });
          await family.model.updateOne({ _id: cycleA }, { parentId: cycleB });
          const foreignAncestor = await clone({
            family,
            sourceId: folder,
            parentId: null,
            extra: {
              teamId: new Types.ObjectId(foreign.teamId),
              tmbId: new Types.ObjectId(foreign.tmbId)
            }
          });
          const escaped = await clone({ family, sourceId: folder, parentId: foreignAncestor });
          for (const parentId of [wrong, missing, cycleA, escaped]) {
            const count = await family.model.countDocuments({ teamId: owner.teamId });
            rejected(await create({ family, parentId }));
            rejected(await move({ family, id: folder, parentId }));
            expect(await family.model.countDocuments({ teamId: owner.teamId })).toBe(count);
          }
          expect((await readDoc(family, folder))?.parentId).toBeFalsy();
        });

        it('enforces real sessions and Pro ACL propagation, read-only writes and independent branches', async () => {
          const root = idOf(await create({ family, folder: true }));
          const inherited = idOf(await create({ family, folder: true, parentId: root }));
          const leaf = idOf(await create({ family, parentId: inherited }));
          const independent = idOf(await create({ family, folder: true, parentId: root }));
          const independentLeaf = idOf(await create({ family, parentId: independent }));
          rejected(await create({ family, actor: reader }));
          rejected(await read({ family, id: root, actor: reader }));
          rejected(await create({ family, parentId: root, actor: reader }));
          expect((await share({ family, id: independent, includeReader: false })).code).toBe(200);
          // 独立态边界通过真实 Mongo 修改构造；协作者更新仍走生产 Pro HTTP。
          await family.model.updateOne({ _id: independent }, { inheritPermission: false });
          if (family.label === 'collection') {
            const datasetRead = await share({ family: families[2], id: datasetId });
            expect(datasetRead.code, datasetRead.message).toBe(200);
          }
          const shared = await share({ family, id: root });
          expect(shared.code, shared.message).toBe(200);
          expect((await read({ family, id: inherited, actor: reader })).code).toBe(200);
          expect(
            await MongoResourcePermission.countDocuments({
              resourceType: family.resourceType,
              resourceId: leaf,
              tmbId: reader.tmbId,
              permission: ReadRoleVal
            })
          ).toBe(1);
          expect(
            await MongoResourcePermission.countDocuments({
              resourceType: family.resourceType,
              resourceId: independentLeaf,
              tmbId: reader.tmbId
            })
          ).toBe(0);
          rejected(await create({ family, parentId: root, actor: reader }));
          rejected(await move({ family, id: leaf, parentId: root, actor: reader }));
          rejected(
            await share({ family, id: root, includeReader: false }).then(async (result) => {
              expect(result.code).toBe(200);
              return read({ family, id: inherited, actor: reader });
            })
          );
        });

        it('rebases inherited subtree ACL on move and restores it on moving back', async () => {
          const source = idOf(await create({ family, folder: true }));
          const target = idOf(await create({ family, folder: true }));
          const child = idOf(await create({ family, folder: true, parentId: source }));
          const leaf = idOf(await create({ family, parentId: child }));
          const independent = idOf(await create({ family, folder: true, parentId: child }));
          await family.model.updateOne({ _id: independent }, { inheritPermission: false });
          const ownAclBefore = await MongoResourcePermission.find({
            resourceType: family.resourceType,
            resourceId: independent
          })
            .sort({ _id: 1 })
            .lean();
          expect((await share({ family, id: source })).code).toBe(200);
          // Collection 的全局知识库读门槛已在前一个 ACL 用例授予；目标子树显式撤销 reader 快照。
          expect((await share({ family, id: target, includeReader: false })).code).toBe(200);
          expect(
            await MongoResourcePermission.countDocuments({
              resourceType: family.resourceType,
              resourceId: leaf,
              tmbId: reader.tmbId
            })
          ).toBe(1);
          expect((await move({ family, id: child, parentId: target })).code).toBe(200);
          expect(
            await MongoResourcePermission.countDocuments({
              resourceType: family.resourceType,
              resourceId: leaf,
              tmbId: reader.tmbId
            })
          ).toBe(0);
          if (family.label === 'collection') {
            const navigation = await read({ family, id: child, actor: reader });
            expect(navigation.code, navigation.message).toBe(200);
            expect(navigation.data.at(-1).folderAccessMode).toBe('navigate');
            rejected(await read({ family, id: leaf, actor: reader }));
          } else {
            rejected(await read({ family, id: child, actor: reader }));
          }
          expect((await move({ family, id: child, parentId: source })).code).toBe(200);
          expect((await read({ family, id: child, actor: reader })).code).toBe(200);
          expect(
            await MongoResourcePermission.find({
              resourceType: family.resourceType,
              resourceId: independent
            })
              .sort({ _id: 1 })
              .lean()
          ).toEqual(ownAclBefore);
        });

        it('reads historical depth six while rejecting new resources and moves beyond four', async () => {
          const ids = await chain({ family, depth: 6, historical: true });
          const result = await read({ family, id: ids[5] });
          expect(result.code, result.message).toBe(200);
          if (family.path)
            expect(result.data.map((item: { parentId: string }) => item.parentId)).toEqual(ids);
          rejected(await create({ family, parentId: ids[5] }), CommonErrEnum.folderDepthLimit);
          rejected(
            await create({ family, folder: true, parentId: ids[5] }),
            CommonErrEnum.folderDepthLimit
          );
          const leaf = idOf(await create({ family }));
          rejected(
            await move({ family, id: leaf, parentId: ids[5] }),
            CommonErrEnum.folderMoveDepthLimit
          );
        });

        it('bounds cyclic reads and prevents foreign-team direct access', async () => {
          const ids = await chain({ family, depth: 2 });
          await family.model.updateOne({ _id: ids[0] }, { parentId: ids[1] });
          const result = await read({ family, id: ids[1] });
          expect(result.code, result.message).toBe(200);
          if (family.path) {
            const pathIds = result.data.map((item: { parentId: string }) => item.parentId);
            expect(new Set(pathIds).size).toBe(pathIds.length);
            expect(pathIds.length).toBeLessThanOrEqual(2);
          }
          rejected(await read({ family, id: ids[1], actor: foreign }));
          rejected(await create({ family, parentId: ids[1], actor: foreign }));
          rejected(await move({ family, id: ids[1], parentId: null, actor: foreign }));
        });
      });

    describe('HTTP resource scope and subtype boundaries', () => {
      it('separates application folders and tool folders for every current App subtype', async () => {
        const app = families[0];
        const tool = families[1];
        const appFolder = idOf(await create({ family: app, folder: true }));
        const toolFolder = idOf(await create({ family: tool, folder: true }));
        for (const type of [AppTypeEnum.simple, AppTypeEnum.chatAgent, AppTypeEnum.workflow]) {
          const id = idOf(await create({ family: app, parentId: appFolder, extra: { type } }));
          rejected(await create({ family: app, parentId: toolFolder, extra: { type } }));
          rejected(await move({ family: app, id, parentId: toolFolder }));
        }
        for (const type of [
          AppTypeEnum.workflowTool,
          AppTypeEnum.httpToolSet,
          AppTypeEnum.mcpToolSet
        ]) {
          const id = idOf(await create({ family: tool, parentId: toolFolder, extra: { type } }));
          rejected(await create({ family: tool, parentId: appFolder, extra: { type } }));
          rejected(await move({ family: tool, id, parentId: appFolder }));
        }
      });

      it('rejects Collection parents from another dataset and forged external-depth fields', async () => {
        const family = families[3];
        const folder = idOf(await create({ family, folder: true }));
        const other = idOf(
          await request('/api/core/dataset/create', {
            body: { name: name(), type: 'dataset', intro: '' }
          })
        );
        const foreignFolder = idOf(
          await create({ family, folder: true, extra: { datasetId: other } })
        );
        rejected(await create({ family, parentId: foreignFolder }));
        rejected(await move({ family, id: folder, parentId: foreignFolder }));
        const ids = await chain({ family, depth: 6, historical: true });
        rejected(
          await create({
            family,
            parentId: ids[5],
            extra: { apiFileId: 'forged-external', maxDepth: 20 }
          })
        );
      });
    });

    describe('real Mongo external synchronization depth policy', () => {
      it('accepts external folder twenty and files within it, rejects twenty-one and mixed manual batches', async () => {
        const scope = { teamId: owner.teamId, tmbId: owner.tmbId, datasetId };
        let parentId: Types.ObjectId | null = null;
        for (let depth = 1; depth <= 20; depth++) {
          const _id = new Types.ObjectId();
          const apiFileId = `external-${depth}`;
          expect(
            await bulkInsertFolderCollections({
              ...scope,
              docs: [
                { _id, name: name(), type: DatasetCollectionTypeEnum.folder, apiFileId, parentId }
              ]
            })
          ).toEqual({ successApiFileIds: [apiFileId], failedApiFileIds: [] });
          parentId = _id;
        }
        const dataset = await MongoDataset.findById(datasetId).lean();
        const result = await createApiFileCollectionsBatch({
          dataset: dataset!,
          files: [
            { name: name(), apiFileId: 'external-file-at-twenty', parentId: String(parentId) }
          ],
          createCollectionParams: { ...scope, type: DatasetCollectionTypeEnum.apiFile }
        });
        expect(result.collectionIds).toHaveLength(1);
        expect(
          String((await MongoDatasetCollection.findById(result.collectionIds[0]).lean())?.parentId)
        ).toBe(String(parentId));
        const overflowId = new Types.ObjectId();
        expect(
          await bulkInsertFolderCollections({
            ...scope,
            docs: [
              {
                _id: overflowId,
                name: name(),
                type: DatasetCollectionTypeEnum.folder,
                apiFileId: 'external-21',
                parentId
              }
            ]
          })
        ).toEqual({ successApiFileIds: [], failedApiFileIds: ['external-21'] });
        expect(await MongoDatasetCollection.countDocuments({ _id: overflowId })).toBe(0);
        await expect(
          createCollections({
            collections: [
              {
                ...scope,
                name: 'mixed-external-integration',
                type: DatasetCollectionTypeEnum.apiFile,
                apiFileId: 'mixed-api',
                parentId: String(parentId)
              },
              {
                ...scope,
                name: 'mixed-manual-integration',
                type: DatasetCollectionTypeEnum.virtual,
                parentId: String(parentId)
              }
            ]
          })
        ).rejects.toBe(CommonErrEnum.folderDepthLimit);
        expect(
          await MongoDatasetCollection.countDocuments({
            name: { $in: ['mixed-external-integration', 'mixed-manual-integration'] }
          })
        ).toBe(0);
        rejected(
          await create({
            family: families[3],
            parentId: String(parentId),
            extra: { apiFileId: 'forged', maxDepth: 20 }
          })
        );
      });
    });

    for (const family of families.filter(({ path }) => path))
      describe(`HTTP ${family.label} traversal ceiling`, () => {
        it('returns at most twenty distinct breadcrumb nodes for historical depth twenty-two', async () => {
          const ids = await chain({ family, depth: 22, historical: true });
          const result = await read({ family, id: ids[21] });
          expect(result.code, result.message).toBe(200);
          const pathIds = result.data.map((item: { parentId: string }) => item.parentId);
          expect(pathIds).toEqual(ids.slice(-20));
          expect(new Set(pathIds).size).toBe(20);
        });
      });
  }
);
