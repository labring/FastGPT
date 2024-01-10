import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@/web/common/hooks/useLoading';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useToast } from '@/web/common/hooks/useToast';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { simpleText } from '@fastgpt/global/common/string/tools';
import { fileDownload, readCsvContent } from '@/web/common/file/utils';
import { getUploadBase64ImgController, uploadFiles } from '@/web/common/file/controller';
import { Box, Flex, useDisclosure, type BoxProps } from '@chakra-ui/react';
import React, { DragEvent, useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { customAlphabet } from 'nanoid';
import dynamic from 'next/dynamic';
import MyTooltip from '@/components/MyTooltip';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { countPromptTokens } from '@fastgpt/global/common/string/tiktoken';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constant';
import type { PushDatasetDataChunkProps } from '@fastgpt/global/core/dataset/api.d';
import { UrlFetchResponse } from '@fastgpt/global/common/file/api.d';
import { readFileRawContent } from '@fastgpt/web/common/file/read/index';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';

const UrlFetchModal = dynamic(() => import('./UrlFetchModal'));
const CreateFileModal = dynamic(() => import('./CreateFileModal'));

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export type FileItemType = {
  id: string; // fileId / raw Link
  filename: string;
  chunks: PushDatasetDataChunkProps[];
  rawText: string; // raw text
  icon: string;
  tokens: number; // total tokens
  type: DatasetCollectionTypeEnum.file | DatasetCollectionTypeEnum.link;
  fileId?: string;
  rawLink?: string;
  metadata?: Record<string, any>;
};

export interface Props extends BoxProps {
  fileExtension: string;
  onPushFiles: (files: FileItemType[]) => void;
  tipText?: string;
  chunkLen?: number;
  customSplitChar?: string;
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
  customSplitChar,
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

          /* QA csv file */
          if (extension === 'csv') {
            const { header, data } = await readCsvContent(file);
            if (header[0] !== 'index' || header[1] !== 'content') {
              throw new Error(t('core.dataset.import.Csv format error'));
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
              rawText: `${header.join(',')}\n${data
                .map((item) => `"${item[0]}","${item[1]}"`)
                .join('\n')}`,
              chunks: filterData,
              type: DatasetCollectionTypeEnum.file,
              fileId
            };

            onPushFiles([fileItem]);
            continue;
          }

          // parse and upload files
          let { rawText } = await readFileRawContent({
            file,
            uploadBase64Controller: (base64Img) =>
              getUploadBase64ImgController({
                base64Img,
                type: MongoImageTypeEnum.docImage,
                metadata: {
                  fileId
                }
              })
          });

          if (rawText) {
            rawText = simpleText(rawText);
            const { chunks, tokens } = splitText2Chunks({
              text: rawText,
              chunkLen,
              overlapRatio,
              customReg: customSplitChar ? [customSplitChar] : []
            });

            const fileItem: FileItemType = {
              id: nanoid(),
              filename: file.name,
              icon,
              rawText,
              tokens,
              type: DatasetCollectionTypeEnum.file,
              fileId,
              chunks: chunks.map((chunk) => ({
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
          title: getErrText(error, t('common.file.Read File Error')),
          status: 'error'
        });
      }
      setSelectingText(undefined);
    },
    [chunkLen, customSplitChar, datasetDetail._id, onPushFiles, overlapRatio, t, toast]
  );
  // link fetch
  const onUrlFetch = useCallback(
    (e: UrlFetchResponse) => {
      const result: FileItemType[] = e.map<FileItemType>(({ url, content, selector }) => {
        const { chunks, tokens } = splitText2Chunks({
          text: content,
          chunkLen,
          overlapRatio,
          customReg: customSplitChar ? [customSplitChar] : []
        });
        return {
          id: nanoid(),
          filename: url,
          icon: '/imgs/files/link.svg',
          rawText: content,
          tokens,
          type: DatasetCollectionTypeEnum.link,
          rawLink: url,
          chunks: chunks.map((chunk) => ({
            q: chunk,
            a: ''
          })),
          metadata: {
            webPageSelector: selector
          }
        };
      });
      onPushFiles(result);
    },
    [chunkLen, customSplitChar, onPushFiles, overlapRatio]
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

      const { chunks, tokens } = splitText2Chunks({
        text: content,
        chunkLen,
        overlapRatio,
        customReg: customSplitChar ? [customSplitChar] : []
      });

      onPushFiles([
        {
          id: nanoid(),
          filename,
          icon: '/imgs/files/txt.svg',
          rawText: content,
          tokens,
          type: DatasetCollectionTypeEnum.file,
          fileId: fileIds[0],
          chunks: chunks.map((chunk) => ({
            q: chunk,
            a: ''
          }))
        }
      ]);
    },
    [chunkLen, customSplitChar, datasetDetail._id, onPushFiles, overlapRatio]
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
    color: 'primary.600',
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
      borderRadius={'md'}
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
        <MyIcon mr={1} name={'file/uploadFile'} w={'16px'} />
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
          color={'primary.500'}
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
