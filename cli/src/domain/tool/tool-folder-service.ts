import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { createAppFolderService, type AppFolderService } from '../shared/app-folder-service';

export type ToolFolderService = AppFolderService;

/**
 * FastGPT 工具目录领域服务：复用统一 App 目录服务封装 `toolFolder` 的列表、创建、更新与删除。
 */
export function createToolFolderService(): ToolFolderService {
  return createAppFolderService({
    folderType: AppTypeEnum.toolFolder,
    commandPrefix: 'tool folder',
    label: 'tool folder',
    capitalizedLabel: 'Tool folder'
  });
}
