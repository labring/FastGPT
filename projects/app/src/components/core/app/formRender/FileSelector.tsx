import type { DragEvent } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserInputFileItemType } from '../../chat/ChatContainer/ChatBox/type';
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
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getUploadFileType } from '@fastgpt/global/core/app/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { z } from 'zod';
import { clone } from 'lodash';
import { getPresignedChatFileGetUrl, getUploadChatFilePresignedUrl } from '@/web/common/file/api';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../../chat/ChatContainer/ChatBox/Provider';
import { POST } from '@/web/common/api/request';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { formatFileSize, parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { PluginRunContext } from '../../chat/ChatContainer/PluginRunBox/context';

const FileSelector = ({
  fileUrls,
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
  isDisabled = false
}: AppFileSelectConfigType & {
  fileUrls: string[] | any[]; // Can be string[] or file object[]
  onChange: (e: any[]) => void;
  canLocalUpload?: boolean;
  canUrlUpload?: boolean;
  isDisabled?: boolean;
}) => {
  const { feConfigs } = useSystemStore();
  const { toast } = useToast();
  const { t } = useTranslation();

  const chatBoxOutLinkAuthData = useContextSelector(ChatBoxContext, (v) => v?.outLinkAuthData);
  const chatBoxAppId = useContextSelector(ChatBoxContext, (v) => v?.appId);
  const chatBoxChatId = useContextSelector(ChatBoxContext, (v) => v?.chatId);

  const pluginOutLinkAuthData = useContextSelector(PluginRunContext, (v) => v?.outLinkAuthData);
  const pluginAppId = useContextSelector(PluginRunContext, (v) => v?.appId);
  const pluginChatId = useContextSelector(PluginRunContext, (v) => v?.chatId);

  const chatItemAppId = useContextSelector(ChatItemContext, (v) => v?.chatBoxData?.appId);
  const chatItemChatId = useContextSelector(ChatItemContext, (v) => v?.chatBoxData?.chatId);

  const outLinkAuthData = useMemo(
    () => ({
      ...(chatBoxOutLinkAuthData || {}),
      ...(pluginOutLinkAuthData || {})
    }),
    [chatBoxOutLinkAuthData, pluginOutLinkAuthData]
  );
  const appId = useMemo(
    () => chatBoxAppId || pluginAppId || chatItemAppId || '',
    [chatBoxAppId, pluginAppId, chatItemAppId]
  );
  const chatId = useMemo(
    () => chatBoxChatId || pluginChatId || chatItemChatId || '',
    [chatBoxChatId, pluginChatId, chatItemChatId]
  );

  const [cloneFiles, setCloneFiles] = useState<UserInputFileItemType[]>(() => {
    return fileUrls
      .map((item) => {
        const url = typeof item === 'string' ? item : item?.url || item?.key;
        const key = typeof item === 'string' ? undefined : item?.key;
        const name = typeof item === 'string' ? undefined : item?.name;
        const type = typeof item === 'string' ? undefined : item?.type;

        if (!url) return null as unknown as UserInputFileItemType;

        const fileType = parseUrlToFileType(url);
        if (!fileType && !type) return null as unknown as UserInputFileItemType;

        return {
          id: getNanoid(6),
          name: name || fileType?.name || url,
          type: type || fileType?.type || ChatFileTypeEnum.file,
          icon: getFileIcon(name || fileType?.name || url),
          url: typeof item === 'string' ? fileType?.url : item?.url,
          status: 1,
          key: key || (typeof item === 'string' && url.startsWith('chat/') ? url : undefined)
        };
      })
      .filter(Boolean) as UserInputFileItemType[];
  });

  useEffect(() => {
    const fileObjects = cloneFiles
      .filter((file) => file.url || file.key)
      .map((file) => {
        const fileObj = {
          type: file.type,
          name: file.name,
          key: file.key,
          url: file.url || file.key || ''
        };
        return fileObj;
      });
    onChange(fileObjects as any);
  }, [cloneFiles, onChange]);

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
  const maxSelectFiles = maxFiles ?? 10;
  const maxSize = (feConfigs?.uploadFileMaxSize || 1024) * 1024 * 1024; // nkb
  const canSelectFileAmount = maxSelectFiles - cloneFiles.length;
  const isMaxSelected = canSelectFileAmount <= 0;

  // Selector props
  const [isDragging, setIsDragging] = useState(false);
  const onSelectFile = useCallback(
    async (files: File[]) => {
      if (files.length > maxSelectFiles) {
        files = files.slice(0, maxSelectFiles);
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
            new Promise<UserInputFileItemType>((resolve, reject) => {
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item: UserInputFileItemType = {
                    id: getNanoid(6),
                    rawFile: file,
                    type: ChatFileTypeEnum.image,
                    name: file.name,
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
                  name: file.name,
                  icon: getFileIcon(file.name),
                  status: 0
                });
              }
            })
        )
      );
      setCloneFiles((state) => [...loadFiles, ...state]);
    },
    [maxSelectFiles, maxSize, t, toast]
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

    const firstEntry = items[0].webkitGetAsEntry();

    if (firstEntry?.isDirectory && items.length === 1) {
      {
        const readFile = (entry: any) => {
          return new Promise((resolve) => {
            entry.file((file: File) => {
              if (filterTypeReg.test(file.name)) {
                onSelectFile([file]);
              }
              resolve(file);
            });
          });
        };
        const traverseFileTree = (dirReader: any) => {
          return new Promise((resolve) => {
            let fileNum = 0;
            dirReader.readEntries(async (entries: any[]) => {
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
              resolve('');
            });
          });
        };

        for await (const item of items) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isFile) {
              await readFile(entry);
            } else if (entry.isDirectory) {
              //@ts-ignore
              await traverseFileTree(entry.createReader());
            }
          }
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
  const uploadFiles = useCallback(async () => {
    const filterFiles = cloneFiles.filter((item) => item.status === 0);
    if (filterFiles.length === 0) return;

    setCloneFiles((state) => state.map((item) => ({ ...item, status: 1 })));

    await Promise.allSettled(
      filterFiles.map(async (file) => {
        const copyFile = clone(file);
        if (!copyFile.rawFile) return;
        copyFile.status = 1;

        try {
          // Get Upload Post Presigned URL
          const { url, fields } = await getUploadChatFilePresignedUrl({
            filename: copyFile.rawFile.name,
            appId,
            chatId,
            outLinkAuthData
          });

          // Upload File to S3
          const formData = new FormData();
          Object.entries(fields).forEach(([k, v]) => formData.set(k, v));
          formData.set('file', copyFile.rawFile);
          await POST(url, formData, {
            headers: {
              'Content-Type': 'multipart/form-data; charset=utf-8'
            },
            onUploadProgress: (e) => {
              if (!e.total) return;
              const percent = Math.round((e.loaded / e.total) * 100);
              copyFile.process = percent;
              setCloneFiles((state) =>
                state.map((item) => (item.id === file.id ? { ...item, process: percent } : item))
              );
            }
          });
          const previewUrl = await getPresignedChatFileGetUrl({
            key: fields.key,
            appId,
            outLinkAuthData
          });

          // Update file url and key
          copyFile.url = previewUrl;
          copyFile.key = fields.key;
          console.log(previewUrl, 232);
          setCloneFiles((state) =>
            state.map((item) =>
              item.id === file.id ? { ...item, url: previewUrl, key: fields.key } : item
            )
          );
        } catch (error) {
          setCloneFiles((state) =>
            state.map((item) =>
              item.id === file.id ? { ...item, error: getErrText(error) } : item
            )
          );
        }
      })
    );
  }, [appId, chatId, cloneFiles, outLinkAuthData]);
  // Watch newfiles,and upload
  useRequest2(uploadFiles, {
    refreshDeps: [cloneFiles],
    manual: false
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
        setCloneFiles((state) => [
          ...state,
          {
            id: getNanoid(6),
            status: 1,
            type: 'file',
            url: trimmedUrl,
            name: trimmedUrl,
            icon: 'common/link'
          }
        ]);
      }

      setUrlInput('');
    },
    [t, toast]
  );

  const handleDeleteFile = useCallback((id: string) => {
    setCloneFiles((state) => state.filter((file) => file.id !== id));
  }, []);

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
            borderColor={'myGray.250'}
            borderRadius={'md'}
            userSelect={'none'}
            {...(isMaxSelected || isDisabled
              ? {
                  cursor: 'not-allowed',
                  opacity: isDisabled ? 0.6 : 1
                }
              : {
                  cursor: 'pointer',
                  _hover: {
                    bg: 'primary.50',
                    borderColor: 'primary.600'
                  },
                  borderColor: isDragging ? 'primary.600' : 'borderColor.high',
                  onDragEnter: handleDragEnter,
                  onDragOver: (e) => e.preventDefault(),
                  onDragLeave: handleDragLeave,
                  onDrop: handleDrop,
                  onClick: onOpen
                })}
          >
            <MyIcon name={'common/uploadFileFill'} w={'32px'} />
            {isMaxSelected || isDisabled ? (
              <>
                <Box fontWeight={'500'} fontSize={'sm'}>
                  {isDisabled ? t('common:Running') : t('file:reached_max_file_count')}
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
                isDisabled={isMaxSelected || isDisabled}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={(e) => handleAddUrl(e.target.value)}
                border={'1.5px dashed'}
                borderColor={'myGray.250'}
                borderRadius={'md'}
                pl={8}
                py={1.5}
                placeholder={
                  isDisabled
                    ? t('common:Running')
                    : isMaxSelected
                      ? t('file:reached_max_file_count')
                      : t('chat:click_to_add_url')
                }
              />
            </InputGroup>
          </Box>
        )}
      </VStack>

      {/* Preview */}
      {cloneFiles.length > 0 && (
        <>
          <MyDivider />
          <VStack>
            {cloneFiles.map((file) => {
              return (
                <Box key={file.id} w={'full'}>
                  <HStack py={1} px={3} bg={'white'} borderRadius={'md'} border={'sm'}>
                    <MyAvatar src={file.icon} w={'1.2rem'} />
                    <Box
                      fontSize={'sm'}
                      flex={'1 0 0'}
                      className="textEllipsis"
                      title={file.name}
                      {...(file.error && {
                        color: 'red.600'
                      })}
                    >
                      {file.name}
                    </Box>

                    {/* Status icon */}
                    {!!file.url || !!file.error ? (
                      <IconButton
                        size={'xsSquare'}
                        borderRadius={'xs'}
                        variant={'transparentDanger'}
                        aria-label={'Delete file'}
                        icon={<MyIcon name={'close'} w={'1rem'} />}
                        onClick={() => handleDeleteFile(file.id)}
                        isDisabled={isDisabled}
                      />
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
                  {file.error && (
                    <Box mt={1} fontSize={'xs'} color={'red.600'}>
                      {file.error}
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
