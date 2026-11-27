import { describe, expect, it, vi } from 'vitest';
import { createPlatformSkillService } from '../../src/domain/skill/platform-skill-service';
import type { FastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';

const OBJECT_ID_SKILL = '68ad85a7463006c963799a21';
const OBJECT_ID_FOLDER = '68ad85a7463006c963799a22';

function createMockHttpClient({
  requestHandler,
  uploadBinaryHandler
}: {
  requestHandler?: (params: any) => Promise<any>;
  uploadBinaryHandler?: (params: any) => Promise<any>;
}): FastGptHttpClient {
  return {
    baseUrl: 'https://cloud.fastgpt.cn/api',
    request: vi.fn(requestHandler ?? (async () => undefined)),
    requestRaw: vi.fn(),
    uploadMultipart: vi.fn(),
    uploadBinary: vi.fn(uploadBinaryHandler ?? (async () => undefined)),
    putPresignedUrl: vi.fn(),
    streamSse: vi.fn()
  };
}

describe('PlatformSkillService (cli/src/domain/skill/platform-skill-service.ts)', () => {
  const service = createPlatformSkillService();

  it('lists skills using page field, omitting parentId unless explicitly specified, or direct skillIds', async () => {
    const capturedBodies: any[] = [];
    const client = createMockHttpClient({
      requestHandler: async ({ method, path, body }) => {
        expect(method).toBe('POST');
        expect(path).toBe('/core/ai/skill/listV2');
        capturedBodies.push(body);
        return {
          total: 25,
          list: [{ _id: OBJECT_ID_SKILL, name: 'helper-skill' }]
        };
      }
    });

    const pageRes = await service.list({
      client,
      input: { source: 'mine', searchKey: 'helper', page: 2, pageSize: 10 }
    });
    expect(pageRes.changed).toBe(false);
    expect(capturedBodies[0]).toMatchObject({
      source: 'mine',
      searchKey: 'helper',
      page: 2,
      pageSize: 10
    });
    expect(capturedBodies[0]).not.toHaveProperty('parentId');
    expect(capturedBodies[0]).not.toHaveProperty('pageNum');
    expect(pageRes.meta).toEqual({ total: 25, page: 2, pageSize: 10, hasMore: true, count: 1 });

    await service.list({
      client,
      input: { parentId: null, page: 1, pageSize: 10 }
    });
    expect(capturedBodies[1]).toMatchObject({ parentId: null, page: 1, pageSize: 10 });

    const idRes = await service.list({
      client,
      input: { skillIds: [OBJECT_ID_SKILL] }
    });
    expect(idRes.meta).toEqual({ total: 25, count: 1, hasMore: false });
  });

  it('creates a platform skill, enforces backend length limits, and supports dry-run', async () => {
    let calls = 0;
    const client = createMockHttpClient({
      requestHandler: async ({ method, path, body }) => {
        calls += 1;
        expect(method).toBe('POST');
        expect(path).toBe('/core/ai/skill/create');
        expect(body).toMatchObject({
          parentId: null,
          name: 'Test Skill',
          description: 'A test skill',
          category: ['tool']
        });
        return OBJECT_ID_SKILL;
      }
    });

    await expect(
      service.create({
        client,
        input: { parentId: null, name: 'a'.repeat(51) }
      })
    ).rejects.toThrow('cannot exceed 50 characters');

    await expect(
      service.create({
        client,
        input: { parentId: null, name: 'Valid', description: 'd'.repeat(501) }
      })
    ).rejects.toThrow('cannot exceed 500 characters');

    const dry = await service.create({
      client,
      input: {
        parentId: null,
        name: 'Test Skill',
        description: 'A test skill',
        category: ['tool']
      },
      dryRun: true
    });
    expect(calls).toBe(0);
    expect(dry.changed).toBe(false);
    expect(dry.data).toMatchObject({
      dryRun: true,
      risk: 'write',
      method: 'POST',
      path: '/core/ai/skill/create'
    });

    const created = await service.create({
      client,
      input: { parentId: null, name: 'Test Skill', description: 'A test skill', category: ['tool'] }
    });
    expect(calls).toBe(1);
    expect(created.changed).toBe(true);
    expect(created.data).toEqual({ skillId: OBJECT_ID_SKILL, name: 'Test Skill' });
  });

  it('validates .zip extension and imports skill package via uploadBinary', async () => {
    const client = createMockHttpClient({
      uploadBinaryHandler: async ({ path, query, body, contentType }) => {
        expect(path).toBe('/core/ai/skill/import');
        expect(query).toEqual({
          filename: 'demo-skill.zip',
          parentId: OBJECT_ID_FOLDER,
          name: 'Demo Skill'
        });
        expect(contentType).toBe('application/zip');
        expect(body).toBeInstanceOf(Uint8Array);
        return OBJECT_ID_SKILL;
      }
    });

    await expect(
      service.importPackage({
        client,
        file: {
          filename: 'demo-skill.tar.gz',
          size: 10,
          mimeType: 'application/gzip',
          data: new Uint8Array([1, 2, 3])
        },
        input: {}
      })
    ).rejects.toThrow('must be a .zip archive');

    const dry = await service.importPackage({
      client,
      file: {
        filename: 'demo-skill.zip',
        size: 4,
        mimeType: 'application/zip',
        data: new Uint8Array([80, 75, 3, 4])
      },
      input: { parentId: null, name: 'Demo Skill' },
      dryRun: true
    });
    expect(dry.changed).toBe(false);
    expect(dry.data).toMatchObject({
      dryRun: true,
      risk: 'write',
      query: { filename: 'demo-skill.zip', name: 'Demo Skill' }
    });
    expect((dry.data as any).query).not.toHaveProperty('parentId');

    const imported = await service.importPackage({
      client,
      file: {
        filename: 'demo-skill.zip',
        size: 4,
        mimeType: 'application/zip',
        data: new Uint8Array([80, 75, 3, 4])
      },
      input: { parentId: OBJECT_ID_FOLDER, name: 'Demo Skill' }
    });
    expect(imported.changed).toBe(true);
    expect(imported.data).toEqual({
      skillId: OBJECT_ID_SKILL,
      filename: 'demo-skill.zip',
      name: 'Demo Skill',
      sizeBytes: 4
    });
  });

  it('gets detail and deletes a skill', async () => {
    const client = createMockHttpClient({
      requestHandler: async ({ method, path, query }) => {
        if (method === 'GET') {
          expect(path).toBe('/core/ai/skill/detail');
          expect(query).toEqual({ skillId: OBJECT_ID_SKILL });
          return { _id: OBJECT_ID_SKILL, name: 'Demo Skill' };
        }
        expect(method).toBe('DELETE');
        expect(path).toBe('/core/ai/skill/delete');
        expect(query).toEqual({ skillId: OBJECT_ID_SKILL });
        return undefined;
      }
    });

    const detail = await service.getDetail({ client, skillId: OBJECT_ID_SKILL });
    expect(detail.data?._id).toBe(OBJECT_ID_SKILL);

    const dryDel = await service.delete({ client, skillId: OBJECT_ID_SKILL, dryRun: true });
    expect(dryDel.data).toMatchObject({ dryRun: true, risk: 'destructive' });

    const deleted = await service.delete({ client, skillId: OBJECT_ID_SKILL });
    expect(deleted.changed).toBe(true);
    expect(deleted.data).toEqual({ deleted: true, skillId: OBJECT_ID_SKILL });
  });

  it('updates a skill avatar and validates empty payloads and field lengths', async () => {
    const client = createMockHttpClient({
      requestHandler: async ({ method, path, body }) => {
        expect(method).toBe('POST');
        expect(path).toBe('/core/ai/skill/update');
        expect(body).toEqual({
          skillId: OBJECT_ID_SKILL,
          avatar: '/api/system/img/avatar/team/file/skill.png'
        });
        return undefined;
      }
    });

    await expect(service.update({ client, input: { skillId: OBJECT_ID_SKILL } })).rejects.toThrow(
      'At least one field to update is required'
    );
    await expect(
      service.update({ client, input: { skillId: OBJECT_ID_SKILL, name: 'x'.repeat(51) } })
    ).rejects.toThrow('cannot exceed 50 characters');

    const res = await service.update({
      client,
      input: {
        skillId: OBJECT_ID_SKILL,
        avatar: '/api/system/img/avatar/team/file/skill.png'
      }
    });
    expect(res.changed).toBe(true);
    expect(res.data).toEqual({
      updated: true,
      skillId: OBJECT_ID_SKILL,
      avatar: '/api/system/img/avatar/team/file/skill.png'
    });
  });

  it('handles skill folder list, create, update, and delete with folder type checks', async () => {
    const client = createMockHttpClient({
      requestHandler: async ({ method, path, body, query }) => {
        if (path === '/core/ai/skill/listV2') {
          expect(body.type).toBe('folder');
          return { total: 1, list: [{ _id: OBJECT_ID_FOLDER, name: 'Dir', type: 'folder' }] };
        }
        if (path === '/core/ai/skill/folder/create') {
          expect(method).toBe('POST');
          expect(body).toMatchObject({ name: 'Dir', parentId: null });
          return { folderId: OBJECT_ID_FOLDER };
        }
        if (path === '/core/ai/skill/detail') {
          return {
            _id: query.skillId,
            name: 'Item',
            type: query.skillId === OBJECT_ID_FOLDER ? 'folder' : 'skill'
          };
        }
        if (path === '/core/ai/skill/update' || path === '/core/ai/skill/delete') {
          return undefined;
        }
        return undefined;
      }
    });

    const listed = await service.listFolders({ client, input: { source: 'mine', page: 1 } });
    expect(listed.data?.list).toHaveLength(1);

    const created = await service.createFolder({ client, input: { name: 'Dir' } });
    expect(created.data).toEqual({ folderId: OBJECT_ID_FOLDER, name: 'Dir', parentId: null });

    await expect(
      service.updateFolder({ client, input: { folderId: OBJECT_ID_SKILL, name: 'Wrong' } })
    ).rejects.toThrow('expected skill folder');

    const updated = await service.updateFolder({
      client,
      input: { folderId: OBJECT_ID_FOLDER, name: 'Dir v2' }
    });
    expect(updated.data).toMatchObject({ updated: true, folderId: OBJECT_ID_FOLDER });

    await expect(service.deleteFolder({ client, folderId: OBJECT_ID_SKILL })).rejects.toThrow(
      'expected skill folder'
    );

    // Ordinary skill delete must refuse folder IDs to prevent accidental recursive deletion
    await expect(service.delete({ client, skillId: OBJECT_ID_FOLDER })).rejects.toThrow(
      /is a skill folder/
    );

    const deletedSkill = await service.delete({ client, skillId: OBJECT_ID_SKILL });
    expect(deletedSkill.data).toEqual({ deleted: true, skillId: OBJECT_ID_SKILL });

    const deleted = await service.deleteFolder({ client, folderId: OBJECT_ID_FOLDER });
    expect(deleted.data).toEqual({ deleted: true, folderId: OBJECT_ID_FOLDER });
  });
});
