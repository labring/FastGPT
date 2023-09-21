import MyIcon from '@/components/Icon';
import { useLoading } from '@/hooks/useLoading';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useToast } from '@/hooks/useToast';
import { simpleText, splitText2Chunks } from '@/utils/file';
import {
  uploadFiles,
  fileDownload,
  readCsvContent,
  readTxtContent,
  readPdfContent,
  readDocContent
} from '@/utils/web/file';
import { Box, Flex, useDisclosure, type BoxProps } from '@chakra-ui/react';
import { fileImgs } from '@/constants/common';
import { DragEvent, useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { customAlphabet } from 'nanoid';
import dynamic from 'next/dynamic';
import MyTooltip from '@/components/MyTooltip';
import { FetchResultItem } from '@/types/plugin';
import type { DatasetDataItemType } from '@/types/core/dataset/data';
import { getErrText } from '@/utils/tools';
import { useDatasetStore } from '@/store/dataset';

const UrlFetchModal = dynamic(() => import('./UrlFetchModal'));
const CreateFileModal = dynamic(() => import('./CreateFileModal'));

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);
const csvTemplate = `index,content,source\n"被索引的内容","对应的答案。CSV 中请注意内容不能包含双引号，双引号是列分割符号","来源，可选。"\n"什么是 laf","laf 是一个云函数开发平台……",""\n"什么是 sealos","Sealos 是以 kubernetes 为内核的云操作系统发行版,可以……",""`;

export type FileItemType = {
  id: string;
  filename: string;
  chunks: DatasetDataItemType[];
  text: string;
  icon: string;
  tokens: number;
};
interface Props extends BoxProps {
  fileExtension: string;
  onPushFiles: (files: FileItemType[]) => void;
  tipText?: string;
  chunkLen?: number;
  isCsv?: boolean;
  showUrlFetch?: boolean;
  showCreateFile?: boolean;
}

const FileSelect = ({
  fileExtension,
  onPushFiles,
  tipText,
  chunkLen = 500,
  isCsv = false,
  showUrlFetch = true,
  showCreateFile = true,
  ...props
}: Props) => {
  const { kbDetail } = useDatasetStore();
  const { Loading: FileSelectLoading } = useLoading();
  const { t } = useTranslation();

  const { toast } = useToast();

  const { File, onOpen } = useSelectFile({
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

  const onSelectFile = useCallback(
    async (files: File[]) => {
      try {
        // Parse file by file
        const chunkFiles: FileItemType[] = [];

        for await (let file of files) {
          const extension = file?.name?.split('.')?.pop()?.toLowerCase();

          /* text file */
          const icon = fileImgs.find((item) => new RegExp(item.suffix, 'gi').test(file.name))?.src;

          if (!icon) {
            continue;
          }

          // parse and upload files
          let [text, filesId] = await Promise.all([
            (async () => {
              switch (extension) {
                case 'txt':
                case 'md':
                  return readTxtContent(file);
                case 'pdf':
                  return readPdfContent(file);
                case 'doc':
                case 'docx':
                  return readDocContent(file);
              }
              return '';
            })(),
            uploadFiles([file], { kbId: kbDetail._id }, (percent) => {
              if (percent < 100) {
                setSelectingText(
                  t('file.Uploading', { name: file.name.slice(0, 20), percent }) || ''
                );
              } else {
                setSelectingText(t('file.Parse', { name: file.name.slice(0, 20) }) || '');
              }
            })
          ]);

          if (text) {
            text = simpleText(text);
            const splitRes = splitText2Chunks({
              text,
              maxLen: chunkLen
            });

            const fileItem: FileItemType = {
              id: filesId[0],
              filename: file.name,
              icon,
              text,
              tokens: splitRes.tokens,
              chunks: splitRes.chunks.map((chunk) => ({
                q: chunk,
                a: '',
                source: file.name,
                file_id: filesId[0]
              }))
            };
            chunkFiles.unshift(fileItem);
            continue;
          }

          /* csv file */
          if (extension === 'csv') {
            const { header, data } = await readCsvContent(file);
            if (header[0] !== 'index' || header[1] !== 'content') {
              throw new Error('csv 文件格式有误,请确保 index 和 content 两列');
            }
            const fileItem: FileItemType = {
              id: filesId[0],
              filename: file.name,
              icon,
              tokens: 0,
              text: '',
              chunks: data
                .filter((item) => item[0])
                .map((item) => ({
                  q: item[0] || '',
                  a: item[1] || '',
                  source: item[2] || file.name || '',
                  file_id: filesId[0]
                }))
            };

            chunkFiles.unshift(fileItem);
          }
        }
        onPushFiles(chunkFiles);
      } catch (error: any) {
        console.log(error);
        toast({
          title: getErrText(error, '解析文件失败'),
          status: 'error'
        });
      }
      setSelectingText(undefined);
    },
    [chunkLen, kbDetail._id, onPushFiles, t, toast]
  );
  const onUrlFetch = useCallback(
    (e: FetchResultItem[]) => {
      const result = e.map(({ url, content }) => {
        const splitRes = splitText2Chunks({
          text: content,
          maxLen: chunkLen
        });
        return {
          id: nanoid(),
          filename: url,
          icon: '/imgs/files/url.svg',
          text: content,
          tokens: splitRes.tokens,
          chunks: splitRes.chunks.map((chunk) => ({
            q: chunk,
            a: '',
            source: url
          }))
        };
      });
      onPushFiles(result);
    },
    [chunkLen, onPushFiles]
  );
  const onCreateFile = useCallback(
    ({ filename, content }: { filename: string; content: string }) => {
      content = simpleText(content);
      const splitRes = splitText2Chunks({
        text: content,
        maxLen: chunkLen
      });
      onPushFiles([
        {
          id: nanoid(),
          filename,
          icon: '/imgs/files/txt.svg',
          text: content,
          tokens: splitRes.tokens,
          chunks: splitRes.chunks.map((chunk) => ({
            q: chunk,
            a: '',
            source: filename
          }))
        }
      ]);
    },
    [chunkLen, onPushFiles]
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
      {isCsv && (
        <Box
          mt={1}
          cursor={'pointer'}
          textDecoration={'underline'}
          color={'myBlue.600'}
          fontSize={'12px'}
          onClick={() =>
            fileDownload({
              text: csvTemplate,
              type: 'text/csv',
              filename: 'template.csv'
            })
          }
        >
          {t('file.Click to download CSV template')}
        </Box>
      )}
      {selectingText !== undefined && (
        <FileSelectLoading loading text={selectingText} fixed={false} />
      )}
      <File onSelect={onSelectFile} />
      {isOpenUrlFetch && <UrlFetchModal onClose={onCloseUrlFetch} onSuccess={onUrlFetch} />}
      {isOpenCreateFile && <CreateFileModal onClose={onCloseCreateFile} onSuccess={onCreateFile} />}
    </Box>
  );
};

export default FileSelect;
