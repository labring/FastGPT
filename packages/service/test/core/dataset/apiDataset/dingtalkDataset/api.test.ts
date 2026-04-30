import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAxiosPost, mockRequest, mockGetRedisCache, mockSetRedisCache, mockDelRedisCache } =
  vi.hoisted(() => ({
    mockAxiosPost: vi.fn(),
    mockRequest: vi.fn(),
    mockGetRedisCache: vi.fn(),
    mockSetRedisCache: vi.fn(),
    mockDelRedisCache: vi.fn()
  }));

vi.mock('../../../../../common/api/axios', () => ({
  axios: {
    post: mockAxiosPost
  },
  createProxyAxios: vi.fn(() => ({
    request: mockRequest
  }))
}));

vi.mock('../../../../../common/redis/cache', () => ({
  getRedisCache: mockGetRedisCache,
  setRedisCache: mockSetRedisCache,
  delRedisCache: mockDelRedisCache
}));

vi.mock('../../../../../common/logger', () => ({
  getLogger: () => ({
    warn: vi.fn(),
    error: vi.fn()
  }),
  LogCategories: {
    MODULE: {
      DATASET: {
        API_DATASET: 'dataset.apiDataset'
      }
    }
  }
}));

import { useDingtalkDatasetRequest } from '@fastgpt/service/core/dataset/apiDataset/dingtalkDataset/api';

const server = {
  appKey: 'ding-app',
  appSecret: 'ding-secret',
  userId: 'user-id'
};

const mockTokenAndUser = () => {
  mockAxiosPost.mockImplementation((url: string) => {
    if (url.includes('/v1.0/oauth2/accessToken')) {
      return Promise.resolve({
        data: {
          accessToken: 'access-token',
          expireIn: 7200
        }
      });
    }

    return Promise.resolve({
      data: {
        errcode: 0,
        result: {
          unionid: 'operator-id'
        }
      }
    });
  });
};

