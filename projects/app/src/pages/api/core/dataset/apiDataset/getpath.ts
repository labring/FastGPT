import { NextAPI } from '@/service/middleware/entry';
import { YuqueServer, APIFileItem } from '@fastgpt/global/core/dataset/apiDataset';
import { getFeishuAndYuqueDatasetFileList } from '@/service/core/dataset/apiDataset/controller';
import { NextApiRequest } from 'next';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

export const getPathApi = async (yuqueServer: YuqueServer) => {
  if (!yuqueServer.baseUrl) {
    return '/root';
  }

  try {
    const allRepos = await getFeishuAndYuqueDatasetFileList({
      yuqueServer,
      needbottomfile: true
    });

    const filesByFolder: Record<string, APIFileItem[]> = {};
    let targetFile: APIFileItem | null = null;
    let targetRepoId: string | null = null;

    const fetchFolderContents = async (folderId: string, repoId: string): Promise<boolean> => {
      if (filesByFolder[folderId]) {
        return false;
      }

      const folderFiles = await getFeishuAndYuqueDatasetFileList({
        yuqueServer,
        parentId: folderId,
        needbottomfile: true
      });

      filesByFolder[folderId] = folderFiles;

      const found = folderFiles.find(
        (file) =>
          file.slug === yuqueServer.baseUrl ||
          file.uuid === yuqueServer.baseUrl ||
          file.id === yuqueServer.baseUrl ||
          `${file.id}` === yuqueServer.baseUrl
      );

      if (found) {
        targetFile = found;
        targetRepoId = repoId;
        return true;
      }

      for (const file of folderFiles) {
        if (file.type === 'folder' || file.hasChild) {
          const foundInSubfolder = await fetchFolderContents(file.id, repoId);
          if (foundInSubfolder) {
            return true;
          }
        }
      }

      return false;
    };

    for (const repo of allRepos) {
      filesByFolder[repo.id] = await getFeishuAndYuqueDatasetFileList({
        yuqueServer,
        parentId: repo.id,
        needbottomfile: true
      });

      const found = filesByFolder[repo.id].find(
        (file) =>
          file.slug === yuqueServer.baseUrl ||
          file.uuid === yuqueServer.baseUrl ||
          file.id === yuqueServer.baseUrl ||
          `${file.id}` === yuqueServer.baseUrl
      );

      if (found) {
        targetFile = found;
        targetRepoId = repo.id;
        break;
      }

      let foundInRepo = false;
      for (const file of filesByFolder[repo.id]) {
        if (file.type === 'folder' || file.hasChild) {
          foundInRepo = await fetchFolderContents(file.id, repo.id);
          if (foundInRepo) break;
        }
      }

      if (foundInRepo) break;
    }

    if (!targetFile || !targetRepoId) {
      return '/root';
    }

    const buildPath = () => {
      const pathSegments = [targetFile!.name];
      let currentId = targetFile!.parentId;

      while (currentId) {
        let parentFound = false;

        for (const folderId in filesByFolder) {
          const parentFile = filesByFolder[folderId].find(
            (file) => file.id === currentId || file.uuid === currentId || `${file.id}` === currentId
          );

          if (parentFile) {
            pathSegments.unshift(parentFile.name);
            currentId = parentFile.parentId;
            parentFound = true;
            break;
          }
        }

        if (!parentFound) {
          break;
        }
      }

      const targetRepo = allRepos.find((repo) => repo.id === targetRepoId);
      if (targetRepo) {
        pathSegments.unshift(targetRepo.name);
      }
      pathSegments.unshift('/root');

      return pathSegments.join('/');
    };

    const finalPath = buildPath();

    return finalPath;
  } catch (error) {
    console.error('Failed to get the path:', error);
    return '/root';
  }
};

async function handler(req: NextApiRequest) {
  try {
    const { yuqueServer, datasetId } = req.body;

    if (yuqueServer?.token) {
      return await getPathApi(yuqueServer);
    }

    if (datasetId) {
      try {
        const { dataset } = await authDataset({
          req,
          datasetId,
          authToken: true,
          authApiKey: true,
          per: ReadPermissionVal
        });

        if (!dataset.yuqueServer?.baseUrl) {
          return '/root';
        }

        return await getPathApi(dataset.yuqueServer);
      } catch (authError) {
        console.error('Dataset authorization or query failure:', authError);
        return '/root';
      }
    }

    return '/root';
  } catch (error) {
    console.error('Failed to process the request:', error);
    return '/root';
  }
}

export default NextAPI(handler);
