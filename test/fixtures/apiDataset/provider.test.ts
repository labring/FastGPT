import { describe, expect, it, vi } from 'vitest';
import { createProviderFixture, providerNames } from './provider';
import { createRemoteNode, generateRemoteTree } from './tree';

/** 直接调用 Axios transport 合约，无真实网络；平台拦截器由跨模块集成测试验证。 */
const request = ({
  url,
  data,
  params,
  token = 'Bearer fixture-token'
}: {
  url: string;
  data?: Parameters<ReturnType<typeof createProviderFixture>['respond']>[0]['data'];
  params?: Parameters<ReturnType<typeof createProviderFixture>['respond']>[0]['params'];
  token?: string;
}): Parameters<ReturnType<typeof createProviderFixture>['respond']>[0] => ({
  url,
  method: 'POST',
  data,
  params,
  headers: { get: () => token }
});
const custom = () =>
  createProviderFixture({
    provider: 'custom',
    nodes: generateRemoteTree({ folderCounts: [], filesPerLeaf: 1 })
  });

describe('createProviderFixture', () => {
  it.each(providerNames)('%s 的配置和根请求跟随调用方指定的远端根', async (provider) => {
    const fixture = createProviderFixture({
      provider,
      rootKey: 'library',
      nodes: generateRemoteTree({ rootKey: 'library', folderCounts: [], filesPerLeaf: 1 })
    });
    const query = {
      custom: { url: '/v1/file/list' },
      yuque: { url: '/groups/user/repos', token: 'fixture-token' },
      feishu: { url: '/open-apis/drive/v1/files', params: { folder_token: fixture.id('library') } },
      dingtalk: {
        url: '/v2.0/wiki/nodes',
        params: { parentNodeId: fixture.id('library') },
        token: 'fixture-token'
      }
    }[provider];
    await fixture.respond(request(query));
    expect(fixture.calls[0].key).toBe('library');
    expect(fixture.config).toMatchObject(
      {
        custom: { apiServer: { basePath: fixture.id('library') } },
        yuque: { yuqueServer: { basePath: fixture.id('library') } },
        feishu: { feishuServer: { folderToken: fixture.id('library') } },
        dingtalk: { dingtalkServer: { rootNodeId: fixture.id('library') } }
      }[provider]
    );
  });

  it('接受独立场景，拓扑替换刷新索引但保留远端 ID，正文修改也实时可见', async () => {
    const fixture = custom();
    const id = fixture.id('root/file-0');
    fixture.nodes = [
      createRemoteNode('root', { parent: null, type: 'folder' }),
      createRemoteNode('root/file-0', { parent: 'root', content: 'updated' })
    ];
    expect(fixture.id('root/file-0')).toBe(id);
    expect(
      (await fixture.respond(request({ url: '/v1/file/content', params: { id } }))).data
    ).toEqual({ success: true, data: { title: 'root/file-0', content: 'updated' } });
    fixture.nodes = fixture.nodes.filter((node) => node.key !== 'root/file-0');
    await expect(
      fixture.respond(request({ url: '/v1/file/detail', params: { id } }))
    ).rejects.toMatchObject({ response: { status: 404 } });
    fixture.nodes = [...fixture.nodes, fixture.node('restored', { parent: 'root' })];
    const reply = await fixture.respond(
      request({ url: '/v1/file/list', data: JSON.stringify({ parentId: fixture.id('root') }) })
    );
    expect(reply.data).toMatchObject({ data: [{ id: fixture.id('restored') }] });
  });

  it.each(['feishu', 'dingtalk'] as const)(
    '分页大小可配置，%s 原始协议使用相同远端树',
    async (provider) => {
      const fixture = createProviderFixture({
        provider,
        pageSize: 3,
        nodes: generateRemoteTree({ folderCounts: [], filesPerLeaf: 4 })
      });
      const query = (page?: string) =>
        provider === 'feishu'
          ? request({
              url: '/open-apis/drive/v1/files',
              params: { folder_token: fixture.id('root'), page_token: page }
            })
          : request({
              url: '/v2.0/wiki/nodes',
              token: 'fixture-token',
              params: { parentNodeId: fixture.id('root'), nextToken: page }
            });
      const first = (await fixture.respond(query())).data;
      const last = (await fixture.respond(query('3'))).data;
      if (provider === 'feishu') {
        expect(first).toMatchObject({
          data: {
            files: [expect.anything(), expect.anything(), expect.anything()],
            next_page_token: '3'
          }
        });
        expect(last).toMatchObject({ data: { files: [expect.anything()], has_more: false } });
      } else {
        expect(first).toMatchObject({
          nodes: [expect.anything(), expect.anything(), expect.anything()],
          nextToken: '3'
        });
        expect(last).toMatchObject({ nodes: [expect.anything()], nextToken: undefined });
      }
      expect(fixture.calls.map(({ page }) => page)).toEqual([undefined, '3']);
    }
  );

  it('故障按请求类型、节点及次数匹配，失败不执行正文回调，重试保留调用记录', async () => {
    const fixture = custom();
    const onContent = vi.fn(async () => undefined);
    fixture.onContent = onContent;
    fixture.fault = { kind: 'content', key: 'root/file-0', status: 429, remaining: 1 };
    await fixture.respond(request({ url: '/v1/file/list' }));
    const content = request({ url: '/v1/file/content', params: { id: fixture.id('root/file-0') } });
    await expect(fixture.respond(content)).rejects.toMatchObject({ response: { status: 429 } });
    expect(onContent).not.toHaveBeenCalled();
    await fixture.respond(content);
    expect(onContent).toHaveBeenCalledExactlyOnceWith('root/file-0');
    expect(fixture.calls.map(({ kind }) => kind)).toEqual(['list', 'content', 'content']);
    fixture.onContent = undefined;
    fixture.fault = { kind: 'content', key: 'other', status: 503 };
    await fixture.respond(content);
    fixture.fault = { kind: 'content', status: 503 };
    await expect(fixture.respond(content)).rejects.toMatchObject({ response: { status: 503 } });
    fixture.fault = undefined;
    await fixture.respond(content);
  });

  it('凭证不匹配和未知请求直接失败，不回退真实网络', async () => {
    const fixture = custom();
    await expect(
      fixture.respond(request({ url: '/v1/file/list', token: 'wrong' }))
    ).rejects.toThrow('credentials');
    await expect(fixture.respond(request({ url: '/unknown' }))).rejects.toThrow(
      'Unexpected external request'
    );
  });
  it.each([0, -1, 0.5, Infinity])('拒绝无效分页大小 %s', (pageSize) => {
    expect(() => createProviderFixture({ provider: 'custom', nodes: [], pageSize })).toThrow(
      'positive safe integer'
    );
  });
});
