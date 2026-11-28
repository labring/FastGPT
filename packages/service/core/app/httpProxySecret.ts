import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ReferenceValueSchema } from '@fastgpt/global/common/secret/type';
import { parseSecretValue } from '@fastgpt/global/common/secret/utils';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { encryptSecretValue } from '../../common/secret/utils';
import { cloneDeep } from 'lodash-es';
import { nodeInputIsReference } from '@fastgpt/global/common/workflow/reference';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDerivedKey } from '../../common/secret/aes256gcm';
import z from 'zod';

/** 密码控件仅用此掩码表示保留已配置值，真实密文不返回编辑客户端。 */
export const HTTP_PROXY_CONFIGURED = '__fastgpt_http_proxy_configured__';
const REFERENCE_PREFIX = `${HTTP_PROXY_CONFIGURED}.`;
const ProxySourceSchema = z.object({
  appId: z.string(),
  versionId: z.string(),
  nodeId: z.string(),
  field: z.enum(['value', 'defaultValue']),
  fingerprint: z.string()
});
type ProxySource = z.infer<typeof ProxySourceSchema>;

/** 签名只覆盖来源标识及不可逆指纹，不向客户端返回凭据或数据库密文。 */
const signProxySource = (value: string) =>
  createHmac('sha256', getDerivedKey()).update('http-proxy-source-v1:').update(value).digest('hex');
const isConfigured = (value: unknown): value is { secret: string } =>
  typeof value === 'object' &&
  value !== null &&
  'secret' in value &&
  typeof value.secret === 'string' &&
  (value.secret === HTTP_PROXY_CONFIGURED || value.secret.startsWith(REFERENCE_PREFIX));
