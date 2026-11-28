import { createHmac } from 'node:crypto';
import { getDerivedKey } from '../../../common/secret/aes256gcm';
import z from 'zod';
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
  it('restores the selected historical version even when the latest draft changed or deleted the node', () => {
    const old = nodes({ value: url });
    formatHttpProxySecrets({ nodes: old });
    const detail = structuredClone(old);
    formatHttpProxySecrets({
      nodes: detail,
      project: true,
      source: { appId: 'app', versionId: 'old' }
    });
    const restored = restoreHttpProxySecrets({
      nodes: detail,
      appId: 'app',
      versions: new Map([
        ['old', old],
        ['latest', []]
      ])
    });
    expect(restored).toEqual(old);
  });
  it('rejects tampering, app/node/field substitution and a source version overwritten in place', () => {
    const old = nodes({ value: url });
    formatHttpProxySecrets({ nodes: old });
    const detail = structuredClone(old);
    formatHttpProxySecrets({
      nodes: detail,
      project: true,
      source: { appId: 'app', versionId: 'old' }
    });
    const versions = new Map([['old', old]]);
    expect(() => restoreHttpProxySecrets({ nodes: detail, appId: 'other', versions })).toThrow(
      'does not match'
    );
    const moved = structuredClone(detail);
    moved[0].nodeId = 'different-node';
    expect(() => restoreHttpProxySecrets({ nodes: moved, appId: 'app', versions })).toThrow(
      'does not match'
    );
    const altered = structuredClone(detail);
    altered[0].inputs[0].value = {
      secret: (detail[0].inputs[0].value as { secret: string }).secret + '0'
    };
    expect(() => restoreHttpProxySecrets({ nodes: altered, appId: 'app', versions })).toThrow(
      'Invalid'
    );
    const shifted = nodes(undefined, detail[0].inputs[0].value);
    expect(() => restoreHttpProxySecrets({ nodes: shifted, appId: 'app', versions })).toThrow(
      'does not match'
    );
    versions.set('old', nodes({ value: 'http://changed@proxy.example.com' }));
    expect(() => restoreHttpProxySecrets({ nodes: detail, appId: 'app', versions })).toThrow(
      'no longer available'
    );
  });
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
  it('projects source references and restores unchanged values from the selected snapshot', () => {
    const stored = nodes(url, { value: url });
    formatHttpProxySecrets({ nodes: stored });
    const detail = structuredClone(stored);
    formatHttpProxySecrets({
      nodes: detail,
      project: true,
      source: { appId: 'app', versionId: 'version' }
    });
    expect(
      (detail[0].inputs[0].value as { secret: string }).secret.startsWith(
        HTTP_PROXY_CONFIGURED + '.'
      )
    ).toBe(true);
    expect(JSON.stringify(detail)).not.toContain(JSON.stringify(stored[0].inputs[0].value));
    expect(
      restoreHttpProxySecrets({
        nodes: detail,
        appId: 'app',
        versions: new Map([['version', stored]])
      })
    ).toEqual(stored);
  });
  it.each([
    undefined,
    null,
    { value: '' },
    { value: 'http://replacement:secret@proxy.example.com' }
  ])('preserves explicit replacement or clearing: %j', (value) => {
    const restored = restoreHttpProxySecrets({ nodes: nodes(value) });
    expect(decryptSecretValue(restored[0].inputs[0].value)).toEqual(
      value === null ? '' : value && typeof value === 'object' ? value.value : value
    );
  });
  it('requires reloading legacy markers and rejects them when creating another app', () => {
    const data = nodes({ secret: HTTP_PROXY_CONFIGURED });
    expect(() => restoreHttpProxySecrets({ nodes: data })).toThrow('Reload');
    expect(() => formatHttpProxySecrets({ nodes: data })).toThrow('creating an app');
  });
  it('does not treat same-key business fields on other node types as credentials', () => {
    const data = nodes(url);
    data[0].flowNodeType = FlowNodeTypeEnum.code;
    formatHttpProxySecrets({ nodes: data, project: true });
    expect(data[0].inputs[0].value).toBe(url);
  });
});

/** 有效签名的未来字段允许旧解析器剔除，必填身份和签名本身仍必须校验。 */
describe('HTTP proxy signed source compatibility', () => {
  it('accepts extra signed source fields while restoring the same saved credential', () => {
    const stored = nodes({ value: url });
    formatHttpProxySecrets({ nodes: stored });
    const detail = structuredClone(stored);
    formatHttpProxySecrets({
      nodes: detail,
      project: true,
      source: { appId: 'app', versionId: 'version' }
    });
    const reference = z.object({ secret: z.string() }).parse(detail[0].inputs[0].value);
    const prefix = HTTP_PROXY_CONFIGURED + '.';
    const encoded = reference.secret.slice(prefix.length).split('.')[0];
    const payload = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(Buffer.from(encoded, 'base64url').toString()));
    const extended = Buffer.from(
      JSON.stringify({ ...payload, futureSourceField: { revision: 2 } })
    ).toString('base64url');
    const signature = createHmac('sha256', getDerivedKey())
      .update('http-proxy-source-v1:')
      .update(extended)
      .digest('hex');
    detail[0].inputs[0].value = { secret: `${prefix}${extended}.${signature}` };
    expect(
      restoreHttpProxySecrets({
        nodes: detail,
        appId: 'app',
        versions: new Map([['version', stored]])
      })
    ).toEqual(stored);
  });
});
