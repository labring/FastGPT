import { describe, expect, it } from 'vitest';
import {
  formatHttpProxySecrets,
  restoreHttpProxySecrets,
  HTTP_PROXY_CONFIGURED
} from '../../../core/app/httpProxySecret';
import { decryptSecretValue } from '../../../common/secret/utils';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const url = 'http://user:private@proxy.example.com:8080';
const nodes = (value: unknown, defaultValue?: unknown) => [
  {
    nodeId: 'http',
    flowNodeType: FlowNodeTypeEnum.httpRequest468,
    inputs: [{ key: NodeInputKeyEnum.httpProxy, value, defaultValue }]
  }
];

describe('HTTP proxy credential lifecycle', () => {
  it('preserves structured secret references and selected input references', () => {
    const data = nodes({ ref: ['global', 'proxy'] });
    formatHttpProxySecrets({ nodes: data, project: true });
    expect(data[0].inputs[0].value).toEqual({ ref: ['global', 'proxy'] });
    const selected = [
      {
        ...nodes(['global', 'proxy'])[0],
        inputs: [
          {
            key: NodeInputKeyEnum.httpProxy,
            value: ['global', 'proxy'],
            renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference
          }
        ]
      }
    ];
    formatHttpProxySecrets({ nodes: selected, project: true });
    expect(selected[0].inputs[0].value).toEqual(['global', 'proxy']);
  });
  it('encrypts imported strings and defaults even when password render metadata is missing', () => {
    const data = nodes(url, { value: url });
    formatHttpProxySecrets({ nodes: data });
    expect(JSON.stringify(data)).not.toContain('private');
    expect(decryptSecretValue(data[0].inputs[0].value)).toBe(url);
    expect(decryptSecretValue(data[0].inputs[0].defaultValue)).toBe(url);
  });
  it('projects only configured state and restores unchanged values from the current transaction baseline', () => {
    const stored = nodes(url, { value: url });
    formatHttpProxySecrets({ nodes: stored });
    const detail = structuredClone(stored);
    formatHttpProxySecrets({ nodes: detail, project: true });
    expect(detail[0].inputs[0].value).toEqual({ secret: HTTP_PROXY_CONFIGURED });
    expect(detail[0].inputs[0].defaultValue).toEqual({ secret: HTTP_PROXY_CONFIGURED });
    expect(JSON.stringify(detail)).not.toContain(JSON.stringify(stored[0].inputs[0].value));
    expect(restoreHttpProxySecrets({ nodes: detail, baseline: stored })).toEqual(stored);
    const latest = nodes({ value: 'http://new:updated@proxy.example.com' }, { value: url });
    formatHttpProxySecrets({ nodes: latest });
    expect(restoreHttpProxySecrets({ nodes: detail, baseline: latest })).toEqual(latest);
  });
  it.each([
    undefined,
    null,
    { value: '' },
    { value: 'http://replacement:secret@proxy.example.com' }
  ])('preserves explicit replacement or clearing: %j', (value) => {
    const restored = restoreHttpProxySecrets({ nodes: nodes(value), baseline: nodes(url) });
    expect(decryptSecretValue(restored[0].inputs[0].value)).toEqual(
      value === null ? '' : value && typeof value === 'object' ? value.value : value
    );
  });
  it('rejects configured markers without an owned baseline and when creating another app', () => {
    const data = nodes({ secret: HTTP_PROXY_CONFIGURED });
    expect(() => restoreHttpProxySecrets({ nodes: data })).toThrow('no longer available');
    expect(() => formatHttpProxySecrets({ nodes: data })).toThrow('creating an app');
  });
  it('does not treat same-key business fields on other node types as credentials', () => {
    const data = nodes(url);
    data[0].flowNodeType = FlowNodeTypeEnum.code;
    formatHttpProxySecrets({ nodes: data, project: true });
    expect(data[0].inputs[0].value).toBe(url);
  });
});
