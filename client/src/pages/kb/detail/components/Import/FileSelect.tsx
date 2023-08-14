import MyIcon from '@/components/Icon';
import { useLoading } from '@/hooks/useLoading';
import { useSelectFile } from '@/hooks/useSelectFile';
import { useToast } from '@/hooks/useToast';
import { fileDownload } from '@/utils/file';
import { Box, Flex, Text, type BoxProps } from '@chakra-ui/react';
import { DragEvent, useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';

interface Props extends BoxProps {
  fileExtension: string;
  tipText?: string;
  onSelectFile: (files: File[]) => Promise<void>;
  isLoading?: boolean;
  isCsv?: boolean;
}

const FileSelect = ({
  fileExtension,
  onSelectFile,
  isLoading,
  tipText,
  isCsv = false,
  ...props
}: Props) => {
  const { Loading: FileSelectLoading } = useLoading();
  const { t } = useTranslation();
  const csvTemplate = `question,answer,source\n"什么是 laf","laf 是一个云函数开发平台……","laf git doc"\n"什么是 sealos","Sealos 是以 kubernetes 为内核的云操作系统发行版,可以……","sealos git doc"`;

  const { toast } = useToast();

  const { File, onOpen } = useSelectFile({
    fileType: fileExtension,
    multiple: true
  });

  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
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
  }, []);

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
            {t('file.Drag and drop')}
            <Text ml={1} as={'span'} cursor={'pointer'} color={'myBlue.700'} onClick={onOpen}>
              {t('file.select a document')}
            </Text>
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
      <FileSelectLoading loading={isLoading} fixed={false} />
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default FileSelect;
