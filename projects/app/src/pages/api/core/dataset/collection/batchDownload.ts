import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { findCollectionAndAllChildren } from '@fastgpt/service/core/dataset/collection/controller';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import archiver from 'archiver';
import { z } from 'zod';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';

const BodySchema = z.object({
  collectionIds: z.array(z.string()).min(1).max(200)
});

function buildZipPath(
  file: DatasetCollectionSchemaType,
  rootId: string,
  collectionMap: Map<string, DatasetCollectionSchemaType>
): string {
  const parts: string[] = [file.name];
  let currentId = file.parentId ? String(file.parentId) : undefined;

  while (currentId && currentId !== rootId) {
    const parent = collectionMap.get(currentId);
    if (!parent) break;
    parts.unshift(parent.name);
    currentId = parent.parentId ? String(parent.parentId) : undefined;
  }

  return parts.join('/');
}

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { collectionIds } = BodySchema.parse(req.body);

  let teamId = '';
  const authedCollections = await Promise.all(
    collectionIds.map(async (collectionId) => {
      const { collection, teamId: tid } = await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId,
        per: ReadPermissionVal
      });
      teamId = tid;
      return collection;
    })
  );

  type FileEntry = { fileId: string; zipPath: string };
  const fileEntries: FileEntry[] = [];
  const seenFileIds = new Set<string>();

  for (const collection of authedCollections) {
    const collectionId = String(collection._id);

    if (collection.type === DatasetCollectionTypeEnum.folder) {
      const allDescendants = await findCollectionAndAllChildren({
        teamId,
        collectionId,
        fields: '_id name parentId type fileId'
      });

      const collectionMap = new Map(allDescendants.map((c) => [String(c._id), c]));

      for (const descendant of allDescendants) {
        if (String(descendant._id) === collectionId) continue;
        if (descendant.type !== DatasetCollectionTypeEnum.file) continue;
        if (!descendant.fileId || !isS3ObjectKey(descendant.fileId, 'dataset')) continue;
        if (seenFileIds.has(descendant.fileId)) continue;

        seenFileIds.add(descendant.fileId);
        const relativePath = buildZipPath(descendant, collectionId, collectionMap);
        fileEntries.push({
          fileId: descendant.fileId,
          zipPath: `${collection.name}/${relativePath}`
        });
      }
    } else if (
      collection.type === DatasetCollectionTypeEnum.file &&
      collection.fileId &&
      isS3ObjectKey(collection.fileId, 'dataset')
    ) {
      if (!seenFileIds.has(collection.fileId)) {
        seenFileIds.add(collection.fileId);
        fileEntries.push({
          fileId: collection.fileId,
          zipPath: collection.name
        });
      }
    }
  }

  if (fileEntries.length === 0) {
    res.status(400).json({ message: 'No downloadable files found' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  res.setHeader('Content-Disposition', `attachment; filename="collections-${timestamp}.zip"`);
  res.setHeader('Cache-Control', 'no-cache');

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('error', (err) => {
    addLog.error('Batch download archive error', { error: err });
    if (!res.headersSent) {
      res.status(500).json({ message: 'Archive error' });
    } else {
      res.destroy();
    }
  });

  archive.pipe(res);

  const s3Source = getS3DatasetSource();
  for (const entry of fileEntries) {
    try {
      const stream = await s3Source.getFileStream(entry.fileId);
      if (stream) {
        archive.append(stream as any, { name: entry.zipPath });
      }
    } catch (err) {
      addLog.warn('Failed to get file stream, skipping', { fileId: entry.fileId, error: err });
    }
  }

  await archive.finalize();
}

export default NextAPI(handler);