describe('useDingtalkDatasetRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisCache.mockResolvedValue(null);
    mockSetRedisCache.mockResolvedValue(undefined);
    mockDelRedisCache.mockResolvedValue(undefined);
    mockTokenAndUser();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should list workspaces with nextToken and cache accessToken', async () => {
    mockRequest
      .mockResolvedValueOnce({
        data: {
          workspaces: [
            {
              workspaceId: 'workspace-1',
              workspaceName: 'Workspace 1',
              rootNodeId: 'root-1'
            }
          ],
          nextToken: 'next-1'
        }
      })
      .mockResolvedValueOnce({
        data: {
          workspaces: [
            {
              workspaceId: 'workspace-2',
              name: 'Workspace 2',
              rootNodeId: 'root-2'
            }
          ]
        }
      });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });
    const result = await request.listFiles({});

    expect(result).toEqual([
      expect.objectContaining({
        id: 'root-1',
        rawId: 'root-1',
        parentId: 'operator-id',
        name: 'Workspace 1',
        type: 'folder'
      }),
      expect.objectContaining({
        id: 'root-2',
        rawId: 'root-2',
        parentId: 'operator-id',
        name: 'Workspace 2',
        type: 'folder'
      })
    ]);
    expect(mockSetRedisCache).toHaveBeenCalledWith(
      expect.stringContaining('dataset:dingtalk:accessToken:ding-app:'),
      'access-token',
      6900
    );
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        params: expect.objectContaining({
          nextToken: 'next-1'
        })
      })
    );
  });

  it('should list folder children with nextToken and filter unsupported nodes', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest
      .mockResolvedValueOnce({
        data: {
          nodes: [
            {
              nodeId: 'folder-1',
              title: 'Folder',
              nodeType: 'folder',
              hasChildren: true
            },
            {
              nodeId: 'doc-1',
              title: 'Doc',
              docType: 'wiki_doc'
            }
          ],
          nextToken: 'next-node'
        }
      })
      .mockResolvedValueOnce({
        data: {
          nodes: [
            {
              nodeId: 'pdf-1',
              title: 'PDF',
              fileType: 'pdf'
            }
          ]
        }
      });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const result = await request.listFiles({});

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'folder-1',
      type: 'folder',
      hasChild: true
    });
    expect(result[1]).toMatchObject({
      id: 'doc-1',
      type: 'file',
      hasChild: false
    });
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/topapi/v2/user/get'),
      expect.objectContaining({
        userid: 'user-id'
      }),
      expect.any(Object)
    );
  });

  it('should read online document blocks content', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/blocks')) {
        return Promise.resolve({
          data: {
            blocks: [
              {
                paragraph: {
                  elements: [{ text: 'hello' }, { text: 'world' }]
                }
              }
            ]
          }
        });
      }

      return Promise.resolve({
        data: {
          node: {
            nodeId: 'doc-1',
            title: 'Doc',
            docType: 'wiki_doc'
          }
        }
      });
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const result = await request.getFileContent({ apiFileId: 'doc-1' });

    expect(result).toEqual({
      title: 'Doc',
      rawText: 'hello\nworld'
    });
  });

  it('should read title from nested node detail response', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/blocks')) {
        return Promise.resolve({
          data: {
            result: {
              data: [{ paragraph: { text: 'hello' } }]
            },
            success: true
          }
        });
      }

      return Promise.resolve({
        data: {
          node: {
            nodeId: 'doc-1',
            name: 'Doc From Node',
            type: 'FILE',
            extension: 'adoc'
          }
        }
      });
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const result = await request.getFileContent({ apiFileId: 'doc-1' });

    expect(result).toEqual({
      title: 'Doc From Node',
      rawText: 'hello'
    });
  });

  it('should reuse the same token refresh promise for concurrent requests', async () => {
    let resolveToken: (value: any) => void = () => undefined;
    const tokenPromise = new Promise((resolve) => {
      resolveToken = resolve;
    });
    mockAxiosPost.mockImplementation((url: string) => {
      if (url.includes('/v1.0/oauth2/accessToken')) {
        return tokenPromise;
      }

      return Promise.resolve({
        data: {
          errcode: 0,
          result: {
            unionid: 'operator-id'
          }
        }
      });
    });
    mockRequest.mockResolvedValue({
      data: {
        workspaces: []
      }
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });
    const p1 = request.listFiles({});
    const p2 = request.listFiles({});

    resolveToken({
      data: {
        accessToken: 'access-token',
        expireIn: 7200
      }
    });

    await Promise.all([p1, p2]);

    const tokenCalls = mockAxiosPost.mock.calls.filter(([url]) =>
      String(url).includes('/v1.0/oauth2/accessToken')
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('should return workspace root detail, preview url and raw id without requesting dingtalk', async () => {
    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        workspaceId: 'workspace-1',
        rootNodeId: 'root-1',
        workspaceName: 'Workspace 1'
      }
    });

    const detail = await request.getFileDetail({ apiFileId: 'root-1' });
    const previewUrl = await request.getFilePreviewUrl({ apiFileId: 'doc-1' });

    expect(detail).toMatchObject({
      id: 'root-1',
      rawId: 'root-1',
      name: 'Workspace 1',
      type: 'folder'
    });
    expect(previewUrl).toBe('https://alidocs.dingtalk.com/i/nodes/doc-1');
    expect(request.getFileRawId('doc-1')).toBe('doc-1');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should fetch node detail for non-root file', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockResolvedValueOnce({
      data: {
        node: {
          nodeId: 'doc-1',
          title: 'Doc',
          docType: 'wiki_doc',
          parentNodeId: 'root-1',
          updatedAt: 1700000000000
        }
      }
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });

    const detail = await request.getFileDetail({ apiFileId: 'doc-1' });

    expect(detail).toMatchObject({
      id: 'doc-1',
      rawId: 'doc-1',
      parentId: 'root-1',
      name: 'Doc',
      type: 'file'
    });
  });

  it('should filter workspaces by searchKey and ignore invalid workspace payloads', async () => {
    mockRequest.mockResolvedValueOnce({
      data: {
        items: [
          {
            workspaceId: 'workspace-1',
            workspaceName: 'Product Space',
            rootDentryUuid: 'root-1',
            createTime: '2024-01-01T00:00:00.000Z'
          },
          {
            workspaceId: 'workspace-2',
            workspaceName: 'Sales Space',
            rootNodeId: 'root-2'
          },
          {
            workspaceId: 'workspace-3',
            workspaceName: 'Invalid Space'
          }
        ]
      }
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });
    const result = await request.listFiles({ searchKey: 'Product' });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'root-1',
        rawId: 'root-1',
        name: 'Product Space'
      })
    ]);
  });

  it('should map workspace and node fallback fields', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest
      .mockResolvedValueOnce({
        data: {
          workspaces: [
            {
              id: 'workspace-id',
              rootDentryId: 'root-dentry-id'
            },
            {
              spaceId: 'space-id',
              dentryUuid: 'root-dentry-uuid',
              name: 'Space Name'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          nodes: [
            {
              dentryUuid: 'node-dentry-uuid',
              name: 'Directory',
              type: 'directory'
            },
            {
              dentryId: 'node-dentry-id',
              title: 'Document',
              extension: 'doc'
            },
            {
              uuid: 'node-uuid',
              nodeType: 'catalog'
            },
            {
              id: 'node-id',
              name: 'Unknown',
              fileType: 'unknown'
            }
          ]
        }
      });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id'
      }
    });

    const workspaces = await request.listFiles({});
    const nodes = await request.listFiles({ parentId: 'root-dentry-id', searchKey: 'Doc' });

    expect(workspaces).toEqual([
      expect.objectContaining({
        id: 'root-dentry-id',
        rawId: 'root-dentry-id',
        name: 'workspace-id'
      }),
      expect.objectContaining({
        id: 'root-dentry-uuid',
        rawId: 'root-dentry-uuid',
        name: 'Space Name'
      })
    ]);
    expect(nodes).toEqual([
      expect.objectContaining({
        id: 'node-dentry-id',
        name: 'Document',
        type: 'file'
      })
    ]);
  });

  it('should return empty list when parentId resolves to empty string', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: ''
      }
    });
    const result = await request.listFiles({ parentId: [] as any });

    expect(result).toEqual([]);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should retry rate limited node list once', async () => {
    vi.useFakeTimers();
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest
      .mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            message: 'too many requests'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          list: [
            {
              nodeId: 'doc-1',
              name: 'Doc',
              fileType: 'adoc'
            }
          ]
        }
      });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const resultPromise = request.listFiles({});
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        type: 'file'
      })
    ]);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('should reject with readable message when node list keeps being rate limited', async () => {
    vi.useFakeTimers();
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockRejectedValue({
      response: {
        status: 429,
        data: {
          code: 429
        }
      }
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const resultPromise = expect(request.listFiles({})).rejects.toBe(
      '钉钉目录接口请求过快，请稍后重试或减少一次导入的文件夹规模'
    );
    await vi.advanceTimersByTimeAsync(1000);
    await resultPromise;
  });

  it('should reject permission message when node list retry fails without rate limit', async () => {
    vi.useFakeTimers();
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest
      .mockRejectedValueOnce({
        response: {
          status: 429
        }
      })
      .mockRejectedValueOnce(new Error('network down'));

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const resultPromise = expect(request.listFiles({})).rejects.toBe(
      '读取钉钉目录失败，请检查 rootNodeId、Wiki.Node.Read 权限和知识库访问权限'
    );
    await vi.advanceTimersByTimeAsync(1000);
    await resultPromise;
  });

  it('should read paged document blocks content', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockImplementation(
      ({ url, params }: { url: string; params?: Record<string, any> }) => {
        if (url.includes('/blocks') && !params?.nextToken) {
          return Promise.resolve({
            data: {
              blocks: [{ text: 'page 1' }],
              nextPageToken: 'next-page'
            }
          });
        }

        if (url.includes('/blocks') && params?.nextToken === 'next-page') {
          return Promise.resolve({
            data: {
              blocks: [{ plainText: 'page 2' }]
            }
          });
        }

        return Promise.resolve({
          data: {
            node: {
              nodeId: 'doc-1',
              name: 'Doc',
              docType: 'document'
            }
          }
        });
      }
    );

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });
    const result = await request.getFileContent({ apiFileId: 'doc-1' });

    expect(result).toEqual({
      title: 'Doc',
      rawText: 'page 1\npage 2'
    });
    expect(mockRequest.mock.calls.some(([args]) => args.params?.nextToken === 'next-page')).toBe(
      true
    );
  });

  it('should reject unsupported document content without leaking raw response', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest
      .mockResolvedValueOnce({
        data: {
          blocks: [{ image: { url: 'https://example.com/a.png' } }]
        }
      })
      .mockResolvedValueOnce({
        data: {
          nodeId: 'doc-1',
          name: 'Doc',
          docType: 'wiki_doc'
        }
      });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });

    await expect(request.getFileContent({ apiFileId: 'doc-1' })).rejects.toBe(
      '当前仅支持钉钉在线文档文本，不支持该文件类型'
    );
  });

  it('should reject when app secret is missing', async () => {
    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        appSecret: ''
      }
    });

    await expect(request.listFiles({})).rejects.toBe(
      '钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限'
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('should continue when token cache read and write fail', async () => {
    mockGetRedisCache.mockRejectedValueOnce(new Error('redis read failed'));
    mockSetRedisCache.mockRejectedValueOnce(new Error('redis write failed'));
    mockRequest.mockResolvedValueOnce({
      data: {
        workspaces: []
      }
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });
    const result = await request.listFiles({});

    expect(result).toEqual([]);
    expect(mockAxiosPost).toHaveBeenCalled();
    expect(mockSetRedisCache).toHaveBeenCalled();
  });

  it('should reject readable message when accessToken request is rate limited', async () => {
    mockAxiosPost.mockRejectedValueOnce({
      response: {
        status: 429,
        data: {
          errmsg: 'rate limit'
        }
      }
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });

    await expect(request.listFiles({})).rejects.toBe('钉钉鉴权接口请求过快，请稍后重试');
    expect(mockDelRedisCache).toHaveBeenCalled();
  });

  it('should reject readable message when accessToken response is empty', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: {}
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });

    await expect(request.listFiles({})).rejects.toBe(
      '钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限'
    );
  });

  it('should reject readable message when accessToken request fails without rate limit', async () => {
    mockAxiosPost.mockRejectedValueOnce({
      response: {
        data: {
          errmsg: 'invalid app secret'
        }
      }
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });

    await expect(request.listFiles({})).rejects.toBe(
      '钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限'
    );
  });

  it('should reject readable message when workspace list fails', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockRejectedValueOnce(new Error('wiki permission denied'));

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id'
      }
    });

    await expect(request.listFiles({})).rejects.toBe(
      '读取钉钉知识库列表失败，请检查 Wiki.Workspace.Read 权限'
    );
  });

  it('should reject readable message when document blocks request fails', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/blocks')) {
        return Promise.reject(new Error('doc permission denied'));
      }

      return Promise.resolve({
        data: {
          nodeId: 'doc-1',
          name: 'Doc',
          docType: 'wiki_doc'
        }
      });
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });

    await expect(request.getFileContent({ apiFileId: 'doc-1' })).rejects.toBe(
      '读取钉钉在线文档失败，请检查文档类型和权限'
    );
  });

  it('should keep string error when document blocks request rejects with string', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/blocks')) {
        return Promise.reject('raw string error');
      }

      return Promise.resolve({
        data: {
          nodeId: 'doc-1',
          name: 'Doc',
          docType: 'wiki_doc'
        }
      });
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });

    await expect(request.getFileContent({ apiFileId: 'doc-1' })).rejects.toBe('raw string error');
  });

  it('should ignore blank block text and unsupported primitive values', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockImplementation(({ url }: { url: string }) => {
      if (url.includes('/blocks')) {
        return Promise.resolve({
          data: {
            blocks: [{ text: '   ' }, 123, false]
          }
        });
      }

      return Promise.resolve({
        data: {
          nodeId: 'doc-1',
          name: 'Doc',
          docType: 'wiki_doc'
        }
      });
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });

    await expect(request.getFileContent({ apiFileId: 'doc-1' })).rejects.toBe(
      '当前仅支持钉钉在线文档文本，不支持该文件类型'
    );
  });

  it('should reject when node detail cannot be formatted', async () => {
    mockGetRedisCache.mockResolvedValue('cached-token');
    mockRequest.mockResolvedValueOnce({
      data: {
        node: {
          nodeId: 'unknown-1',
          title: 'Unknown',
          fileType: 'pdf'
        }
      }
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1'
      }
    });

    await expect(request.getFileDetail({ apiFileId: 'unknown-1' })).rejects.toBe('文件不存在');
  });

  it('should use root node id as rawId when workspace id is empty', async () => {
    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'operator-id',
        rootNodeId: 'root-1',
        workspaceName: 'Workspace 1'
      }
    });

    const detail = await request.getFileDetail({ apiFileId: 'root-1' });

    expect(detail.rawId).toBe('root-1');
  });

  it('should reject when operatorId cannot be resolved from userId', async () => {
    mockAxiosPost.mockImplementation((url: string) => {
      if (url.includes('/v1.0/oauth2/accessToken')) {
        return Promise.resolve({
          data: {
            accessToken: 'access-token',
            expireIn: 7200
          }
        });
      }

      return Promise.resolve({
        data: {
          errcode: 500,
          errmsg: 'no permission'
        }
      });
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });

    await expect(request.listFiles({})).rejects.toBe('no permission');
  });

  it('should fallback to userid when unionid is empty', async () => {
    mockAxiosPost.mockImplementation((url: string) => {
      if (url.includes('/v1.0/oauth2/accessToken')) {
        return Promise.resolve({
          data: {
            accessToken: 'access-token',
            expireIn: 7200
          }
        });
      }

      return Promise.resolve({
        data: {
          errcode: 0,
          result: {
            userid: 'operator-user-id'
          }
        }
      });
    });
    mockRequest.mockResolvedValueOnce({
      data: {
        workspaces: []
      }
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });
    await request.listFiles({});

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          operatorId: 'operator-user-id'
        })
      })
    );
  });

  it('should ignore cached operatorId and resolve operator from current userId', async () => {
    mockAxiosPost.mockImplementation((url: string) => {
      if (url.includes('/v1.0/oauth2/accessToken')) {
        return Promise.resolve({
          data: {
            accessToken: 'access-token',
            expireIn: 7200
          }
        });
      }

      return Promise.resolve({
        data: {
          errcode: 0,
          result: {
            unionid: 'fresh-operator-id'
          }
        }
      });
    });
    mockRequest.mockResolvedValueOnce({
      data: {
        workspaces: []
      }
    });

    const request = useDingtalkDatasetRequest({
      dingtalkServer: {
        ...server,
        operatorId: 'stale-operator-id'
      }
    });
    await request.listFiles({});

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          operatorId: 'fresh-operator-id'
        })
      })
    );
  });

  it('should reject when operator response has no operator id', async () => {
    mockAxiosPost.mockImplementation((url: string) => {
      if (url.includes('/v1.0/oauth2/accessToken')) {
        return Promise.resolve({
          data: {
            accessToken: 'access-token',
            expireIn: 7200
          }
        });
      }

      return Promise.resolve({
        data: {
          errcode: 0,
          result: {}
        }
      });
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });

    await expect(request.listFiles({})).rejects.toBe('DingTalk operatorId is empty');
  });

  it('should return user permission message when user api request fails', async () => {
    mockAxiosPost.mockImplementation((url: string) => {
      if (url.includes('/v1.0/oauth2/accessToken')) {
        return Promise.resolve({
          data: {
            accessToken: 'access-token',
            expireIn: 7200
          }
        });
      }

      return Promise.reject(new Error('network error'));
    });

    const request = useDingtalkDatasetRequest({ dingtalkServer: server });

    await expect(request.listFiles({})).rejects.toBe(
      '获取钉钉用户 unionId 失败，请检查 UserId、通讯录可见范围和 qyapi_get_member 权限'
    );
  });
});
