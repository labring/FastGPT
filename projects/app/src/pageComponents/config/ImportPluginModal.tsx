import React, { useState, useCallback } from 'react';
import { Box, Button, Flex, VStack } from '@chakra-ui/react';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FileSelectorBox, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import { confirmPkgPluginUpload, uploadPkgPlugin } from '@/web/core/plugin/admin/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { getDocPath } from '@/web/common/system/doc';
import { getMarketPlaceToolTags } from '@/web/core/plugin/marketplace/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { GetAdminSystemToolsResponseType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { UploadPkgPluginResponseType } from '@fastgpt/global/openapi/core/plugin/admin/api';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  getUploadedPluginSourceName as getSourceName,
  removeUploadedPluginFileByRow
} from './ImportPluginModal.utils';

type UploadPkgPluginItemType = UploadPkgPluginResponseType['plugins'][number];
type UploadPkgPluginFailureType = NonNullable<UploadPkgPluginResponseType['failed']>[number];

type UploadedPluginFile = SelectFileItemType & {
  rowId: string;
  status: 'uploading' | 'parsing' | 'success' | 'error' | 'duplicate';
  sourceName?: string;
  errorMsg?: string;
  canRetry?: boolean;
  toolId?: string;
  version?: string;
  etag?: string;
  toolName?: string;
  toolIntro?: string;
  toolTags?: string[];
};

const isPluginDuplicated = (tools: GetAdminSystemToolsResponseType, pluginId: string) =>
  tools.some((tool) => tool.id === `${AppToolSourceEnum.systemTool}-${pluginId}`);

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isZipFileName = (name: string) => name.toLowerCase().endsWith('.zip');

const buildUploadRowId = (prefix: string) => `${prefix}-${getNanoid(8)}`;

const resolveSuccessSourceFiles = ({
  files,
  failedSourceNameSet,
  successCount
}: {
  files: UploadedPluginFile[];
  failedSourceNameSet: Set<string>;
  successCount: number;
}) => {
  const sourceFiles = files.filter((file) => !failedSourceNameSet.has(getSourceName(file)));
  if (sourceFiles.length === 0) return [];
  if (sourceFiles.length === 1) {
    return Array.from({ length: successCount }, () => sourceFiles[0]);
  }

  const result: UploadedPluginFile[] = [];
  sourceFiles.forEach((file, index) => {
    if (result.length >= successCount) return;

    const remainingResults = successCount - result.length;
    const remainingSources = sourceFiles.length - index - 1;
    const currentCount = isZipFileName(getSourceName(file))
      ? Math.max(1, remainingResults - remainingSources)
      : 1;

    for (let i = 0; i < Math.min(currentCount, remainingResults); i++) {
      result.push(file);
    }
  });

  const fallbackFile = sourceFiles[sourceFiles.length - 1] || files[0];
  while (result.length < successCount) {
    result.push(fallbackFile);
  }

  return result;
};

