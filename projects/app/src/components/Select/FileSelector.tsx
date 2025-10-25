import { useTranslation } from 'next-i18next';
import type { UseFormReturn } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import { useFileUpload } from '../core/chat/ChatContainer/ChatBox/hooks/useFileUpload';
import { useEffect, useMemo } from 'react';
import { isEqual } from 'lodash';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import FilePreview from '../core/chat/ChatContainer/components/FilePreview';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import FileSelect from '../../pageComponents/dataset/detail/Import/components/FileSelector';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '../../../../../packages/global/core/app/type';

const FileSelector = ({
  onChange,
  value,

  form,
  fieldName,

  canSelectFile = true,
  canSelectImg = false,
  canSelectVideo = false,
  canSelectAudio = false,
  canSelectCustomFileExtension = false,
  customFileExtensionList = [],
  maxFiles = 5,
  setUploading,

  isDisabled = false
}: AppFileSelectConfigType & {
  onChange: (...event: any[]) => void;
  value: any;

  form?: UseFormReturn<any>;
  fieldName?: string;

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
      maxFiles,
      canSelectVideo: false,
      canSelectAudio: false,
      canSelectCustomFileExtension: false
    },
    outLinkAuthData,
    appId,
    chatId,
    fileCtrl: fileCtrl as any
  });

  const fileType = useMemo(() => {
    return getUploadFileType({
      canSelectFile,
      canSelectImg,
      canSelectVideo,
      canSelectAudio,
      canSelectCustomFileExtension,
      customFileExtensionList
    });
  }, [
    canSelectAudio,
    canSelectCustomFileExtension,
    canSelectFile,
    canSelectImg,
    canSelectVideo,
    customFileExtensionList
  ]);

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
      <FileSelect
        fileType={fileType}
        selectFiles={fileList.map((file) => ({
          id: file.id,
          createStatus: 'finish' as const,
          sourceName: file.name,
          icon: file.icon,
          file: file.rawFile
        }))}
        onSelectFiles={(files) => {
          if (!files || files.length === 0) {
            return;
          }
          const fileObjects = files
            .map((file) => file.file)
            .filter((file): file is File => file !== undefined);
          onSelectFile({ files: fileObjects });
        }}
      />
      <File onSelect={(files) => onSelectFile({ files })} />
    </>
  );
};

export default FileSelector;
