import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, HStack, Input, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getUploadTempFilePresignedUrl } from '@/web/common/file/api';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import DatasetFileSelector, {
  type SelectFileItemType
} from '@/pageComponents/dataset/detail/Import/components/FileSelector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

// Debug 模式下只支持文档类型，不支持图片上传
const debugDocumentFileType = '.txt, .doc, .docx, .csv, .xlsx, .xls, .pdf, .md, .ppt, .pptx';

type DebugFileItemType = {
  id: string;
  name: string;
  icon: string;
  size: string;
  url?: string;
  isUploading: boolean;
  progress: number;
  errorMsg?: string;
};

type DebugLinkItemType = {
  id: string;
  url: string;
};

type Props = {
  label: string;
  required?: boolean;
  onChange: (urls: string[]) => void;
  setUploading: (uploading: boolean) => void;
  fileSelectConfig: AppFileSelectConfigType;
};

const DebugFileUrlInput = React.memo(function DebugFileUrlInput({
  label,
  required,
  onChange,
  setUploading,
  fileSelectConfig
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const [fileList, setFileList] = useState<DebugFileItemType[]>([]);
  const [linkList, setLinkList] = useState<DebugLinkItemType[]>([]);

  // Refs to avoid stale closures in useEffect without putting onChange/setUploading in deps
  const onChangeRef = useRef(onChange);
  const setUploadingRef = useRef(setUploading);
  onChangeRef.current = onChange;
  setUploadingRef.current = setUploading;

  // Current file count ref for upload capacity check (avoids recreating onSelectFiles on progress)
  const fileCountRef = useRef(0);
  fileCountRef.current = fileList.length;

  // Sync computed URLs + links to form whenever either state changes
  useEffect(() => {
    const fileUrls = fileList.filter((f) => f.url && !f.errorMsg).map((f) => f.url!);
    const validLinks = linkList.map((l) => l.url.trim()).filter(Boolean);
    onChangeRef.current([...fileUrls, ...validLinks]);
    setUploadingRef.current(fileList.some((f) => f.isUploading));
  }, [fileList, linkList]);

  // 最大文件数量优先取系统配置，兜底取 fileSelectConfig.maxFiles
  const maxFiles = feConfigs?.uploadFileMaxAmount ?? fileSelectConfig.maxFiles;

  // ─── File upload handlers ────────────────────────────────────────────────
  const onSelectFiles = useCallback(
    async (selectedFiles: SelectFileItemType[]) => {
      const remaining = maxFiles - fileCountRef.current;
      if (remaining <= 0) {
        toast({
          status: 'warning',
          title: t('file:support_max_count', { maxCount: maxFiles })
        });
        return;
      }

      const filesToUpload = selectedFiles.slice(0, remaining);
      const newItems: DebugFileItemType[] = filesToUpload.map(({ fileId, file }) => ({
        id: fileId,
        name: file.name,
        icon: getFileIcon(file.name),
        size: formatFileSize(file.size),
        isUploading: true,
        progress: 0
      }));

      setFileList((prev) => [...prev, ...newItems]);

      await Promise.all(
        filesToUpload.map(async ({ fileId, file }) => {
          try {
            const { url, key, headers, maxSize } = await getUploadTempFilePresignedUrl({
              filename: file.name
            });

            await putFileToS3({
              url,
              file,
              headers,
              maxSize,
              t,
              onUploadProgress: (e) => {
                if (!e.total) return;
                const percent = Math.round((e.loaded / e.total) * 100);
                setFileList((prev) =>
                  prev.map((item) =>
                    item.id === fileId ? { ...item, progress: Math.min(percent, 99) } : item
                  )
                );
              },
              onSuccess: async () => {
                setFileList((prev) =>
                  prev.map((item) =>
                    item.id === fileId
                      ? { ...item, url: key, isUploading: false, progress: 100 }
                      : item
                  )
                );
              }
            });
          } catch (error) {
            setFileList((prev) =>
              prev.map((item) =>
                item.id === fileId
                  ? { ...item, isUploading: false, errorMsg: getErrText(error as Error) }
                  : item
              )
            );
            toast({ status: 'warning', title: getErrText(error as Error) });
          }
        })
      );
    },
    [maxFiles, t, toast]
  );

  const removeFile = useCallback((id: string) => {
    setFileList((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ─── Link handlers ───────────────────────────────────────────────────────
  const addLink = useCallback(() => {
    setLinkList((prev) => [...prev, { id: getNanoid(), url: '' }]);
  }, []);

  const updateLink = useCallback((id: string, url: string) => {
    setLinkList((prev) => prev.map((l) => (l.id === id ? { ...l, url } : l)));
  }, []);

  const removeLink = useCallback((id: string) => {
    setLinkList((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <Box _notLast={{ mb: 4 }}>
      <Flex alignItems={'center'} mb={2}>
        <FormLabel required={required}>{t(label as any)}</FormLabel>
      </Flex>

      <Flex direction="column" gap={2}>
        {/* 上传区（debug 模式只支持文档，不支持图片） */}
        <DatasetFileSelector
          fileType={debugDocumentFileType}
          selectFiles={Array(fileList.length) as any}
          onSelectFiles={onSelectFiles}
        />

        {/* 已上传文件列表 */}
        {fileList.length > 0 && (
          <VStack gap={1} alignItems="stretch">
            {fileList.map((file) => (
              <HStack key={file.id} spacing={2} justifyContent="space-between">
                <HStack spacing={2} flex={1} overflow="hidden">
                  <MyIcon name={file.icon as any} w="1rem" flexShrink={0} />
                  <Box
                    fontSize="sm"
                    flex={1}
                    overflow="hidden"
                    textOverflow="ellipsis"
                    whiteSpace="nowrap"
                  >
                    {file.name}
                  </Box>
                  <Box fontSize="xs" color="myGray.500" flexShrink={0}>
                    {file.size}
                  </Box>
                  {file.errorMsg ? (
                    <Box fontSize="xs" color="red.500" flexShrink={0}>
                      {file.errorMsg}
                    </Box>
                  ) : file.isUploading ? (
                    <Box fontSize="xs" color="myGray.500" flexShrink={0}>
                      {file.progress}%
                    </Box>
                  ) : null}
                </HStack>
                {!file.isUploading && (
                  <MyIconButton
                    icon="delete"
                    hoverColor="red.500"
                    hoverBg="red.50"
                    onClick={() => removeFile(file.id)}
                  />
                )}
              </HStack>
            ))}
          </VStack>
        )}

        {/* 文档链接列表 */}
        {linkList.length > 0 && (
          <VStack gap={1} alignItems="stretch">
            {linkList.map((link) => (
              <HStack key={link.id} spacing={2}>
                <Input
                  size="sm"
                  placeholder={t('workflow:debug_file_url_input.doc_link_placeholder')}
                  value={link.url}
                  onChange={(e) => updateLink(link.id, e.target.value)}
                  bg="myGray.50"
                  rounded="md"
                />
                <MyIconButton
                  icon="delete"
                  hoverColor="red.500"
                  hoverBg="red.50"
                  onClick={() => removeLink(link.id)}
                />
              </HStack>
            ))}
          </VStack>
        )}

        <Button
          variant="ghost"
          size="sm"
          leftIcon={<MyIcon name="common/addLight" w="1rem" />}
          color="primary.600"
          alignSelf="flex-start"
          px={1}
          onClick={addLink}
        >
          {t('workflow:debug_file_url_input.add_doc_link')}
        </Button>
      </Flex>
    </Box>
  );
});

export default DebugFileUrlInput;
