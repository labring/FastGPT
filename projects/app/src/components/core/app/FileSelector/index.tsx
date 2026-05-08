import type { DragEvent } from 'react';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type {
  FileSelectorInputObjectItemType,
  FileSelectorInputValueType,
  FileSelectorRenderItemType,
  FileSelectorValueItemType
} from './type';
import {
  Box,
  CircularProgress,
  HStack,
  IconButton,
  Input,
  InputGroup,
  VStack
} from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import z from 'zod';
import { getPresignedChatFileGetUrl, getUploadChatFilePresignedUrl } from '@/web/common/file/api';
import { useContextSelector } from 'use-context-selector';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import {
  getFileSelectorDisplayIcon,
  inferFileSelectorType,
  isFileSelectorCleanValueEcho,
  isFileSelectorPreviewUrlMissing,
  isFileSelectorUploading,
  markFileSelectorUploadError,
  markFileSelectorUploading,
  markFileSelectorUploadSuccess,
  sanitizeFileSelectValue
} from './utils';
import { isEqual } from 'lodash';

type WebkitFileSystemFileEntry = {
  isFile: true;
  isDirectory: false;
  file: (successCallback: (file: File) => void) => void;
};

type WebkitFileSystemDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  createReader: () => WebkitFileSystemDirectoryReader;
};

type WebkitFileSystemEntry = WebkitFileSystemFileEntry | WebkitFileSystemDirectoryEntry;

type WebkitFileSystemDirectoryReader = {
  readEntries: (successCallback: (entries: WebkitFileSystemEntry[]) => void) => void;
};

type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};

const getFileSystemEntry = (item?: DataTransferItem): WebkitFileSystemEntry | null =>
  ((item as WebkitDataTransferItem | undefined)?.webkitGetAsEntry?.() as
    | WebkitFileSystemEntry
    | null
    | undefined) ?? null;

const isFileSelectorInputObject = (
  file: FileSelectorInputValueType[number]
): file is FileSelectorInputObjectItemType => !!file && typeof file === 'object';

const findExistingRenderFile = (
  file: FileSelectorValueItemType | undefined,
  existingFiles: FileSelectorRenderItemType[]
) => {
  if (!file) return;

  if (file.key) {
    return existingFiles.find((item) => item.key === file.key);
  }

  return existingFiles.find((item) => item.url === file.url);
};

/**
 * 将外部 value 转成组件内部渲染态。
 *
 * FileSelector 对外只暴露可存储值（key/url + name/type），但渲染还需要 id、
 * 上传进度、错误、临时预览 URL 等字段。外部重新传入 key-only 存储值时，
 * 这里会复用已有的 url/icon/id，避免图片预览在父组件回写时反复闪烁。
 */
const formatFileSelectorInternalValue = (
  files: FileSelectorInputValueType,
  existingFiles: FileSelectorRenderItemType[] = []
): FileSelectorRenderItemType[] => {
  if (!Array.isArray(files)) return [];

  return files
    .map((file): FileSelectorRenderItemType | undefined => {
      const valueFile = sanitizeFileSelectValue([file])[0];
      const inputFile = isFileSelectorInputObject(file) ? file : undefined;
      const rawFile = inputFile?.rawFile;
      if (!valueFile && !rawFile) return;

      const existingFile = findExistingRenderFile(valueFile, existingFiles);
      const inputUrl = inputFile?.url;
      const previewUrl =
        (inputUrl && !inputUrl.startsWith('data:') ? inputUrl : valueFile?.url) ||
        existingFile?.url;
      const renderType = valueFile?.type || inputFile?.type || ChatFileTypeEnum.file;
      const fileName =
        valueFile?.name ||
        inputFile?.name ||
        valueFile?.url ||
        valueFile?.key ||
        rawFile?.name ||
        previewUrl ||
        '';
      const fileIcon = inputFile?.icon || existingFile?.icon;

      return {
        ...valueFile,
        ...(previewUrl ? { url: previewUrl } : {}),
        id: inputFile?.id || existingFile?.id || getNanoid(6),
        rawFile,
        type: renderType,
        name: fileName,
        icon: getFileSelectorDisplayIcon({
          type: renderType,
          url: previewUrl,
          icon: fileIcon,
          name: fileName,
          key: valueFile?.key
        }),
        status: inputFile?.status ?? 1,
        process: inputFile?.process,
        error: inputFile?.error
      };
    })
    .filter((file): file is FileSelectorRenderItemType => Boolean(file));
};

