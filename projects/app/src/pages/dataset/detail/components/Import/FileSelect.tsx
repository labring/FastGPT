import MyIcon from '@/components/Icon';
import { useLoading } from '@/web/common/hooks/useLoading';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@/web/common/hooks/useToast';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { simpleText } from '@fastgpt/global/common/string/tools';
import {
  fileDownload,
  readCsvContent,
  readTxtContent,
  readPdfContent,
  readDocContent
} from '@/web/common/file/utils';
import { uploadFiles } from '@/web/common/file/controller';
import { Box, Flex, useDisclosure, type BoxProps } from '@chakra-ui/react';
import React, { DragEvent, useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { customAlphabet } from 'nanoid';
import dynamic from 'next/dynamic';
import MyTooltip from '@/components/MyTooltip';
import type { FetchResultItem } from '@fastgpt/global/common/plugin/types/pluginRes.d';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';

const UrlFetchModal = dynamic(() => import('./UrlFetchModal'));
const CreateFileModal = dynamic(() => import('./CreateFileModal'));

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export type FileItemType = {
  id: string; // fileId / raw Link
  filename: string;
  chunks: PushDatasetDataChunkProps[];
  text: string; // raw text
  icon: string;
  tokens: number; // total tokens
  type: DatasetCollectionTypeEnum.file | DatasetCollectionTypeEnum.link;
  metadata: DatasetCollectionSchemaType['metadata'];
};

export interface Props extends BoxProps {
  fileExtension: string;
  onPushFiles: (files: FileItemType[]) => void;
  tipText?: string;
  chunkLen?: number;
  overlapRatio?: number;
  fileTemplate?: {
    type: string;
    filename: string;
    value: string;
  };
  showUrlFetch?: boolean;
  showCreateFile?: boolean;
  tip?: string;
}

const FileSelect = ({
  fileExtension,
  onPushFiles,
  tipText,
  chunkLen = 500,
  overlapRatio,
  fileTemplate,
  showUrlFetch = true,
  showCreateFile = true,
  tip,
  ...props
}: Props) => {
  const { datasetDetail } = useDatasetStore();
  const { Loading: FileSelectLoading } = useLoading();
  const { t } = useTranslation();

  const { toast } = useToast();

  const { File: FileSelector, onOpen } = useSelectFile({
    fileType: fileExtension,
    multiple: true
  });

  const [isDragging, setIsDragging] = useState(false);
  const [selectingText, setSelectingText] = useState<string>();

  const {
    isOpen: isOpenUrlFetch,
    onOpen: onOpenUrlFetch,
    onClose: onCloseUrlFetch
  } = useDisclosure();
  const {
    isOpen: isOpenCreateFile,
    onOpen: onOpenCreateFile,
    onClose: onCloseCreateFile
  } = useDisclosure();

  // select file
  const onSelectFile = useCallback(
    async (files: File[]) => {
      if (files.length >= 100) {
        return toast({
          status: 'warning',
          title: t('common.file.Select file amount limit 100')
        });
      }

      try {
        for await (let file of files) {
          const extension = file?.name?.split('.')?.pop()?.toLowerCase();

          /* text file */
          const icon = getFileIcon(file?.name);

          // ts
          if (!icon) continue;

          // upload file
          const filesId = await uploadFiles({
            files: [file],
            bucketName: 'dataset',
            metadata: { datasetId: datasetDetail._id },
            percentListen: (percent) => {
              if (percent < 100) {
                setSelectingText(
                  t('file.Uploading', { name: file.name.slice(0, 30), percent }) || ''
                );
              } else {
                setSelectingText(t('file.Parse', { name: file.name.slice(0, 30) }) || '');
              }
            }
          });
          const fileId = filesId[0];

          /* csv file */
          if (extension === 'csv') {
            const { header, data } = await readCsvContent(file);
            if (header[0] !== 'index' || header[1] !== 'content') {
              throw new Error('csv 文件格式有误,请确保 index 和 content 两列');
            }

            const filterData = data
              .filter((item) => item[0])
              .map((item) => ({
                q: item[0] || '',
                a: item[1] || ''
              }));

            const fileItem: FileItemType = {
              id: nanoid(),
              filename: file.name,
              icon,
              tokens: filterData.reduce((sum, item) => sum + countPromptTokens(item.q), 0),
              text: `${header.join(',')}\n${data
                .map((item) => `"${item[0]}","${item[1]}"`)
                .join('\n')}`,
              chunks: filterData,
              type: DatasetCollectionTypeEnum.file,
              metadata: {
                fileId
              }
            };

            onPushFiles([fileItem]);
            continue;
          }

          // parse and upload files
          let text = await (async () => {
            switch (extension) {
              case 'txt':
              case 'md':
                return readTxtContent(file);
              case 'pdf':
                return readPdfContent(file);
              case 'docx':
                return readDocContent(file);
            }
            return '';
          })();

          if (text) {
            text = simpleText(text);
            const splitRes = splitText2Chunks({
              text,
              chunkLen,
              overlapRatio
            });

            const fileItem: FileItemType = {
              id: nanoid(),
              filename: file.name,
              icon,
              text,
              tokens: splitRes.tokens,
              type: DatasetCollectionTypeEnum.file,
              metadata: {
                fileId
              },
              chunks: splitRes.chunks.map((chunk) => ({
                q: chunk,
                a: ''
              }))
            };
            onPushFiles([fileItem]);
          }
        }
      } catch (error: any) {
        console.log(error);
        toast({
          title: getErrText(error, '解析文件失败'),
          status: 'error'
        });
      }
      setSelectingText(undefined);
    },
    [chunkLen, datasetDetail._id, onPushFiles, overlapRatio, t, toast]
  );
  // link fetch
  const onUrlFetch = useCallback(
    (e: FetchResultItem[]) => {
      const result: FileItemType[] = e.map(({ url, content }) => {
        const splitRes = splitText2Chunks({
          text: content,
          chunkLen,
          overlapRatio
        });
        return {
          id: nanoid(),
          filename: url,
          icon: '/imgs/files/link.svg',
          text: content,
          tokens: splitRes.tokens,
          type: DatasetCollectionTypeEnum.link,
          metadata: {
            rawLink: url
          },
          chunks: splitRes.chunks.map((chunk) => ({
            q: chunk,
            a: ''
          }))
        };
      });
      onPushFiles(result);
    },
    [chunkLen, onPushFiles, overlapRatio]
  );
  // manual create file and copy data
  const onCreateFile = useCallback(
    async ({ filename, content }: { filename: string; content: string }) => {
      content = simpleText(content);

      // create virtual txt file
      const txtBlob = new Blob([content], { type: 'text/plain' });
      const txtFile = new File([txtBlob], `${filename}.txt`, {
        type: txtBlob.type,
        lastModified: new Date().getTime()
      });
      const fileIds = await uploadFiles({
        files: [txtFile],
        bucketName: 'dataset',
        metadata: { datasetId: datasetDetail._id }
      });

      const splitRes = splitText2Chunks({
        text: content,
        chunkLen,
        overlapRatio
      });

      onPushFiles([
        {
          id: nanoid(),
          filename,
          icon: '/imgs/files/txt.svg',
          text: content,
          tokens: splitRes.tokens,
          type: DatasetCollectionTypeEnum.file,
          metadata: {
            fileId: fileIds[0]
          },
          chunks: splitRes.chunks.map((chunk) => ({
            q: chunk,
            a: ''
          }))
        }
      ]);
    },
    [chunkLen, datasetDetail._id, onPushFiles, overlapRatio]
  );

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      const fileList: File[] = [];

      if (e.dataTransfer.items.length <= 1) {
        const traverseFileTree = async (item: any) => {
          return new Promise<void>((resolve, reject) => {
            if (item.isFile) {
              item.file((file: File) => {
                fileList.push(file);
                resolve();
              });
            } else if (item.isDirectory) {
              const dirReader = item.createReader();
              dirReader.readEntries(async (entries: any[]) => {
                for (let i = 0; i < entries.length; i++) {
                  await traverseFileTree(entries[i]);
                }
                resolve();
              });
            }
          });
        };

        for (let i = 0; i < items.length; i++) {
          const item = items[i].webkitGetAsEntry();
          if (item) {
            await traverseFileTree(item);
          }
        }
      } else {
        const files = Array.from(e.dataTransfer.files);
        let isErr = files.some((item) => item.type === '');
        if (isErr) {
          return toast({
            title: t('file.upload error description'),
            status: 'error'
          });
        }

        for (let i = 0; i < files.length; i++) {
          fileList.push(files[i]);
        }
      }

      onSelectFile(fileList);
    },
    [onSelectFile, t, toast]
  );

  const SelectTextStyles: BoxProps = {
    ml: 1,
    as: 'span',
    cursor: 'pointer',
    color: 'myBlue.700',
    _hover: {
      textDecoration: 'underline'
    }
  };

  return (
    <Box
      display={'inline-block'}
      textAlign={'center'}
      bg={'myWhite.400'}
      p={5}
      borderRadius={'lg'}
      border={'1px dashed'}
      borderColor={'myGray.300'}
      w={'100%'}
      position={'relative'}
      {...props}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Flex justifyContent={'center'} alignItems={'center'}>
        <MyIcon mr={1} name={'uploadFile'} w={'16px'} />
        {isDragging ? (
          t('file.Release the mouse to upload the file')
        ) : (
          <Box>
            {t('file.Drag and drop')},
            <MyTooltip label={t('file.max 10')}>
              <Box {...SelectTextStyles} onClick={onOpen}>
                {t('file.select a document')}
              </Box>
            </MyTooltip>
            {showUrlFetch && (
              <>
                ,
                <Box {...SelectTextStyles} onClick={onOpenUrlFetch}>
                  {t('file.Fetch Url')}
                </Box>
              </>
            )}
            {showCreateFile && (
              <>
                ,
                <Box {...SelectTextStyles} onClick={onOpenCreateFile}>
                  {t('file.Create file')}
                </Box>
              </>
            )}
          </Box>
        )}
      </Flex>
      <Box mt={1}>{t('file.support', { fileExtension: fileExtension })}</Box>
      {tipText && (
        <Box mt={1} fontSize={'sm'} color={'myGray.600'}>
          {t(tipText)}
        </Box>
      )}
      {!!fileTemplate && (
        <Box
          mt={1}
          cursor={'pointer'}
          textDecoration={'underline'}
          color={'myBlue.600'}
          fontSize={'12px'}
          onClick={() =>
            fileDownload({
              text: fileTemplate.value,
              type: fileTemplate.type,
              filename: fileTemplate.filename
            })
          }
        >
          {t('file.Click to download file template', { name: fileTemplate.filename })}
        </Box>
      )}
      {!!tip && <Box color={'myGray.500'}>{tip}</Box>}
      {selectingText !== undefined && (
        <FileSelectLoading loading text={selectingText} fixed={false} />
      )}
      <FileSelector onSelect={onSelectFile} />
      {isOpenUrlFetch && <UrlFetchModal onClose={onCloseUrlFetch} onSuccess={onUrlFetch} />}
      {isOpenCreateFile && <CreateFileModal onClose={onCloseCreateFile} onSuccess={onCreateFile} />}
    </Box>
  );
};

export default FileSelect;
