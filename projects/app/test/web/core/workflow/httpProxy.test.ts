import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import {
  storeNode2FlowNode,
  filterSensitiveNodesData
} from '../../../../src/web/core/workflow/utils';
import type { TFunction } from 'next-i18next';

const t = ((key: string) => key) as TFunction;

const httpNode = (proxyValue?: unknown): StoreNodeItemType => ({
  nodeId: 'http',
  name: 'HTTP',
  flowNodeType: FlowNodeTypeEnum.httpRequest468,
  inputs: HttpNode468.inputs.flatMap((input) =>
    input.key === NodeInputKeyEnum.httpProxy
      ? proxyValue === undefined
        ? []
        : [{ ...input, value: proxyValue }]
      : [{ ...input }]
  ),
  outputs: []
});

describe('HTTP proxy editor persistence and export', () => {
  it('adds the optional password input to existing HTTP nodes without changing saved values', () => {
    const legacyNode = httpNode();
    const before = structuredClone(legacyNode);
    const rendered = storeNode2FlowNode({ item: legacyNode, t });
    const proxy = rendered.data.inputs.find((input) => input.key === NodeInputKeyEnum.httpProxy);
    expect(proxy).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.password],
      required: false
    });
    expect(proxy?.value).toBeUndefined();
    expect(legacyNode).toEqual(before);
  });

  it('preserves the encrypted proxy wrapper when reopening a saved HTTP node', () => {
    const proxyValue = { secret: 'encrypted-proxy' };
    const rendered = storeNode2FlowNode({ item: httpNode(proxyValue), t });
    expect(
      rendered.data.inputs.find((input) => input.key === NodeInputKeyEnum.httpProxy)?.value
    ).toEqual(proxyValue);
  });

  it('omits proxy values and defaults from exports and keeps the original workflow intact', () => {
    const node = httpNode({ value: 'http://user:private@proxy.test:8080' });
    node.inputs.find((input) => input.key === NodeInputKeyEnum.httpProxy)!.defaultValue = {
      secret: 'encrypted-default'
    };
    const before = structuredClone(node);
    const exported = filterSensitiveNodesData([node]);
    expect(
      exported[0].inputs.find((input) => input.key === NodeInputKeyEnum.httpProxy)
    ).toMatchObject({ value: undefined, defaultValue: undefined });
    expect(JSON.stringify(exported)).not.toContain('private');
    expect(node).toEqual(before);
  });

  it('retains same-named business inputs on other node types', () => {
    const node = { ...httpNode({ value: 'business-value' }), flowNodeType: FlowNodeTypeEnum.code };
    expect(
      filterSensitiveNodesData([node])[0].inputs.find(
        (input) => input.key === NodeInputKeyEnum.httpProxy
      )?.value
    ).toEqual({ value: 'business-value' });
  });
});
