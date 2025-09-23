import { useTranslation } from 'next-i18next';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { useFileUpload } from '../core/chat/ChatContainer/ChatBox/hooks/useFileUpload';
import { useEffect } from 'react';
import { isEqual } from 'lodash';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FilePreview from '../core/chat/ChatContainer/components/FilePreview';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useChatStore } from '@/web/core/chat/context/useChatStore';

const FileSelector = ({
  onChange,
  value,

  form,
  fieldName,

  canSelectFile = true,
  canSelectImg = false,
  maxFiles = 5,
  setUploading,

  isDisabled = false
}: {
  onChange: (...event: any[]) => void;
  value: any;

  form?: UseFormReturn<any>;
  fieldName?: string;

  canSelectFile?: boolean;
  canSelectImg?: boolean;
  maxFiles?: number;
  setUploading?: (uploading: boolean) => void;

  isDisabled?: boolean;
}) => {
  const { t } = useTranslation();

  const { appId, chatId, outLinkAuthData } = useChatStore();
  const fileCtrl = useFieldArray({
    control: form?.control,
    name: fieldName as any
  });
  const {
    File,
    fileList,
    selectFileIcon,
    uploadFiles,
    onOpenSelectFile,
    onSelectFile,
    removeFiles,
    replaceFiles,
    hasFileUploading
  } = useFileUpload({
    fileSelectConfig: {
      canSelectFile,
      canSelectImg,
      maxFiles
    },
    outLinkAuthData,
    appId,
    chatId,
    fileCtrl: fileCtrl as any
  });

  useEffect(() => {
    if (!Array.isArray(value)) {
      replaceFiles([]);
      return;
    }

    // compare file names and update if different
    const valueFileNames = value.map((item) => item.name);
    const currentFileNames = fileList.map((item) => item.name);
    if (!isEqual(valueFileNames, currentFileNames)) {
      replaceFiles(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList]
  });

  useEffect(() => {
    setUploading?.(hasFileUploading);
    onChange(
      fileList.map((item) => ({
        type: item.type,
        name: item.name,
        url: item.url,
        icon: item.icon
      }))
    );
  }, [fileList, hasFileUploading, onChange, setUploading]);

  return (
    <>
      <Flex alignItems={'center'}>
        <Button
          isDisabled={isDisabled}
          leftIcon={<MyIcon name={selectFileIcon as any} w={'16px'} />}
          variant={'whiteBase'}
          onClick={() => {
            onOpenSelectFile();
          }}
        >
          {t('chat:select')}
        </Button>
      </Flex>
      <FilePreview fileList={fileList} removeFiles={isDisabled ? undefined : removeFiles} />
      {fileList.length === 0 && <EmptyTip py={0} mt={3} text={t('chat:not_select_file')} />}

      <File onSelect={(files) => onSelectFile({ files })} />
    </>
  );
};

export default FileSelector;
