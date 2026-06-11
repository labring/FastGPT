import { replaceS3KeyToPreviewUrl } from '../../../core/dataset/utils';
import { addEndpointToImageUrl } from '../../../common/file/image/utils';
import type {
  DatasetDataSchemaType,
  CreateDatasetDataPropsType
} from '@fastgpt/global/core/dataset/type';
import { addDays } from 'date-fns';
import { isS3ObjectKey, jwtSignS3DownloadToken } from '../../../common/s3/utils';
import { S3Buckets } from '../../../common/s3/config/constants';
import { MongoDatasetData } from './schema';
import { MongoDatasetDataText } from './dataTextSchema';
import { jiebaSplit } from '../../../common/string/jieba/index';
import { detectLang } from 'diting-rag-ts';
import { removeS3TTL } from '../../../common/s3/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import type { ClientSession } from '../../../common/mongo';
import { addLog } from '../../../common/system/log';

export const formatDatasetDataValue = ({
  q,
  a,
  imageId,
  imageDescMap
}: {
  q: string;
  a?: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
}): {
  q: string;
  a?: string;
  imagePreivewUrl?: string;
} => {
  // Add image description to image markdown
  if (imageDescMap) {
    // Helper function to replace image markdown with description
    const replaceImageMarkdown = (text: string): string => {
      return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, url) => {
        const description = imageDescMap[url];
        if (description) {
          // Add description to alt text, keeping original if exists
          const newAltText = altText ? `${altText} - ${description}` : description;
          return `![${newAltText.replace(/\n/g, '')}](${url})`;
        }
        return match; // Return original if no description found
      });
    };

    // Apply replacement to both q and a
    q = replaceImageMarkdown(q);
    if (a) {
      a = replaceImageMarkdown(a);
    }
  }

  // Add image base url
  q = addEndpointToImageUrl(q);
  if (a) {
    a = addEndpointToImageUrl(a);
  }

  if (!imageId) {
    return {
      q: replaceS3KeyToPreviewUrl(q, addDays(new Date(), 90)),
      a: a ? replaceS3KeyToPreviewUrl(a, addDays(new Date(), 90)) : undefined
    };
  }

  const imagePreivewUrl = isS3ObjectKey(imageId, 'dataset')
    ? jwtSignS3DownloadToken({
        objectKey: imageId,
        bucketName: S3Buckets.private,
        expiredTime: addDays(new Date(), 90)
      })
    : imageId;

  return {
    q: `![${q.replaceAll('\n', '')}](${imagePreivewUrl})`,
    a,
    imagePreivewUrl
  };
};

export const getFormatDatasetCiteList = (list: DatasetDataSchemaType[]) => {
  return list.map((item) => ({
    _id: item._id,
    ...formatDatasetDataValue({
      q: item.q,
      a: item.a,
      imageId: item.imageId
    }),
    history: item.history,
    updateTime: item.updateTime,
    index: item.chunkIndex
  }));
};

// ============================================================================
// Data draft creation (pre-training)
// ============================================================================

/**
 * Create a single draft Data record with empty indexes (no embedding/vectorization).
 * Used to pre-create Data before pushing training tasks, so chunks are visible
 * in the frontend while indexing is still in progress.
 *
 * Subsequent training stages (generateVector, generateImageIndex, etc.)
 * will UPDATE this Data record rather than creating new ones.
 *
 * @returns The created Data's _id, used to associate with Training records via dataId.
 */
export async function createDataDraft({
  id,
  teamId,
  tmbId,
  datasetId,
  collectionId,
  q,
  a,
  imageId,
  chunkIndex = 0,
  metadata,
  imageDescMap,
  session
}: CreateDatasetDataPropsType & {
  imageDescMap?: Record<string, string>;
  session?: ClientSession;
}) {
  if (!datasetId || !collectionId) {
    return Promise.reject('datasetId, collectionId is required');
  }
  if (String(teamId) === String(tmbId)) {
    return Promise.reject("teamId and tmbId can't be the same");
  }

  const detectedLanguage = detectLang(q || '');
  const mergedMetadata = { ...(metadata || {}), detectedLanguage };

  // Create Data with empty indexes (filled later by insertDataVector in generateVector)
  const [{ _id }] = await MongoDatasetData.create(
    [
      {
        ...(id && { _id: id }),
        teamId,
        tmbId,
        datasetId,
        collectionId,
        q: q || '',
        a,
        imageId,
        imageDescMap,
        chunkIndex,
        indexes: [],
        createTime: new Date(),
        ...(Object.keys(mergedMetadata).length > 0 && { metadata: mergedMetadata })
      }
    ],
    { session, ordered: true }
  );

  // Create DataText with jieba分词 (may be empty for image chunks, filled later by imageParse)
  const fullText = `${q || ''}\n${a || ''}`.trim();
  await MongoDatasetDataText.create(
    [
      {
        teamId,
        datasetId,
        collectionId,
        dataId: _id,
        fullTextToken: fullText ? await jiebaSplit({ text: fullText }) : ''
      }
    ],
    { session, ordered: true }
  );

  // Remove image TTL
  if (isS3ObjectKey(imageId, 'dataset')) {
    await removeS3TTL({ key: imageId, bucketName: 'private', session });
  }

  return { _id };
}

