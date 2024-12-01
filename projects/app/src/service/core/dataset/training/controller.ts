import { ImportDataSourceEnum, TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  postCreateDatasetFileCollection,
  postCreateDatasetLinkCollection,
  postCreateDatasetTextCollection,
  postCreateDatasetCsvTableCollection,
  postCreateDatasetExternalFileCollection,
  getDatasetCollectionById
} from '@/web/core/dataset/api';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';

/* insert dataset data.
 * 1. validate inputs
 * 2. fetch dataset collection data
 * 3. process sources based on mode
 * 4. upload the data
 * 5. update the status of sources
 */
export async function reTraining({
  collectionId,
  adjustTraining,
  mode,
  customSplitChar = '',
  qaPrompt = '',
  webSelector = '',
  chunkSize,
  parentId,
  datasetDetail,
  setSources,
  importSource
}: {
  collectionId: string;
  adjustTraining: string;
  mode: TrainingModeEnum;
  customSplitChar?: string;
  qaPrompt?: string;
  webSelector?: string;
  chunkSize: number;
  parentId?: string;
  datasetDetail: DatasetItemType;
  setSources: (value: React.SetStateAction<ImportSourceItemType[]>) => void;
  importSource: ImportDataSourceEnum;
}) {
  if (!collectionId || !adjustTraining || !mode || !chunkSize || !datasetDetail) {
    return Promise.reject('Missing required parameters');
  }

  // Fetch dataset collection by ID
  const response = await getDatasetCollectionById(collectionId);
  const collection = response ? response : null;
  const error = !response ? 'Collection not found' : null;

  if (error || !collection) {
    return Promise.reject('Collection not found');
  }

  // Create sources from collection
  const sources: ImportSourceItemType[] = [
    {
      dbFileId: collection.fileId || undefined,
      createStatus: 'waiting',
      icon: getFileIcon(collection.name) || 'default-icon',
      id: collection._id,
      isUploading: false,
      sourceName: collection.name,
      sourceSize: collection.file?.length ? `${collection.file.length} B` : undefined,
      uploadedFileRate: 100,
      link: collection.rawLink || undefined
    }
  ];

  // Handle sources based on adjustTraining state
  setSources(sources);

  // Start the upload process based on mode
  if (sources.length === 0) {
    return Promise.reject('No sources to upload');
  }

  // Filter waiting sources
  const filterWaitingSources = sources.filter((item) => item.createStatus === 'waiting');

  // Batch create collection and upload chunks
  for await (const item of filterWaitingSources) {
    // Update source status to 'creating'
    setSources((state) =>
      state.map((source) =>
        source.id === item.id
          ? {
              ...source,
              createStatus: 'creating'
            }
          : source
      )
    );

    // create collection
    const commonParams = {
      parentId,
      trainingType: mode,
      datasetId: datasetDetail._id,
      chunkSize,
      chunkSplitter: customSplitChar,
      qaPrompt,

      name: item.sourceName
    };

    try {
      if (importSource === ImportDataSourceEnum.fileLocal && item.dbFileId) {
        await postCreateDatasetFileCollection({
          ...commonParams,
          fileId: item.dbFileId
        });
      } else if (importSource === ImportDataSourceEnum.fileLink && item.link) {
        await postCreateDatasetLinkCollection({
          ...commonParams,
          link: item.link,
          metadata: {
            webPageSelector: webSelector
          }
        });
      } else if (importSource === ImportDataSourceEnum.fileCustom && item.rawText) {
        // manual collection
        await postCreateDatasetTextCollection({
          ...commonParams,
          text: item.rawText
        });
      } else if (importSource === ImportDataSourceEnum.csvTable && item.dbFileId) {
        await postCreateDatasetCsvTableCollection({
          ...commonParams,
          fileId: item.dbFileId
        });
      } else if (importSource === ImportDataSourceEnum.externalFile && item.externalFileUrl) {
        await postCreateDatasetExternalFileCollection({
          ...commonParams,
          externalFileUrl: item.externalFileUrl,
          externalFileId: item.externalFileId,
          filename: item.sourceName
        });
      }

      setSources((state) =>
        state.map((source) =>
          source.id === item.id
            ? {
                ...source,
                createStatus: 'finish'
              }
            : source
        )
      );
    } catch (error) {
      console.error('Error occurred during dataset import:', error);
    }
  }

  return { message: 'Import success', sources };
}
