import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { TagSchemaType, TagWithCountType } from '@fastgpt/global/core/app/tags';

export const getTeamTags = (withCount?: boolean) =>
  GET<TagSchemaType[] | TagWithCountType[]>(
    `/core/app/tags/list${withCount ? '?withCount=true' : ''}`
  );

export const createTag = (data: { name: string; color?: string }) =>
  POST<TagSchemaType>('/core/app/tags/create', data);

export const updateTag = (data: { tagId: string; name?: string; color?: string }) =>
  PUT<TagSchemaType>('/core/app/tags/update', data);

export const deleteTag = (tagId: string) => DELETE<boolean>(`/core/app/tags/delete?tagId=${tagId}`);

export const batchDeleteTags = (tagIds: string[]) =>
  DELETE<{ deletedCount: number }>('/core/app/tags/batchDelete', { tagIds });

export const addTagToApp = (appId: string, tagId: string) =>
  POST<boolean>('/core/app/tags/addToApp', { appId, tagId });

export const removeTagFromApp = (appId: string, tagId: string) =>
  DELETE<boolean>('/core/app/tags/removeFromApp', { appId, tagId });

export const batchAddTagsToApp = (appId: string, tagIds: string[]) =>
  POST<boolean>('/core/app/tags/batchAddToApp', { appId, tagIds });

export const batchRemoveTagsFromApp = (appId: string, tagIds: string[]) =>
  POST<boolean>('/core/app/tags/batchRemoveFromApp', { appId, tagIds });

export const batchAddAppsToTag = (tagId: string, appIds: string[]) =>
  POST<{ success: boolean }>('/core/app/tags/addApptoTag', { tagId, appIds });