/**
 * Batch version of createDataDraft. Creates multiple Data drafts efficiently
 * using bulk MongoDB inserts and parallel S3 TTL removal.
 *
 * @returns Array of { _id } in the same order as the input items.
 */
export async function createDataDrafts({
  items,
  teamId,
  tmbId,
  datasetId,
  collectionId,
  session
}: {
  items: (Omit<CreateDatasetDataPropsType, 'teamId' | 'tmbId' | 'datasetId' | 'collectionId'> & {
    imageDescMap?: Record<string, string>;
  })[];
  teamId: string;
  tmbId: string;
  datasetId: string;
  collectionId: string;
  session?: ClientSession;
}) {
  if (!datasetId || !collectionId) {
    return Promise.reject('datasetId, collectionId is required');
  }

  const BATCH_SIZE = 500;
  const MAX_BATCHES_PER_TRANSACTION = 20; // Same as pushDataListToTrainingQueue
  const CHUNK_SIZE = MAX_BATCHES_PER_TRANSACTION * BATCH_SIZE; // 10,000 per transaction

  /**
   * Insert data for one chunk within a single session/transaction.
   */
  const insertChunk = async (
    chunkItems: typeof items,
    chunkSession: ClientSession
  ): Promise<{ _id: any }[]> => {
    const results: { _id: any }[] = [];

    for (let offset = 0; offset < chunkItems.length; offset += BATCH_SIZE) {
      const batch = chunkItems.slice(offset, offset + BATCH_SIZE);

      // 1. Build Data documents for this batch
      const draftDataItems = batch.map((item, i) => {
        const q = item.q || '';
        const a = item.a || '';
        const detectedLanguage = detectLang(q);
        const mergedMetadata = { ...(item.metadata || {}), detectedLanguage };
        return {
          ...(item.id && { _id: item.id }),
          teamId,
          tmbId,
          datasetId,
          collectionId,
          q,
          a,
          ...(item.imageId && { imageId: item.imageId }),
          ...(item.imageDescMap && { imageDescMap: item.imageDescMap }),
          chunkIndex: item.chunkIndex ?? offset + i,
          indexes: [],
          createTime: new Date(),
          ...(Object.keys(mergedMetadata).length > 0 && { metadata: mergedMetadata })
        };
      });

      // 2. Batch insert Data records
      const draftDocs = await MongoDatasetData.create(draftDataItems, {
        session: chunkSession,
        ordered: true
      });

      // 3. Compute jieba tokens and batch insert DataText records
      const textTokens = await Promise.all(
        draftDocs.map((doc) => {
          const fullText = `${doc.q}\n${doc.a || ''}`.trim();
          return fullText ? jiebaSplit({ text: fullText }) : '';
        })
      );
      await MongoDatasetDataText.create(
        textTokens.map((token, i) => ({
          teamId,
          datasetId,
          collectionId,
          dataId: draftDocs[i]._id,
          fullTextToken: token
        })),
        { session: chunkSession, ordered: true }
      );

      // 4. Remove S3 TTL for images in this batch (parallel)
      const batchImageIds = draftDocs
        .map((doc) => doc.imageId)
        .filter((id): id is string => !!id && isS3ObjectKey(id, 'dataset'));
      if (batchImageIds.length > 0) {
        await Promise.all(
          batchImageIds.map((key) =>
            removeS3TTL({ key, bucketName: 'private', session: chunkSession })
          )
        );
      }

      results.push(...draftDocs);

      addLog.debug('createDataDrafts batch progress', {
        done: offset + batch.length,
        chunkTotal: chunkItems.length
      });
    }

    return results;
  };

  // Large dataset: split into multiple independent transactions to avoid timeout.
  // Same strategy as pushDataListToTrainingQueue — ignores the incoming session
  // because a single transaction cannot hold >10,000 writes.
  if (items.length > CHUNK_SIZE) {
    addLog.info('createDataDrafts: large dataset, using chunked transactions', {
      itemCount: items.length,
      chunkSize: CHUNK_SIZE
    });

    const allResults: { _id: any }[] = [];

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);

      // mongoSessionRun has its own internal retryFn that handles transaction
      // failures with proper rollback — no outer retry needed.
      const chunkResults = await mongoSessionRun(async (chunkSession) => {
        return insertChunk(chunk, chunkSession);
      });
      allResults.push(...chunkResults);
    }

    return allResults.map((doc) => ({ _id: doc._id }));
  }

  // Small dataset: use the caller's session if provided, otherwise create our own.
  if (session) {
    const results = await insertChunk(items, session);
    return results.map((doc) => ({ _id: doc._id }));
  }

  const results = await mongoSessionRun(async (newSession) => {
    return insertChunk(items, newSession);
  });
  return results.map((doc) => ({ _id: doc._id }));
}
