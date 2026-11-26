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

/** 密码控件仅用此掩码表示保留已配置值，真实密文不返回编辑客户端。 */
export const HTTP_PROXY_CONFIGURED = '__fastgpt_http_proxy_configured__';

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
          (input.value?.secret === HTTP_PROXY_CONFIGURED ||
            input.defaultValue?.secret === HTTP_PROXY_CONFIGURED)
      )
  );

/** 服务端写入边界按节点身份规范化代理凭据，不依赖可被导入数据省略的密码 renderType。 */
export const formatHttpProxySecrets = ({
  nodes,
  allowConfigured = false,
  project = false
}: {
  nodes: ProxyNode[];
  allowConfigured?: boolean;
  project?: boolean;
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
        const configured = 'secret' in value && value.secret === HTTP_PROXY_CONFIGURED;
        if (configured && !allowConfigured && !project) {
          throw new UserConfigError(
            'HTTP proxy configuration must be replaced when creating an app'
          );
        }
        input[key] =
          project && !('value' in value && value.value === '')
            ? { secret: HTTP_PROXY_CONFIGURED }
            : encryptSecretValue(value);
      }
    }
  }
};

/** 事务内使用同一草稿恢复未修改的代理；替换和显式清空保持原值，不把掩码写入数据库。 */
export const restoreHttpProxySecrets = <T extends ProxyNode[]>({
  nodes,
  baseline = []
}: {
  nodes: T;
  baseline?: ProxyNode[];
}): T => {
  const restored = cloneDeep(nodes);
  const previous = new Map(baseline.map((node) => [node.nodeId, node]));
  for (const node of restored) {
    if (node.flowNodeType !== FlowNodeTypeEnum.httpRequest468) continue;
    for (const input of node.inputs) {
      if (input.key !== NodeInputKeyEnum.httpProxy) continue;
      for (const key of ['value', 'defaultValue'] as const) {
        if (input[key]?.secret !== HTTP_PROXY_CONFIGURED) continue;
        const oldNode = previous.get(node.nodeId);
        const value =
          oldNode?.flowNodeType === FlowNodeTypeEnum.httpRequest468
            ? oldNode.inputs.find((item) => item.key === input.key)?.[key]
            : undefined;
        if (value === undefined || value === null || value?.secret === HTTP_PROXY_CONFIGURED) {
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
