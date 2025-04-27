import { describe, expect, it, vi } from 'vitest';
import { POST, GET } from '@/web/common/api/request';
import {
  postCreateAppFolder,
  getAppFolderPath,
  postTransition2Workflow,
  postCopyApp
} from '@/web/core/app/api/app';
import type { CreateAppFolderBody } from '@/pages/api/core/app/folder/create';
import type {
  GetPathProps,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type {
  transitionWorkflowBody,
  transitionWorkflowResponse
} from '@/pages/api/core/app/transitionWorkflow';
import type { copyAppQuery, copyAppResponse } from '@/pages/api/core/app/copy';

vi.mock('@/web/common/api/request', () => ({
  POST: vi.fn(),
  GET: vi.fn()
}));

describe('app api', () => {
  describe('postCreateAppFolder', () => {
    it('should call POST with correct params', () => {
      const data: CreateAppFolderBody = {
        parentId: 'parent123',
        name: 'Test Folder'
      };

      postCreateAppFolder(data);

      expect(POST).toHaveBeenCalledWith('/core/app/folder/create', data);
    });
  });

  describe('getAppFolderPath', () => {
    it('should return empty array if no sourceId', async () => {
      const data: GetPathProps = {
        sourceId: ''
      };

      const result = await getAppFolderPath(data);

      expect(result).toEqual([]);
      expect(GET).not.toHaveBeenCalled();
    });

    it('should call GET with correct params if sourceId exists', () => {
      const data: GetPathProps = {
        sourceId: 'source123'
      };

      getAppFolderPath(data);

      expect(GET).toHaveBeenCalledWith('/core/app/folder/path', data);
    });
  });

  describe('postTransition2Workflow', () => {
    it('should call POST with correct params', () => {
      const data: transitionWorkflowBody = {
        id: 'workflow123',
        modules: []
      };

      postTransition2Workflow(data);

      expect(POST).toHaveBeenCalledWith('/core/app/transitionWorkflow', data);
    });
  });

  describe('postCopyApp', () => {
    it('should call POST with correct params', () => {
      const data: copyAppQuery = {
        appId: 'app123',
        name: 'App Copy'
      };

      postCopyApp(data);

      expect(POST).toHaveBeenCalledWith('/core/app/copy', data);
    });
  });
});
