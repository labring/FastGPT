import React, { useRef, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useI18n } from '@/web/context/I18n';
import { useMemoizedFn } from 'ahooks';
import { compressImgFileAndUpload } from '../controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

export const useSelectFile = (props?: {
  fileType?: string;
  multiple?: boolean;
  maxCount?: number;
}) => {
  const { t } = useTranslation();
  const { fileT } = useI18n();
  const { fileType = '*', multiple = false, maxCount = 10 } = props || {};
  const { toast } = useToast();
  const SelectFileDom = useRef<HTMLInputElement>(null);
  const openSign = useRef<any>();

  const File = useMemoizedFn(({ onSelect }: { onSelect: (e: File[], sign?: any) => void }) => (
    <Box position={'absolute'} w={0} h={0} overflow={'hidden'}>
      <input
        ref={SelectFileDom}
        type="file"
        accept={fileType}
        multiple={multiple}
        onChange={(e) => {
          const files = e.target.files;

          if (!files || files?.length === 0) return;

          let fileList = Array.from(files);
          if (fileList.length > maxCount) {
            toast({
              status: 'warning',
              title: fileT('select_file_amount_limit', { max: maxCount })
            });
            fileList = fileList.slice(0, maxCount);
          }
          onSelect(fileList, openSign.current);

          e.target.value = '';
        }}
      />
    </Box>
  ));

  const onOpen = useCallback((sign?: any) => {
    openSign.current = sign;
    SelectFileDom.current && SelectFileDom.current.click();
  }, []);

  const { runAsync: onSelectImage, loading } = useRequest2(
    async (
      e: File[],
      {
        maxW,
        maxH,
        callback
      }: {
        maxW?: number;
        maxH?: number;
        callback?: (e: string) => any;
      }
    ) => {
      const file = e[0];
      if (!file) return Promise.resolve('Can not found image');
      try {
        const src = await compressImgFileAndUpload({
          file,
          maxW,
          maxH
        });
        callback?.(src);
        return src;
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common:error.upload_image_error')),
          status: 'warning'
        });
        return Promise.reject(getErrText(err, t('common:error.upload_image_error')));
      }
    }
  );

  return {
    File,
    onOpen,
    onSelectImage,
    loading
  };
};
