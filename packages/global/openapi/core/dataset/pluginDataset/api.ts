import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ParentIdSchema } from '../../../../common/parentFolder/type';
import {
  PluginFileItemSchema,
  PluginDatasetServerSchema,
  PluginDatasetSourceConfigSchema
} from '../../../../core/dataset/pluginDataset/type';

// 1. list - 列出插件数据源文件列表
export const ListPluginDatasetFilesBodySchema = z.object({
  datasetId: ObjectIdSchema.describe('知识库ID'),
  searchKey: z.string().optional().describe('搜索关键词'),
  parentId: ParentIdSchema.describe('父文件夹ID')
});
export type ListPluginDatasetFilesBodyType = z.infer<typeof ListPluginDatasetFilesBodySchema>;
export const ListPluginDatasetFilesResponseSchema = z.array(PluginFileItemSchema);
export type ListPluginDatasetFilesResponseType = z.infer<
  typeof ListPluginDatasetFilesResponseSchema
>;

// 2. listExistId - 获取已同步的文件ID列表
export const ListExistIdQuerySchema = z.object({
  datasetId: ObjectIdSchema.describe('知识库ID')
});
export type ListExistIdQueryType = z.infer<typeof ListExistIdQuerySchema>;
export const ListExistIdResponseSchema = z.array(z.string());
export type ListExistIdResponseType = z.infer<typeof ListExistIdResponseSchema>;

// 3. getPathNames - 获取文件完整路径名
export const GetPathNamesBodySchema = z.object({
  datasetId: ObjectIdSchema.optional().describe('知识库ID'),
  parentId: ParentIdSchema.describe('文件ID'),
  pluginDatasetServer: PluginDatasetServerSchema.optional().describe('插件数据源配置')
});
export type GetPathNamesBodyType = z.infer<typeof GetPathNamesBodySchema>;
export const GetPathNamesResponseSchema = z.string();
export type GetPathNamesResponseType = z.infer<typeof GetPathNamesResponseSchema>;

// 4. getCatalog - 获取目录（只返回文件夹）
export const GetCatalogBodySchema = z.object({
  searchKey: z.string().optional().describe('搜索关键词'),
  parentId: ParentIdSchema.describe('父文件夹ID'),
  pluginDatasetServer: PluginDatasetServerSchema.optional().describe('插件数据源配置')
});
export type GetCatalogBodyType = z.infer<typeof GetCatalogBodySchema>;
export const GetCatalogResponseSchema = z.array(PluginFileItemSchema);
export type GetCatalogResponseType = z.infer<typeof GetCatalogResponseSchema>;

// 5. getConfig - 获取插件数据源配置
export const GetConfigQuerySchema = z.object({
  sourceId: z.string().describe('数据源ID')
});
export type GetConfigQueryType = z.infer<typeof GetConfigQuerySchema>;
export const GetConfigResponseSchema = PluginDatasetSourceConfigSchema;
export type GetConfigResponseType = z.infer<typeof GetConfigResponseSchema>;