const ImportPluginModal = ({
  onClose,
  onSuccess,
  tools
}: {
  onClose: () => void;
  onSuccess?: () => void;
  tools: GetAdminSystemToolsResponseType;
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedPluginFile[]>([]);

  const { data: allTags = [] } = useRequest(getMarketPlaceToolTags, {
    manual: false
  });

  const buildUploadedPluginFile = useCallback(
    (
      file: UploadedPluginFile,
      parseResult: UploadPkgPluginItemType,
      nameSuffix?: string
    ): UploadedPluginFile => {
      const isDuplicated = isPluginDuplicated(tools, parseResult.pluginId);
      const toolId = `${AppToolSourceEnum.systemTool}-${parseResult.pluginId}`;
      const sourceName = getSourceName(file);

      return {
        ...file,
        rowId: buildUploadRowId(file.rowId),
        sourceName,
        status: isDuplicated ? 'duplicate' : 'success',
        toolId,
        name: nameSuffix ? `${sourceName} / ${nameSuffix}` : file.name,
        toolName: parseI18nString(parseResult.name || '', i18n.language),
        icon: parseResult.icon || '',
        toolIntro: parseI18nString(parseResult.description || '', i18n.language) || '',
        toolTags:
          parseResult.tags?.map((tag) => {
            const currentTag = allTags.find((item) => item.tagId === tag);
            return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
          }) || [],
        version: parseResult.version || '',
        etag: parseResult.etag || ''
      };
    },
    [allTags, i18n.language, tools]
  );

  const parseUploadFailureMessage = useCallback(
    (failure: UploadPkgPluginFailureType) => {
      return parseI18nString(failure.reason, i18n.language) || t('app:custom_plugin_upload_failed');
    },
    [i18n.language, t]
  );

  const parseUploadErrorMessage = useCallback(
    (error: any) => {
      if (error?.message?.reason) {
        return parseI18nString(error.message.reason, i18n.language);
      }
      if (typeof error?.message === 'string') {
        return error.message;
      }
      if (typeof error === 'string') {
        return error;
      }
      return t('app:custom_plugin_upload_failed');
    },
    [i18n.language, t]
  );

  const buildUploadFailureFile = useCallback(
    (
      failure: UploadPkgPluginFailureType,
      files: UploadedPluginFile[],
      index: number
    ): UploadedPluginFile => {
      const failedFileName = failure.fileName ? safeDecodeURIComponent(failure.fileName) : '';
      const zipFiles = files.filter((file) => isZipFileName(getSourceName(file)));
      const sourceFile =
        files.find((file) => getSourceName(file) === failedFileName) ||
        (files.length === 1 ? files[0] : undefined) ||
        (zipFiles.length === 1 ? zipFiles[0] : undefined);
      const baseFile = sourceFile || files[index] || files[0];
      const sourceName = sourceFile ? getSourceName(sourceFile) : undefined;
      const displayName =
        sourceName && failedFileName && sourceName !== failedFileName
          ? `${sourceName} / ${failedFileName}`
          : failedFileName || sourceName || baseFile.name;

      return {
        ...baseFile,
        rowId: buildUploadRowId(baseFile.rowId),
        name: displayName,
        sourceName,
        status: 'error',
        errorMsg: parseUploadFailureMessage(failure),
        canRetry: !!sourceFile
      };
    },
    [parseUploadFailureMessage]
  );

  const uploadAndParseFiles = useCallback(
    async (files: UploadedPluginFile[]) => {
      if (files.length === 0) return;

      const sourceNameSet = new Set(files.map(getSourceName));

      try {
        setUploadedFiles((prev) =>
          prev.map((file) =>
            sourceNameSet.has(getSourceName(file))
              ? { ...file, status: 'uploading', errorMsg: undefined }
              : file
          )
        );

        const formData = new FormData();
        files.forEach((file) => {
          formData.append('file', file.file, encodeURIComponent(getSourceName(file)));
        });

        const uploadResult = await uploadPkgPlugin(formData);
        const parseResults = uploadResult?.plugins || [];
        const failedResults = uploadResult?.failed || [];
        if (parseResults.length === 0 && failedResults.length === 0) {
          throw new Error(t('app:custom_plugin_upload_failed'));
        }

        const failedSourceNameSet = new Set(
          failedResults
            .map((failure) =>
              failure.fileName ? safeDecodeURIComponent(failure.fileName) : undefined
            )
            .filter((fileName): fileName is string => !!fileName && sourceNameSet.has(fileName))
        );
        const successSourceFiles = resolveSuccessSourceFiles({
          files,
          failedSourceNameSet,
          successCount: parseResults.length
        });

        const parsedFiles = parseResults.map((parseResult, index) => {
          const sourceFile = successSourceFiles[index] || files[index];
          const sourceName = sourceFile ? getSourceName(sourceFile) : '';
          const sourceSuccessCount = successSourceFiles.filter(
            (file) => file === sourceFile
          ).length;
          const shouldAppendNameSuffix =
            sourceFile &&
            (sourceSuccessCount > 1 || isZipFileName(sourceName)) &&
            !!parseResult.name;
          const nameSuffix =
            shouldAppendNameSuffix && parseResult.name
              ? parseI18nString(parseResult.name, i18n.language) || parseResult.pluginId
              : undefined;

          return sourceFile
            ? buildUploadedPluginFile(sourceFile, parseResult, nameSuffix)
            : ({
                file: files[0].file,
                rowId: buildUploadRowId(files[0].rowId),
                icon: parseResult.icon || files[0].icon,
                name:
                  parseI18nString(parseResult.name || '', i18n.language) || parseResult.pluginId,
                size: files[0].size,
                status: isPluginDuplicated(tools, parseResult.pluginId) ? 'duplicate' : 'success',
                toolId: `${AppToolSourceEnum.systemTool}-${parseResult.pluginId}`,
                toolName: parseI18nString(parseResult.name || '', i18n.language),
                toolIntro: parseI18nString(parseResult.description || '', i18n.language) || '',
                toolTags:
                  parseResult.tags?.map((tag) => {
                    const currentTag = allTags.find((item) => item.tagId === tag);
                    return parseI18nString(currentTag?.tagName || '', i18n.language) || '';
                  }) || [],
                version: parseResult.version || '',
                etag: parseResult.etag || ''
              } satisfies UploadedPluginFile);
        });
        const failedFiles = failedResults.map((failure, index) =>
          buildUploadFailureFile(failure, files, index)
        );

        setUploadedFiles((prev) => [
          ...prev.filter((file) => !sourceNameSet.has(getSourceName(file))),
          ...parsedFiles,
          ...failedFiles
        ]);
      } catch (error: any) {
        const errorMsg = parseUploadErrorMessage(error);
        setUploadedFiles((prev) =>
          prev.map((prevFile) =>
            sourceNameSet.has(getSourceName(prevFile))
              ? {
                  ...prevFile,
                  status: 'error',
                  errorMsg
                }
              : prevFile
          )
        );
      }
    },
    [
      allTags,
      buildUploadFailureFile,
      buildUploadedPluginFile,
      i18n.language,
      parseUploadErrorMessage,
      t,
      tools
    ]
  );

  const uploadAndParseFile = useCallback(
    async (file: UploadedPluginFile) => {
      await uploadAndParseFiles([file]);
    },
    [uploadAndParseFiles]
  );

  const { runAsync: handleBatchUpload, loading: uploadLoading } = useRequest(
    async (files: SelectFileItemType[]) => {
      const newUploadedFiles: UploadedPluginFile[] = files.map((f) => ({
        ...f,
        rowId: buildUploadRowId('upload'),
        status: 'uploading' as const
      }));
      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

      await uploadAndParseFiles(newUploadedFiles);
    },
    {
      manual: true
    }
  );

  const onSelectFiles = useCallback(
    (files: SelectFileItemType[]) => {
      const currentUploadFiles = files.filter(
        (file) => !selectFiles.some((f) => f.name === file.name)
      );
      const filteredFiles = currentUploadFiles.filter(
        (file) => !uploadedFiles.some((f) => f.name === file.name || f.sourceName === file.name)
      );

      if (filteredFiles.length !== currentUploadFiles.length) {
        toast({
          title: t('app:upload_file_exists_filtered'),
          status: 'info'
        });
      }
      setSelectFiles(filteredFiles);

      if (filteredFiles.length > 0) {
        handleBatchUpload(filteredFiles);
      }
    },
    [handleBatchUpload, selectFiles, t, toast, uploadedFiles]
  );

  const handleRetry = async (file: UploadedPluginFile) => {
    await uploadAndParseFile(file);
  };

  const handleDelete = (file: UploadedPluginFile) => {
    const { nextUploadedFiles, sourceNameToRemove } = removeUploadedPluginFileByRow(
      uploadedFiles,
      file
    );
    setUploadedFiles(nextUploadedFiles);

    if (sourceNameToRemove) {
      setSelectFiles((prev) => prev.filter((f) => f.name !== sourceNameToRemove));
    }
  };

  const { runAsync: handleConfirmImport, loading: confirmLoading } = useRequest(
    async () => {
      const successToolIds = uploadedFiles
        .filter((file) => (file.status === 'success' || file.status === 'duplicate') && file.toolId)
        .map((file) => ({
          pluginId: file.toolId!,
          version: file.version!,
          etag: file.etag!
        }));

      await confirmPkgPluginUpload({ toolIds: successToolIds });
    },
    {
      manual: true,
      onSuccess: () => {
        setUploadedFiles([]);
        onSuccess?.();
        onClose();
      }
    }
  );

  return (
    <MyRightDrawer
      onClose={onClose}
      title={t('app:toolkit_import_resource')}
      maxW={['90vw', '900px']}
      h={'98%'}
      mt={'0.5%'}
      px={0}
    >
      <Flex justify={'flex-end'} px={8} pt={4} pb={3}>
        <Button
          variant={'link'}
          size={'sm'}
          leftIcon={<MyIcon name={'book'} w={'14px'} />}
          color={'primary.600'}
          onClick={() => {
            window.open(
              getDocPath('/guide/build/tools/system-plugins/upload_system_tool'),
              '_blank'
            );
          }}
        >
          {t('common:Instructions')}
        </Button>
      </Flex>

      <Box flex={1} px={8} overflow={'auto'}>
        <FileSelectorBox
          fileType=".pkg,.zip"
          selectFiles={selectFiles}
          setSelectFiles={onSelectFiles}
          h={120}
        />

        <Flex
          w={'full'}
          fontSize={'12px'}
          fontWeight={'medium'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
          mt={4}
        >
          <Box w={'20%'} px={1} py={'15px'}>
            {t('common:name')}
          </Box>
          <Box w={'20%'} px={1} py={'15px'}>
            {t('app:toolkit_tags')}
          </Box>
          <Box w={'40%'} px={1} py={'15px'}>
            {t('common:Intro')}
          </Box>
          <Box w={'10%'} px={1} py={'15px'}>
            {t('common:Status')}
          </Box>
          <Box w={'10%'} px={1} py={'15px'}>
            {t('common:Action')}
          </Box>
        </Flex>

        {uploadedFiles.length > 0 && (
          <VStack mt={1} gap={1}>
            {uploadedFiles.map((item) => (
              <Flex key={item.rowId} w={'full'} fontSize={'12px'}>
                <Flex w={'20%'} px={1} py={'15px'} align={'center'} gap={2}>
                  <Avatar src={item.icon} borderRadius={'xs'} w={'20px'} />
                  <Box
                    color={'myGray.900'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                  >
                    {(item.status === 'success' || item.status === 'duplicate') && item.toolName
                      ? item.toolName
                      : item.name}
                  </Box>
                </Flex>
                <Flex w={'20%'} px={1} py={'15px'} align={'center'} gap={1} flexWrap={'wrap'}>
                  {(item.status === 'success' || item.status === 'duplicate') &&
                  item.toolTags &&
                  item.toolTags.length > 0 ? (
                    item.toolTags.map((tag, tagIndex) => (
                      <Box
                        key={tagIndex}
                        as={'span'}
                        bg={'myGray.100'}
                        px={2}
                        py={1}
                        color={'myGray.700'}
                        borderRadius={'8px'}
                        fontSize={'xs'}
                        flexShrink={0}
                        data-tag-item
                      >
                        {tag}
                      </Box>
                    ))
                  ) : (
                    <Box color={'myGray.400'}>-</Box>
                  )}
                </Flex>
                <Flex
                  w={'40%'}
                  px={1}
                  color={'myGray.600'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                  alignItems={'center'}
                >
                  {(item.status === 'success' || item.status === 'duplicate') && item.toolIntro
                    ? item.toolIntro
                    : '-'}
                </Flex>
                <Flex w={'10%'} px={1} py={'15px'}>
                  {(item.status === 'uploading' || item.status === 'parsing') && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'blue.500'}
                    >
                      {item.status === 'uploading'
                        ? t('app:custom_plugin_uploading')
                        : t('app:custom_plugin_parsing')}
                    </Flex>
                  )}
                  {item.status === 'duplicate' && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'yellow.500'}
                      gap={1}
                    >
                      {t('app:custom_plugin_update')}
                    </Flex>
                  )}
                  {item.status === 'success' && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'green.500'}
                    >
                      {t('app:custom_plugin_uploaded')}
                    </Flex>
                  )}
                  {item.status === 'error' && (
                    <Flex
                      alignItems={'center'}
                      fontSize={'xs'}
                      fontWeight={'medium'}
                      color={'red.500'}
                      gap={1}
                    >
                      {t('app:custom_plugin_upload_failed')}
                      <QuestionTip label={item.errorMsg} />
                    </Flex>
                  )}
                </Flex>
                <Flex w={'10%'} px={1} py={'15px'} align={'center'} gap={2}>
                  {item.status === 'error' && item.canRetry !== false && (
                    <Box
                      p={2}
                      onClick={() => handleRetry(item)}
                      cursor={'pointer'}
                      _hover={{
                        bg: 'myGray.100',
                        rounded: 'md',
                        color: 'primary.600'
                      }}
                    >
                      <MyIcon name={'common/confirm/restoreTip'} w={4} />
                    </Box>
                  )}
                  <Box
                    p={2}
                    onClick={() => handleDelete(item)}
                    cursor={'pointer'}
                    _hover={{
                      bg: 'myGray.100',
                      rounded: 'md',
                      color: 'red.600'
                    }}
                  >
                    <MyIcon name={'delete'} w={4} />
                  </Box>
                </Flex>
              </Flex>
            ))}
          </VStack>
        )}
      </Box>

      <Flex justify={'flex-end'} gap={2} p={4}>
        <Button variant="whiteBase" onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          onClick={handleConfirmImport}
          isDisabled={
            uploadedFiles.length === 0 ||
            uploadedFiles.every((f) => f.status !== 'success' && f.status !== 'duplicate')
          }
          isLoading={confirmLoading || uploadLoading}
        >
          {t('common:comfirm_import')}
        </Button>
      </Flex>
    </MyRightDrawer>
  );
};

export default ImportPluginModal;