/** 拒绝篡改的来源引用；版本读取仍须按已鉴权的 appId 限定。 */
const readProxySource = (secret: string): ProxySource => {
  // 旧编辑器的通用掩码没有来源信息，必须刷新详情；不能猜测为当前草稿。
  if (secret === HTTP_PROXY_CONFIGURED)
    throw new UserConfigError('Reload the HTTP proxy configuration before saving or testing');
  try {
    const [payload, signature, extra] = secret.slice(REFERENCE_PREFIX.length).split('.');
    const expected = Buffer.from(signProxySource(payload), 'hex');
    const supplied = Buffer.from(signature ?? '', 'hex');
    if (
      extra ||
      !/^[a-f0-9]{64}$/.test(signature ?? '') ||
      supplied.length !== expected.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw new Error();
    return ProxySourceSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    throw new UserConfigError('Invalid HTTP proxy configuration reference');
  }
};

type ProxyNode = {
  nodeId: string;
  flowNodeType: FlowNodeTypeEnum;
  inputs: (Pick<FlowNodeInputItemType, 'key' | 'value' | 'defaultValue'> &
    Partial<Pick<FlowNodeInputItemType, 'renderTypeList' | 'selectedType'>>)[];
};

/** 调试仅在包含已配置掩码时加载已鉴权应用的草稿，普通请求不增加版本读取。 */
export const hasConfiguredHttpProxy = (nodes: ProxyNode[]) =>
  nodes.some(
    (node) =>
      node.flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
      node.inputs.some(
        (input) =>
          input.key === NodeInputKeyEnum.httpProxy &&
          (isConfigured(input.value) || isConfigured(input.defaultValue))
      )
  );

/** 服务端写入边界按节点身份规范化代理凭据，不依赖可被导入数据省略的密码 renderType。 */
export const formatHttpProxySecrets = ({
  nodes,
  allowConfigured = false,
  project = false,
  source,
  references
}: {
  nodes: ProxyNode[];
  allowConfigured?: boolean;
  project?: boolean;
  source?: { appId: string; versionId: string };
  references?: ProxyNode[];
}) => {
  for (const node of nodes) {
    if (node.flowNodeType !== FlowNodeTypeEnum.httpRequest468) continue;
    for (const input of node.inputs) {
      if (input.key !== NodeInputKeyEnum.httpProxy) continue;
      // 导入数据可能缺少密码类型并被通用迁移标成 reference；只有合法引用可跳过凭据处理。
      const reference =
        nodeInputIsReference(input) && ReferenceValueSchema.safeParse(input.value).success;
      if (!reference) {
        input.renderTypeList = [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.reference];
        input.selectedType = FlowNodeInputTypeEnum.password;
      }
      for (const key of ['value', 'defaultValue'] as const) {
        if (key === 'value' && reference) continue;
        const originalReference = references
          ?.find((item) => item.nodeId === node.nodeId && item.flowNodeType === node.flowNodeType)
          ?.inputs.find((item) => item.key === input.key)?.[key];
        if (project && isConfigured(originalReference)) {
          input[key] = cloneDeep(originalReference);
          continue;
        }
        const raw = input[key];
        if (raw === undefined) continue;
        if (raw === null) {
          // 显式清空不能回退到仍存在的代理默认值。
          input[key] = key === 'value' ? { value: '' } : undefined;
          continue;
        }
        const value = parseSecretValue(typeof raw === 'string' ? { value: raw } : raw);
        if (!value) throw new UserConfigError('Invalid HTTP proxy credential');
        if ('ref' in value) {
          input[key] = value;
          continue;
        }
        const configured = isConfigured(value);
        if (configured && !allowConfigured && !project) {
          throw new UserConfigError(
            'HTTP proxy configuration must be replaced when creating an app'
          );
        }
        if (project && !('value' in value && value.value === '')) {
          if (configured) continue;
          const payload = source
            ? Buffer.from(
                JSON.stringify({
                  ...source,
                  nodeId: node.nodeId,
                  field: key,
                  fingerprint: signProxySource(JSON.stringify(value))
                } satisfies ProxySource)
              ).toString('base64url')
            : undefined;
          input[key] = {
            secret: payload
              ? `${REFERENCE_PREFIX}${payload}.${signProxySource(payload)}`
              : HTTP_PROXY_CONFIGURED
          };
        } else input[key] = encryptSecretValue(value);
      }
    }
  }
};

/** 按签名指定的版本及字段恢复代理；替换和显式清空保持原值，不把来源引用写入数据库。 */
export const restoreHttpProxySecrets = <T extends ProxyNode[]>({
  nodes,
  appId,
  versions = new Map<string, ProxyNode[]>()
}: {
  nodes: T;
  appId?: string;
  versions?: Map<string, ProxyNode[]>;
}): T => {
  const restored = cloneDeep(nodes);
  for (const node of restored) {
    if (node.flowNodeType !== FlowNodeTypeEnum.httpRequest468) continue;
    for (const input of node.inputs) {
      if (input.key !== NodeInputKeyEnum.httpProxy) continue;
      for (const key of ['value', 'defaultValue'] as const) {
        if (!isConfigured(input[key])) continue;
        const source = readProxySource(input[key].secret);
        if (source.appId !== appId || source.nodeId !== node.nodeId || source.field !== key)
          throw new UserConfigError('HTTP proxy configuration reference does not match this field');
        const oldNode = versions.get(source.versionId)?.find((item) => item.nodeId === node.nodeId);
        const value =
          oldNode?.flowNodeType === FlowNodeTypeEnum.httpRequest468
            ? oldNode.inputs.find((item) => item.key === input.key)?.[key]
            : undefined;
        if (
          value === undefined ||
          value === null ||
          isConfigured(value) ||
          signProxySource(
            JSON.stringify(parseSecretValue(typeof value === 'string' ? { value } : value))
          ) !== source.fingerprint
        ) {
          throw new UserConfigError(
            'HTTP proxy configuration is no longer available; replace or clear it'
          );
        }
        input[key] = cloneDeep(value);
      }
    }
  }
  formatHttpProxySecrets({ nodes: restored });
  return restored;
};

/** 保存和调试共用来源解析入口；按应用及版本批量读取，事务重试不会误用另一个草稿。 */
export const resolveHttpProxySecrets = async <T extends ProxyNode[]>({
  nodes,
  appId,
  readVersions
}: {
  nodes: T;
  appId: string;
  readVersions: (versionIds: string[]) => Promise<{ _id: string; nodes: ProxyNode[] }[]>;
}): Promise<T> => {
  const versionIds = new Set<string>();
  for (const node of nodes) {
    if (node.flowNodeType !== FlowNodeTypeEnum.httpRequest468) continue;
    for (const input of node.inputs) {
      if (input.key !== NodeInputKeyEnum.httpProxy) continue;
      for (const key of ['value', 'defaultValue'] as const) {
        if (!isConfigured(input[key])) continue;
        const source = readProxySource(input[key].secret);
        if (source.appId !== appId || source.nodeId !== node.nodeId || source.field !== key)
          throw new UserConfigError('HTTP proxy configuration reference does not match this field');
        versionIds.add(source.versionId);
      }
    }
  }
  const versions = new Map<string, ProxyNode[]>();
  if (versionIds.size) {
    for (const version of await readVersions([...versionIds]))
      versions.set(String(version._id), version.nodes);
  }
  return restoreHttpProxySecrets({ nodes, appId, versions });
};