const FileSelector = ({
  value,
  onChange,
  maxFiles,
  canSelectFile,
  canSelectImg,
  canSelectVideo,
  canSelectAudio,
  canSelectCustomFileExtension,
  customFileExtensionList,
  canLocalUpload,
  canUrlUpload,
  isDisabled = false,
  isInvalid = false
}: AppFileSelectConfigType & {
  value: FileSelectorInputValueType;
  onChange: (e: FileSelectorValueItemType[]) => void;
  canLocalUpload?: boolean;
  canUrlUpload?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
}) => {
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const { toast } = useToast();
  const { t } = useSafeTranslation();

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const setFileUploadingCount = useContextSelector(
    WorkflowRuntimeContext,
    (v) => v.setFileUploadingCount
  );

  const lastEmittedValue = useRef<FileSelectorValueItemType[]>();
  const skipNextCleanEcho = useRef(false);
  const fetchingPreviewUrlKeys = useRef(new Set<string>());
  const [fileList, setFileList] = useState<FileSelectorRenderItemType[]>(() =>
    formatFileSelectorInternalValue(value)
  );

  useEffect(() => {
    const cleanedValue = sanitizeFileSelectValue(value);
    if (
      skipNextCleanEcho.current &&
      isFileSelectorCleanValueEcho({
        value,
        cleanedValue,
        lastEmittedValue: lastEmittedValue.current
      })
    ) {
      skipNextCleanEcho.current = false;
      return;
    }

    skipNextCleanEcho.current = false;
    setFileList((currentFiles) => {
      const nextFiles = formatFileSelectorInternalValue(value, currentFiles);
      return isEqual(nextFiles, currentFiles) ? currentFiles : nextFiles;
    });
    lastEmittedValue.current = cleanedValue;
    if (!isEqual(cleanedValue, value)) {
      onChange(cleanedValue);
    }
  }, [onChange, value]);

  const handleChangeFiles = useCallback(
    (files: FileSelectorRenderItemType[], emitChange = true) => {
      setFileList([...files]);

      if (emitChange) {
        const cleanedFiles = sanitizeFileSelectValue(files);
        lastEmittedValue.current = cleanedFiles;
        skipNextCleanEcho.current = true;
        onChange(cleanedFiles);
      }
    },
    [onChange]
  );

  // 后端存储值只保留 key；组件渲染时再为 key-only 文件补临时预览 URL。
  // 这里不会触发 onChange，避免把预览 URL 写回全局变量或表单存储值。
  useEffect(() => {
    if (!appId) return;

    const filesNeedPreviewUrl = fileList.filter(
      (file): file is FileSelectorRenderItemType & { key: string; url?: undefined } =>
        isFileSelectorPreviewUrlMissing(file) && !fetchingPreviewUrlKeys.current.has(file.key)
    );
    if (filesNeedPreviewUrl.length === 0) return;

    let isUnmounted = false;

    filesNeedPreviewUrl.forEach((file) => {
      fetchingPreviewUrlKeys.current.add(file.key);
    });

    void Promise.allSettled(
      filesNeedPreviewUrl.map(async (file) => {
        const key = file.key;
        const url = await getPresignedChatFileGetUrl({
          key,
          appId,
          outLinkAuthData
        });

        return {
          key,
          url
        };
      })
    )
      .then((results) => {
        if (isUnmounted) return;

        const previewUrlMap = new Map<string, string>();
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            previewUrlMap.set(result.value.key, result.value.url);
          }
        });
        if (previewUrlMap.size === 0) return;

        setFileList((currentFiles) =>
          currentFiles.map((file) => {
            if (!file.key || file.url) return file;

            const previewUrl = previewUrlMap.get(file.key);
            if (!previewUrl) return file;

            return {
              ...file,
              url: previewUrl,
              icon: getFileSelectorDisplayIcon({
                ...file,
                url: previewUrl
              })
            };
          })
        );
      })
      .finally(() => {
        filesNeedPreviewUrl.forEach((file) => {
          fetchingPreviewUrlKeys.current.delete(file.key);
        });
      });

    return () => {
      isUnmounted = true;
    };
  }, [appId, fileList, outLinkAuthData]);

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
    canSelectFile,
    canSelectImg,
    canSelectVideo,
    canSelectAudio,
    canSelectCustomFileExtension,
    customFileExtensionList
  ]);
  const fileSelectConfig = useMemo<AppFileSelectConfigType>(
    () => ({
      maxFiles,
      canSelectFile,
      canSelectImg,
      canSelectVideo,
      canSelectAudio,
      canSelectCustomFileExtension,
      customFileExtensionList
    }),
    [
      maxFiles,
      canSelectFile,
      canSelectImg,
      canSelectVideo,
      canSelectAudio,
      canSelectCustomFileExtension,
      customFileExtensionList
    ]
  );
  // 文件数量限制：组件参数 || 团队套餐 || 系统配置 || 默认值
  const maxSelectFiles =
    maxFiles ||
    teamPlanStatus?.standard?.maxUploadFileCount ||
    feConfigs?.uploadFileMaxAmount ||
    10;
  // 文件大小限制（MB）：团队套餐 || 系统配置 || 默认值
  const maxSize =
    (teamPlanStatus?.standard?.maxUploadFileSize || feConfigs?.uploadFileMaxSize || 500) *
    1024 *
    1024;
  const canSelectFileAmount = Math.max(maxSelectFiles - fileList.length, 0);
  const isMaxSelected = canSelectFileAmount <= 0;

  const uploadFiles = useCallback(
    async (files: FileSelectorRenderItemType[]) => {
      const filterFiles = markFileSelectorUploading(files);
      if (filterFiles.length === 0) return;

      handleChangeFiles(files);

      await Promise.allSettled(
        filterFiles.map(async (file) => {
          if (!file.rawFile) return;
          setFileUploadingCount((state) => state + 1);

          try {
            // Get Upload Post Presigned URL
            const { url, key, headers, previewUrl } = await getUploadChatFilePresignedUrl({
              filename: file.rawFile.name,
              appId,
              chatId,
              fileSelectConfig,
              outLinkAuthData
            });

            await putFileToS3({
              url,
              file: file.rawFile,
              headers,
              onUploadProgress: (e) => {
                if (!e.total) return;
                const percent = Math.round((e.loaded / e.total) * 100);
                files.forEach((item) => {
                  if (item.id === file.id) {
                    item.process = percent;
                  }
                });
                handleChangeFiles(files, false);
              },
              t,
              maxSize
            });

            // Update file url and key
            markFileSelectorUploadSuccess({
              files,
              id: file.id,
              key,
              url: previewUrl
            });
            handleChangeFiles(files);
          } catch (error) {
            markFileSelectorUploadError({
              files,
              id: file.id,
              error: getErrText(error)
            });
            handleChangeFiles(files);
          } finally {
            setFileUploadingCount((state) => Math.max(0, state - 1));
          }
        })
      );
    },
    [
      handleChangeFiles,
      setFileUploadingCount,
      appId,
      chatId,
      fileSelectConfig,
      outLinkAuthData,
      t,
      maxSize
    ]
  );

  // Selector props
  const [isDragging, setIsDragging] = useState(false);
  const onSelectFile = useCallback(
    async (files: File[]) => {
      const remainingFileAmount = Math.max(maxSelectFiles - fileList.length, 0);
      if (remainingFileAmount === 0) {
        toast({
          status: 'warning',
          title: t('chat:file_amount_over', { max: maxSelectFiles })
        });
        return;
      }
      if (files.length > remainingFileAmount) {
        files = files.slice(0, remainingFileAmount);
        toast({
          status: 'warning',
          title: t('chat:file_amount_over', { max: maxSelectFiles })
        });
      }
      const filterFilesByMaxSize = files.filter((file) => file.size <= maxSize);
      if (filterFilesByMaxSize.length < files.length) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      const loadFiles = await Promise.all(
        filterFilesByMaxSize.map(
          (file) =>
            new Promise<FileSelectorRenderItemType>((resolve, reject) => {
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item: FileSelectorRenderItemType = {
                    id: getNanoid(6),
                    rawFile: file,
                    type: ChatFileTypeEnum.image,
                    name: file?.name,
                    icon: reader.result as string,
                    status: 0
                  };
                  resolve(item);
                };
                reader.onerror = () => {
                  reject(reader.error);
                };
              } else {
                resolve({
                  id: getNanoid(6),
                  rawFile: file,
                  type: ChatFileTypeEnum.file,
                  name: file?.name,
                  icon: getFileIcon(file?.name),
                  status: 0
                });
              }
            })
        )
      );
      const newFiles = [...loadFiles, ...fileList];
      handleChangeFiles(newFiles);
      uploadFiles(newFiles);
    },
    [maxSelectFiles, fileList, handleChangeFiles, uploadFiles, toast, t, maxSize]
  );
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const filterTypeReg = new RegExp(
      `(${fileType
        .split(',')
        .map((item) => item.trim())
        .join('|')})$`,
      'i'
    );
    const items = e.dataTransfer.items;

    const firstEntry = getFileSystemEntry(items[0]);

    if (firstEntry?.isDirectory && items.length === 1) {
      {
        const selectedFiles: File[] = [];
        const readFile = (entry: WebkitFileSystemFileEntry) => {
          return new Promise<void>((resolve) => {
            entry.file((file: File) => {
              if (filterTypeReg.test(file?.name)) {
                selectedFiles.push(file);
              }
              resolve();
            });
          });
        };
        const traverseFileTree = (dirReader: WebkitFileSystemDirectoryReader) => {
          return new Promise<void>((resolve) => {
            let fileNum = 0;
            dirReader.readEntries((entries) => {
              void (async () => {
                for await (const entry of entries) {
                  if (entry.isFile) {
                    await readFile(entry);
                    fileNum++;
                  } else if (entry.isDirectory) {
                    await traverseFileTree(entry.createReader());
                  }
                }

                // chrome: readEntries will return 100 entries at most
                if (fileNum === 100) {
                  await traverseFileTree(dirReader);
                }
                resolve();
              })();
            });
          });
        };

        for await (const item of Array.from(items)) {
          const entry = getFileSystemEntry(item);
          if (entry) {
            if (entry.isFile) {
              await readFile(entry);
            } else if (entry.isDirectory) {
              await traverseFileTree(entry.createReader());
            }
          }
        }
        if (selectedFiles.length > 0) {
          await onSelectFile(selectedFiles);
        }
      }
    } else if (firstEntry?.isFile) {
      const files = Array.from(e.dataTransfer.files);

      onSelectFile(files.filter((item) => filterTypeReg.test(item.name)));
    } else {
      return toast({
        title: t('file:upload_error_description'),
        status: 'error'
      });
    }
  };

  const { File, onOpen } = useSelectFile({
    fileType,
    multiple: canSelectFileAmount > 1,
    maxCount: canSelectFileAmount
  });

  // Url upload props
  const [urlInput, setUrlInput] = useState('');
  const handleAddUrl = useCallback(
    (url: string) => {
      if (!url) return;

      const urlSchema = z.string().url();
      const result = urlSchema.safeParse(url);
      if (!result.success) {
        return toast({
          title: t('common:invalid_url'),
          status: 'error'
        });
      }

      const trimmedUrl = url.trim();
      if (trimmedUrl) {
        const type = inferFileSelectorType(trimmedUrl);
        handleChangeFiles([
          ...fileList,
          {
            id: getNanoid(6),
            status: 1,
            type,
            url: trimmedUrl,
            name: trimmedUrl,
            icon:
              type === ChatFileTypeEnum.image
                ? trimmedUrl
                : getFileSelectorDisplayIcon({
                    type,
                    url: trimmedUrl,
                    name: trimmedUrl
                  })
          }
        ]);
      }

      setUrlInput('');
    },
    [t, toast, handleChangeFiles, fileList]
  );

  const handleDeleteFile = useCallback(
    (id: string) => {
      handleChangeFiles(fileList.filter((file) => file.id !== id));
    },
    [handleChangeFiles, fileList]
  );

  const isUploading = fileList.some(isFileSelectorUploading);
  const disabled = isDisabled || isUploading;

  return (
    <>
      {/* Selector */}
      <VStack>
        {canLocalUpload && (
          <MyBox
            w={'100%'}
            display={'flex'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
            px={3}
            py={[4, 7]}
            border={'1.5px dashed'}
            borderColor={isInvalid ? 'red.500' : 'myGray.250'}
            borderRadius={'md'}
            userSelect={'none'}
            {...(isMaxSelected || disabled
              ? {
                  cursor: 'not-allowed',
                  opacity: disabled ? 0.6 : 1
                }
              : {
                  cursor: 'pointer',
                  _hover: {
                    bg: 'primary.50',
                    borderColor: isInvalid ? 'red.500' : 'primary.600'
                  },
                  borderColor: isInvalid
                    ? 'red.500'
                    : isDragging
                      ? 'primary.600'
                      : 'borderColor.high',
                  onDragEnter: handleDragEnter,
                  onDragOver: (e) => e.preventDefault(),
                  onDragLeave: handleDragLeave,
                  onDrop: handleDrop,
                  onClick: onOpen
                })}
          >
            <MyIcon name={'common/uploadFileFill'} w={'32px'} />
            {isMaxSelected ? (
              <>
                <Box fontWeight={'500'} fontSize={'sm'}>
                  {t('file:reached_max_file_count')}
                </Box>
              </>
            ) : (
              <>
                <Box fontWeight={'500'} fontSize={'sm'}>
                  {isDragging
                    ? t('file:release_the_mouse_to_upload_the_file')
                    : t('file:select_and_drag_file_tip')}
                </Box>
                <File onSelect={(files) => onSelectFile(files)} />
              </>
            )}
          </MyBox>
        )}
        {canUrlUpload && (
          <Box w={'100%'}>
            <InputGroup display={'flex'} alignItems={'center'}>
              <MyIcon
                position={'absolute'}
                left={2.5}
                name="common/addLight"
                w={'1.2rem'}
                color={'primary.600'}
                zIndex={10}
              />
              <Input
                isDisabled={isMaxSelected || disabled}
                isInvalid={isInvalid}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={(e) => handleAddUrl(e.target.value)}
                border={'1.5px dashed'}
                borderColor={isInvalid ? 'red.500' : 'myGray.250'}
                borderRadius={'md'}
                pl={8}
                py={1.5}
                placeholder={
                  isMaxSelected ? t('file:reached_max_file_count') : t('chat:click_to_add_url')
                }
                _hover={{
                  borderColor: isInvalid ? 'red.500' : 'myGray.300'
                }}
                _focus={{
                  borderColor: isInvalid ? 'red.500' : 'primary.600',
                  boxShadow: isInvalid ? '0 0 0 1px var(--chakra-colors-red-500)' : undefined
                }}
              />
            </InputGroup>
          </Box>
        )}
      </VStack>

      {/* Preview */}
      {fileList.length > 0 && (
        <>
          <MyDivider />
          <VStack>
            {fileList.map((file) => {
              const fileIcon = getFileSelectorDisplayIcon(file);
              const isUploadingFile = isFileSelectorUploading(file);
              return (
                <Box key={file?.id} w={'full'}>
                  <HStack py={1} px={3} bg={'white'} borderRadius={'md'} border={'sm'}>
                    <MyAvatar src={fileIcon} w={'1.2rem'} />
                    <Box
                      fontSize={'sm'}
                      flex={'1 0 0'}
                      className="textEllipsis"
                      title={file?.name}
                      {...(file?.error && {
                        color: 'red.600'
                      })}
                    >
                      {file?.name}
                    </Box>

                    {/* Status icon */}
                    {!isUploadingFile ? (
                      <HStack spacing={1}>
                        {/* View button - 查看文件 */}
                        {file?.url && (
                          <IconButton
                            size={'xsSquare'}
                            variant={'grayGhost'}
                            aria-label={'View file'}
                            icon={<MyIcon name={'common/viewLight'} w={'1rem'} />}
                            onClick={() => window.open(file.url, '_blank')}
                          />
                        )}
                        {/* Delete button - 只在未禁用时显示 */}
                        {!disabled && (
                          <IconButton
                            size={'xsSquare'}
                            borderRadius={'xs'}
                            variant={'transparentDanger'}
                            aria-label={'Delete file'}
                            icon={<MyIcon name={'close'} w={'1rem'} />}
                            onClick={() => handleDeleteFile(file?.id)}
                          />
                        )}
                      </HStack>
                    ) : (
                      <HStack w={'24px'} h={'24px'} justifyContent={'center'}>
                        <CircularProgress
                          value={file.process}
                          color="primary.600"
                          bg={'white'}
                          size={'1.2rem'}
                        />
                      </HStack>
                    )}
                  </HStack>
                  {file?.error && (
                    <Box mt={1} fontSize={'xs'} color={'red.600'}>
                      {t(file.error)}
                    </Box>
                  )}
                </Box>
              );
            })}
          </VStack>
        </>
      )}
    </>
  );
};

export default React.memo(FileSelector);
