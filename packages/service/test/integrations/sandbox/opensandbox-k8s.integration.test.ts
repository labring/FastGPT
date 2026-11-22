import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { S3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';
import {
  ORPHAN_VOLUME_GRACE_PERIOD_MS,
  SandboxInstanceStatusEnum
} from '@fastgpt/service/core/ai/sandbox/constants';
import { archiveSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/archive';
import {
  reconcileOrphanSandboxResources,
  reconcileOrphanSandboxVolumes
} from '@fastgpt/service/core/ai/sandbox/application/resource';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import type { SandboxClientQuery } from '@fastgpt/service/core/ai/sandbox/application/runtime/type';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  createRuntimeOpenSandboxClient,
  disconnectSandbox
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';
import { getVolumeManagerEnvConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/config';
import {
  deleteSessionVolume,
  ensureSessionVolume,
  getOrphanVolumeMarkerKey,
  getSessionVolumeClaimName,
  listSessionVolumes
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getSandboxIntegrationProvider } from './config';
import { cleanupAppSandbox } from './fixtures';

const { Types } = connectionMongo;
const integrationProvider = getSandboxIntegrationProvider();
const k8sSshHost = process.env.SANDBOX_K8S_SSH_HOST?.trim();
const k8sNamespace = process.env.SANDBOX_K8S_NAMESPACE?.trim() || 'opensandbox';
const canRunK8sIntegration =
  integrationProvider === 'opensandbox' &&
  process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'kubernetes' &&
  Boolean(k8sSshHost || process.env.SANDBOX_K8S_LOCAL_KUBECTL === 'true');

/** 在目标 Kubernetes 集群（本地 kubectl 或通过 SSH 隧道）执行 kubectl 命令。 */
const runKubectl = (args: string[], input?: string): string => {
  const fullArgs = ['-n', k8sNamespace, ...args];
  if (k8sSshHost) {
    const escaped = fullArgs.map((arg) => `'${arg.replaceAll("'", `'\\''`)}'`).join(' ');
    return execFileSync('ssh', [k8sSshHost, `kubectl ${escaped}`], {
      input,
      encoding: 'utf8'
    });
  }
  return execFileSync('kubectl', fullArgs, {
    input,
    encoding: 'utf8'
  });
};

const kubectlJson = <T>(args: string[]): T => JSON.parse(runKubectl([...args, '-o', 'json'])) as T;

/** 将 Kubernetes CPU 数量字符串换算为毫核，便于精确比较超售比例。 */
const parseCpuMillicores = (raw?: string): number => {
  if (!raw) return 0;
  if (raw.endsWith('m')) return Number(raw.slice(0, -1));
  return Math.round(Number(raw) * 1000);
};

/** 将 Kubernetes 内存数量字符串换算为 MiB，兼容 Gi/Mi 格式。 */
const parseMemoryMiB = (raw?: string): number => {
  if (!raw) return 0;
  if (raw.endsWith('Gi')) return Math.round(Number(raw.slice(0, -2)) * 1024);
  if (raw.endsWith('Mi')) return Number(raw.slice(0, -2));
  if (raw.endsWith('G')) return Math.round((Number(raw.slice(0, -1)) * 1000 ** 3) / 1024 ** 2);
  if (raw.endsWith('M')) return Math.round((Number(raw.slice(0, -1)) * 1000 ** 2) / 1024 ** 2);
  return Math.round(Number(raw) / 1024 ** 2);
};

const createAppQuery = async (
  label: string
): Promise<{ query: SandboxClientQuery; teamId: string }> => {
  const teamId = new Types.ObjectId().toString();
  const app = await MongoApp.create({
    name: `OpenSandbox K8s ${label}`,
    type: AppTypeEnum.simple,
    teamId: new Types.ObjectId(teamId),
    tmbId: new Types.ObjectId(),
    modules: []
  });
  const sourceId = String(app._id);
  const userId = `k8s-user-${randomUUID()}`;
  return {
    teamId,
    query: {
      sandboxId: getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId
      }),
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      userId,
      chatId: `k8s-chat-${randomUUID()}`
    }
  };
};

type K8sPodList = {
  items: Array<{
    metadata: { name: string; uid?: string; labels?: Record<string, string> };
    spec: {
      securityContext?: { fsGroup?: number };
      volumes?: Array<{ name: string; persistentVolumeClaim?: { claimName: string } }>;
      containers: Array<{
        name: string;
        image: string;
        resources?: {
          limits?: Record<string, string>;
          requests?: Record<string, string>;
        };
        volumeMounts?: Array<{ name: string; mountPath: string }>;
      }>;
    };
    status: { phase?: string; hostIP?: string };
  }>;
};

type K8sPvc = {
  metadata: {
    name: string;
    uid?: string;
    labels?: Record<string, string>;
    deletionTimestamp?: string;
    finalizers?: string[];
  };
  spec: {
    accessModes?: string[];
    storageClassName?: string;
    volumeName?: string;
    resources?: { requests?: { storage?: string } };
  };
  status: { phase?: string };
};

describe
  .skipIf(!canRunK8sIntegration)
  .sequential('OpenSandbox Kubernetes Cluster Integration', () => {
    let baseSystemConfig: typeof global.systemInstanceConfig;
    const originalSandboxBucket = global.sandboxBucket;
    let s3Sandbox: S3SandboxSource;
    const cleanupTasks: Array<() => Promise<void>> = [];

    const applyK8sSystemConfig = (overrides?: {
      storageSizeGi?: number;
      cpuOvercommitFactor?: number;
      memoryOvercommitFactor?: number;
    }) => {
      const baseAgentSandbox = baseSystemConfig?.subservice.agentSandbox;
      global.systemInstanceConfig = resolveSystemInstanceConfig({
        subservice: {
          agentSandbox: {
            enabled: true,
            proxy: baseAgentSandbox?.proxy,
            common: {
              ...baseAgentSandbox?.common,
              cpuCount: 1,
              memoryMiB: 2048,
              storageSizeGi: overrides?.storageSizeGi ?? 2
            },
            opensandbox: {
              ...baseAgentSandbox?.opensandbox,
              runtime: 'kubernetes',
              cpuOvercommitFactor: overrides?.cpuOvercommitFactor ?? 2,
              memoryOvercommitFactor: overrides?.memoryOvercommitFactor ?? 2
            }
          }
        }
      });
    };

    beforeAll(async () => {
      baseSystemConfig = global.systemInstanceConfig;

      s3Sandbox = new S3SandboxSource();
      await s3Sandbox.client.ensureBucket();
      global.sandboxBucket = s3Sandbox;
    });

    afterEach(async () => {
      global.systemInstanceConfig = baseSystemConfig;
      while (cleanupTasks.length > 0) {
        const task = cleanupTasks.pop()!;
        await task().catch(() => undefined);
      }
    });

    afterAll(async () => {
      global.systemInstanceConfig = baseSystemConfig;
      global.sandboxBucket = originalSandboxBucket;
    });

    it('enforces K8s Pod limits/requests overcommit, omits ephemeral-storage, mounts PVC at /home/sandbox, fsGroup=10001, PVC labels, and no egress sidecar', async () => {
      applyK8sSystemConfig({
        storageSizeGi: 2,
        cpuOvercommitFactor: 2,
        memoryOvercommitFactor: 2
      });

      const { query } = await createAppQuery('pod-spec-overcommit');
      cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

      const client = await getSandboxClient(query);
      expect((await client.exec('id -u')).stdout.trim()).toBe('10001');
      await client.exec('printf "k8s-spec-ok" > /home/sandbox/workspace/spec.txt');
      expect((await client.exec('cat /home/sandbox/workspace/spec.txt')).stdout).toBe(
        'k8s-spec-ok'
      );
      // 兼容软链 `/workspace -> /home/sandbox/workspace` 保持可读
      expect((await client.exec('cat /workspace/spec.txt')).stdout).toBe('k8s-spec-ok');

      const doc = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
      expect(doc?.instanceId).toBeTruthy();
      const claimName = getSessionVolumeClaimName(doc?.storage)!;
      expect(claimName).toBeTruthy();

      const podList = kubectlJson<K8sPodList>([
        'get',
        'pods',
        '-l',
        `opensandbox.io/id=${doc!.instanceId}`
      ]);
      expect(podList.items.length).toBe(1);
      const pod = podList.items[0];
      expect(pod.spec.securityContext?.fsGroup).toBe(10001);

      // K8s 模式应由 CiliumNetworkPolicy 管控，不应注入 egress sidecar 容器
      const containerNames = pod.spec.containers.map((c) => c.name);
      expect(containerNames).not.toContain('egress');

      const mainContainer =
        pod.spec.containers.find((c) => c.image.includes('fastgpt-agent-sandbox')) ??
        pod.spec.containers[0];
      expect(mainContainer).toBeTruthy();
      expect(parseCpuMillicores(mainContainer.resources?.limits?.cpu)).toBe(1000);
      expect(parseCpuMillicores(mainContainer.resources?.requests?.cpu)).toBe(500);
      expect(parseMemoryMiB(mainContainer.resources?.limits?.memory)).toBe(2048);
      expect(parseMemoryMiB(mainContainer.resources?.requests?.memory)).toBe(1024);
      // 容器临时盘交由 Kubernetes 集群策略管理，FastGPT 不再下发 ephemeral-storage
      expect(mainContainer.resources?.limits?.['ephemeral-storage']).toBeUndefined();
      expect(mainContainer.resources?.requests?.['ephemeral-storage']).toBeUndefined();

      const pvcMount = mainContainer.volumeMounts?.find((m) => m.mountPath === '/home/sandbox');
      expect(pvcMount).toBeTruthy();
      const boundVol = pod.spec.volumes?.find((v) => v.name === pvcMount!.name);
      expect(boundVol?.persistentVolumeClaim?.claimName).toBe(claimName);

      const pvc = kubectlJson<K8sPvc>(['get', 'pvc', claimName]);
      expect(pvc.metadata.labels?.app).toBe('fastgpt');
      expect(pvc.metadata.labels?.['managed-by']).toBe('fastgpt-volume-manager');
      expect(pvc.spec.accessModes).toContain('ReadWriteOnce');
      expect(pvc.spec.resources?.requests?.storage).toBe('2Gi');
      expect(pvc.status.phase).toBe('Bound');

      await client.opensandbox.close();
    });

    it('preserves local-path PV ($HOME + workspace) across stop/resume and cold-restores from RustFS .tar.zst when PVC is deleted', async () => {
      applyK8sSystemConfig({
        storageSizeGi: 1,
        cpuOvercommitFactor: 1,
        memoryOvercommitFactor: 1
      });

      const { query } = await createAppQuery('pvc-stop-resume-cold');
      cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

      const client1 = await getSandboxClient(query);
      await client1.exec(
        'printf "persist-on-local-path-pv" > /home/sandbox/workspace/pv-check.txt && printf "home-dot-ok" > /home/sandbox/.custom-home-rc && mkdir -p /home/sandbox/workspace/node_modules/pkg && printf "cache-kept" > /home/sandbox/workspace/node_modules/pkg/index.js'
      );
      const doc1 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
      const firstInstanceId = doc1!.instanceId!;
      const firstClaimName = getSessionVolumeClaimName(doc1?.storage)!;
      const pvcBeforeStop = kubectlJson<K8sPvc>(['get', 'pvc', firstClaimName]);
      expect(pvcBeforeStop.status.phase).toBe('Bound');
      const pvName = pvcBeforeStop.spec.volumeName;
      expect(pvName).toBeTruthy();

      await client1.stop();
      // 停止后 BatchSandbox/Pod 已被回收，但 PVC 与底层 PV 必须保持 Bound
      const podsAfterStop = kubectlJson<K8sPodList>([
        'get',
        'pods',
        '-l',
        `opensandbox.io/id=${firstInstanceId}`
      ]);
      expect(podsAfterStop.items.length).toBe(0);
      const pvcAfterStop = kubectlJson<K8sPvc>(['get', 'pvc', firstClaimName]);
      expect(pvcAfterStop.status.phase).toBe('Bound');
      expect(pvcAfterStop.spec.volumeName).toBe(pvName);

      // 恢复运行：新 Pod 挂载同一 PVC 与 PV
      const client2 = await getSandboxClient(query);
      expect((await client2.exec('cat /home/sandbox/workspace/pv-check.txt')).stdout).toBe(
        'persist-on-local-path-pv'
      );
      expect((await client2.exec('cat /home/sandbox/.custom-home-rc')).stdout).toBe('home-dot-ok');
      const doc2 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
      expect(doc2!.instanceId).not.toBe(firstInstanceId);
      expect(getSessionVolumeClaimName(doc2?.storage)).toBe(firstClaimName);
      await client2.opensandbox.close();

      // 归档至 RustFS .tar.zst 并模拟彻底删除旧 Pod/PVC，再冷启动恢复到新代次 PVC
      const archiveRes = await archiveSandboxResource(doc2!);
      expect(archiveRes.status).toBe('success');

      const docArchived = await MongoSandboxInstance.findOne({
        sandboxId: query.sandboxId
      }).lean();
      expect(docArchived?.status).toBe(SandboxInstanceStatusEnum.archived);
      expect(docArchived?.storage?.archive?.format).toBe('tar.zst');
      expect(docArchived?.storage?.archive?.objectKey).toMatch(/\.tar\.zst$/);
      expect(await s3Sandbox.isObjectExists(docArchived!.storage!.archive!.objectKey!)).toBe(true);
      const pvcLeftovers = runKubectl([
        'get',
        'pvc',
        firstClaimName,
        '--ignore-not-found',
        '-o',
        'name'
      ]).trim();
      expect(pvcLeftovers).toBe('');

      const client3 = await getSandboxClient(query);
      expect((await client3.exec('cat /home/sandbox/workspace/pv-check.txt')).stdout).toBe(
        'persist-on-local-path-pv'
      );
      expect((await client3.exec('cat /home/sandbox/.custom-home-rc')).stdout).toBe('home-dot-ok');
      expect(
        (await client3.exec('cat /home/sandbox/workspace/node_modules/pkg/index.js')).stdout
      ).toBe('cache-kept');
      const docRestored = await MongoSandboxInstance.findOne({
        sandboxId: query.sandboxId
      }).lean();
      const restoredClaimName = getSessionVolumeClaimName(docRestored?.storage)!;
      expect(restoredClaimName).toBeTruthy();
      expect(restoredClaimName).not.toBe(firstClaimName);
      await client3.opensandbox.close();
    });

    it('blocks private/cluster/metadata CIDRs via CiliumNetworkPolicy while preserving CoreDNS', async () => {
      applyK8sSystemConfig();
      const { query } = await createAppQuery('cilium-egress');
      cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

      const client = await getSandboxClient(query);
      const doc = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
      expect(doc?.instanceId).toBeTruthy();

      // 从当前集群动态解析宿主机节点 IP（kubelet 10250 端口）与 volume-manager ClusterIP，避免硬编码环境 IP
      const podList = kubectlJson<K8sPodList>([
        'get',
        'pods',
        '-l',
        `opensandbox.io/id=${doc!.instanceId}`
      ]);
      const hostIp = podList.items[0]?.status.hostIP;
      expect(hostIp).toBeTruthy();

      const vmService = kubectlJson<{
        spec?: { clusterIP?: string; ports?: Array<{ port?: number }> };
      }>(['get', 'svc', 'fastgpt-volume-manager']);
      const vmClusterIp = vmService.spec?.clusterIP;
      const vmPort = vmService.spec?.ports?.[0]?.port ?? 3005;
      expect(vmClusterIp).toBeTruthy();

      // 1. 节点私网宿主 IP（10250）、集群 ClusterIP（volume-manager）与云厂商 Metadata（169.254.0.0/16）必须全部被拦截
      const clusterIpUrl = `http://${vmClusterIp}:${vmPort}/health`;
      const probeScript = [
        'Promise.all([',
        `  new Promise((resolve) => { const s = require('node:net').connect({ host: ${JSON.stringify(hostIp)}, port: 10250 }); const t = setTimeout(() => { s.destroy(); resolve('BLOCKED:nodeip'); }, 2500); s.on('connect', () => { clearTimeout(t); s.destroy(); resolve('OPEN:nodeip'); }); s.on('error', () => { clearTimeout(t); resolve('BLOCKED:nodeip'); }); }),`,
        `  fetch(${JSON.stringify(clusterIpUrl)},{signal:AbortSignal.timeout(2500)}).then(()=>'OPEN:clusterip').catch(()=>'BLOCKED:clusterip'),`,
        "  fetch('http://169.254.169.254/latest/meta-data/',{signal:AbortSignal.timeout(2500)}).then(()=>'OPEN:metadata').catch(()=>'BLOCKED:metadata')",
        "]).then(r=>console.log(r.join('|')))"
      ].join('');
      const blockRes = await client.exec(`node -e ${JSON.stringify(probeScript)}`);
      expect(blockRes.stdout).toContain('BLOCKED:nodeip');
      expect(blockRes.stdout).toContain('BLOCKED:clusterip');
      expect(blockRes.stdout).toContain('BLOCKED:metadata');
      expect(blockRes.stdout).not.toContain('OPEN:');

      // 2. 验证 CoreDNS UDP/TCP 53 解析未被阻断
      const dnsRes = await client.exec(
        `node -e "require('node:dns/promises').lookup('example.com').then(r=>console.log('DNS_OK:'+r.address))"`
      );
      expect(dnsRes.stdout).toContain('DNS_OK:');

      await client.opensandbox.close();
    });

    it('enforces K8sVolumeDriver auth, ownership, legacy compat, Terminating wait, and two-phase orphan PVC/Pod GC', async () => {
      applyK8sSystemConfig();
      const vmConfig = getVolumeManagerEnvConfig();
      const prefix = vmConfig.volumeNamePrefix.toLowerCase();
      const suffix = randomUUID().slice(0, 8);
      const foreignPvc = `${prefix}-foreign-${suffix}-0`;
      const unlabeledPvc = `${prefix}-unlabeled-${suffix}`;
      const terminatingPvc = `${prefix}-terminating-${suffix}-0`;
      const orphanSandboxId = `app-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
      const orphanManagedPvc = `${prefix}-${orphanSandboxId}-deadbeef`;
      const orphanContainerSession = `app-${randomUUID().replaceAll('-', '').slice(0, 16)}`;

      const orphanRef: { client?: ReturnType<typeof createRuntimeOpenSandboxClient> } = {};

      cleanupTasks.push(async () => {
        if (orphanRef.client) {
          await orphanRef.client.delete().catch(() => undefined);
          await disconnectSandbox(orphanRef.client);
        }
        for (const pvc of [foreignPvc, unlabeledPvc, terminatingPvc, orphanManagedPvc]) {
          await redisCacheAdapter.delete(getOrphanVolumeMarkerKey(pvc)).catch(() => undefined);
          try {
            runKubectl([
              'patch',
              'pvc',
              pvc,
              '--type=merge',
              '-p',
              '{"metadata":{"finalizers":null}}'
            ]);
          } catch {
            // ignore
          }
          try {
            runKubectl(['delete', 'pvc', pvc, '--ignore-not-found']);
          } catch {
            // ignore
          }
        }
      });

      // 1. volume-manager 鉴权与入参校验
      expect((await fetch(`${vmConfig.url}/v1/volumes`)).status).toBe(401);
      expect(
        (
          await fetch(`${vmConfig.url}/v1/volumes`, {
            headers: { Authorization: 'Bearer wrong-vm-token' }
          })
        ).status
      ).toBe(401);
      expect(
        (
          await fetch(`${vmConfig.url}/v1/volumes/ensure`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${vmConfig.token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ claimName: 'INVALID_UPPER_CASE' })
          })
        ).status
      ).toBe(400);

      // 2. 创建带外部所有权标签的 PVC 与无标签存量 PVC，验证越权保护与 legacy 接管开关
      const storageClass = runKubectl([
        'get',
        'deployment',
        'fastgpt-volume-manager',
        '-o',
        'jsonpath={.spec.template.spec.containers[0].env[?(@.name=="VM_K8S_PVC_STORAGE_CLASS")].value}'
      ]).trim();

      const applyPvcManifest = (name: string, labels?: Record<string, string>) => {
        const manifest = JSON.stringify({
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          metadata: {
            name,
            namespace: k8sNamespace,
            ...(labels ? { labels } : {})
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: { requests: { storage: '1Gi' } },
            ...(storageClass ? { storageClassName: storageClass } : {})
          }
        });
        runKubectl(['apply', '-f', '-'], manifest);
      };

      applyPvcManifest(foreignPvc, { 'helm.sh/chart': 'external-stack' });
      applyPvcManifest(unlabeledPvc);

      await expect(ensureSessionVolume(foreignPvc, { allowLegacyUnlabeled: true })).rejects.toThrow(
        /missing fastgpt-volume-manager ownership labels|volume-manager/
      );
      await expect(deleteSessionVolume(foreignPvc, { allowLegacyUnlabeled: true })).rejects.toThrow(
        /missing fastgpt-volume-manager ownership labels|volume-manager/
      );

      await expect(ensureSessionVolume(unlabeledPvc)).rejects.toThrow(
        /missing fastgpt-volume-manager ownership labels|volume-manager/
      );
      await expect(ensureSessionVolume(unlabeledPvc, { allowLegacyUnlabeled: true })).resolves.toBe(
        unlabeledPvc
      );
      await expect(deleteSessionVolume(unlabeledPvc)).rejects.toThrow(
        /missing fastgpt-volume-manager ownership labels|volume-manager/
      );
      await expect(
        deleteSessionVolume(unlabeledPvc, { allowLegacyUnlabeled: true })
      ).resolves.toBeUndefined();

      // 3. Terminating PVC 代次等待与删除前置 UID 校验
      await ensureSessionVolume(terminatingPvc);
      const firstGenPvc = kubectlJson<K8sPvc>(['get', 'pvc', terminatingPvc]);
      expect(firstGenPvc.metadata.uid).toBeTruthy();

      runKubectl([
        'patch',
        'pvc',
        terminatingPvc,
        '--type=merge',
        '-p',
        '{"metadata":{"finalizers":["fastgpt.test/hold"]}}'
      ]);
      // 先触发后台异步删除使 PVC 进入 Terminating 状态（kubernetes 默认保护锁外还多一层测试 finalizer）
      runKubectl(['delete', 'pvc', terminatingPvc, '--wait=false']);
      const deletingPvc = kubectlJson<K8sPvc>(['get', 'pvc', terminatingPvc]);
      expect(deletingPvc.metadata.deletionTimestamp).toBeTruthy();

      const recreatePromise = ensureSessionVolume(terminatingPvc);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      runKubectl([
        'patch',
        'pvc',
        terminatingPvc,
        '--type=merge',
        '-p',
        '{"metadata":{"finalizers":null}}'
      ]);
      await expect(recreatePromise).resolves.toBe(terminatingPvc);
      const secondGenPvc = kubectlJson<K8sPvc>(['get', 'pvc', terminatingPvc]);
      expect(secondGenPvc.metadata.uid).not.toBe(firstGenPvc.metadata.uid);
      await deleteSessionVolume(terminatingPvc);

      // 4. 两阶段孤儿 K8s PVC GC：第一轮写入 Redis 标记，30m 宽限期内保留，超过后删除，且外部 PVC 完好
      // 显式限定 claimNames，避免共享测试集群中的其他会话 PVC 被随机测试库误判回收。
      const volumeScope = { claimNames: new Set([orphanManagedPvc, foreignPvc]) };
      await ensureSessionVolume(orphanManagedPvc);
      expect(await listSessionVolumes()).toContain(orphanManagedPvc);

      const t0 = new Date();
      await reconcileOrphanSandboxVolumes({ now: t0, scope: volumeScope });
      expect(await redisCacheAdapter.get(getOrphanVolumeMarkerKey(orphanManagedPvc))).toBe(
        String(t0.getTime())
      );
      expect(await listSessionVolumes()).toContain(orphanManagedPvc);

      await reconcileOrphanSandboxVolumes({
        now: new Date(t0.getTime() + ORPHAN_VOLUME_GRACE_PERIOD_MS - 1000),
        scope: volumeScope
      });
      expect(await listSessionVolumes()).toContain(orphanManagedPvc);

      await reconcileOrphanSandboxVolumes({
        now: new Date(t0.getTime() + ORPHAN_VOLUME_GRACE_PERIOD_MS + 1000),
        scope: volumeScope
      });
      expect(await listSessionVolumes()).not.toContain(orphanManagedPvc);
      expect(runKubectl(['get', 'pvc', foreignPvc, '-o', 'name']).trim()).toBe(
        `persistentvolumeclaim/${foreignPvc}`
      );

      // 5. 两阶段孤儿 BatchSandbox / Pod 清理：制造无 Mongo 记录的受管沙盒，先观望，15m 后自动回收
      // 显式限定 sessionIds，避免共享控制面下的其他活跃会话被当作孤儿回收。
      const containerScope = { sessionIds: new Set([orphanContainerSession]) };
      const orphanClient = createRuntimeOpenSandboxClient({
        sandboxId: orphanContainerSession
      });
      orphanRef.client = orphanClient;
      await orphanClient.create();
      expect((await orphanClient.getInfo())?.status.state).toBe('Running');
      const orphanInstanceId = orphanClient.id!;

      await reconcileOrphanSandboxResources(new Date(), containerScope);
      expect((await orphanClient.getInfo())?.status.state).toBe('Running');

      await reconcileOrphanSandboxResources(new Date(Date.now() + 15 * 60_000), containerScope);
      // Kubernetes 异步终止 Pod，删除后短暂处于 Deleting，最终收敛为 UnExist 且 Pod 完全消失
      let finalState = (await orphanClient.getInfo())?.status.state ?? 'UnExist';
      expect(['Deleting', 'UnExist']).toContain(finalState);
      const deadline = Date.now() + 30_000;
      while (finalState !== 'UnExist' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        finalState = (await orphanClient.getInfo())?.status.state ?? 'UnExist';
      }
      expect(finalState).toBe('UnExist');
      const remainingPods = kubectlJson<K8sPodList>([
        'get',
        'pods',
        '-l',
        `opensandbox.io/id=${orphanInstanceId}`
      ]);
      expect(remainingPods.items.length).toBe(0);
    });
  });
