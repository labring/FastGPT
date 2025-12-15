/**
 * @file 知识库同义词管理页面
 * @description 用于管理知识库的同义词文件，支持上传、下载、删除同义词文件
 * 功能包括：
 * - 上传同义词文件（支持xlsx、xls、csv格式）
 * - 下载同义词模板文件
 * - 查看已上传的同义词文件信息
 * - 删除同义词文件
 * - 文件状态管理和错误处理
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Text,
  useTheme,
  HStack,
  Button,
  VStack,
  Spinner,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  Center
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  getSynonymFileList,
  postUploadSynonymFile,
  deleteSynonymFile
} from '@/web/core/dataset/api';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import { downloadFetch } from '@/web/common/system/utils';
import { fileDownload } from '@/web/common/file/utils';
import type { ListSynonymFilesResponse } from '@/pages/api/core/dataset/synonym/list';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Trans } from 'next-i18next';
import { formatFileSize } from '@fastgpt/global/common/file/tools';

type SynonymFile = NonNullable<ListSynonymFilesResponse['files']>[0];

// 常量定义
const ACCEPTED_FILE_TYPES = ['.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const POPOVER_WIDTH = '318px';
const UPLOAD_AREA_WIDTH = '660px';

interface UploadedFile {
  name: string;
  size: string;
  uploadTime: Date;
  status: 'success' | 'failed';
  file: File;
}

// 文件信息组件Props
interface FileInfoProps {
  name: string;
  size: string;
  uploadTime: Date;
  isUploadedFile?: boolean;
  uploaderName?: string;
  uploaderAvatar?: string;
  onDownload?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onClear?: () => void;
  isUploading?: boolean;
  isDeleting?: boolean;
  showDeleteConfirm?: boolean;
  onCancelDelete?: () => void;
  onConfirmDelete?: (e: React.MouseEvent) => Promise<void>;
  uploadStatus?: 'success' | 'failed';
}

// 文件信息组件
const FileInfo: React.FC<FileInfoProps> = ({
  name,
  size,
  uploadTime,
  isUploadedFile = false,
  uploaderName,
  uploaderAvatar,
  onDownload,
  onDelete,
  onClear,
  isUploading = false,
  isDeleting = false,
  showDeleteConfirm = false,
  onCancelDelete,
  onConfirmDelete,
  uploadStatus
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { userInfo } = useUserStore();
  const isFailedUpload = isUploadedFile && uploadStatus === 'failed';

  return (
    <VStack spacing={4} alignItems="stretch" w={'100%'}>
      <Box p={4} border={theme.borders.sm} borderRadius={'10px'} borderColor={theme.borders.base}>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <Flex alignItems={'center'} gap={3}>
            <MyIcon name={getFileIcon(name) as any} w={'32px'} h={'32px'} />
            <Box flex={1}>
              <Text fontSize={'16px'} fontWeight={500} color={'myGray.900'} noOfLines={1}>
                {name}
              </Text>
              <HStack gap={4} mt={1} fontSize={'sm'} color={'myGray.500'}>
                <Flex alignItems={'center'}>
                  <MyIcon name={'common/list'} w={'14px'} h={'14px'} mr={1} />
                  {size}
                </Flex>
                <Flex alignItems={'center'}>
                  <MyIcon name={'history'} w={'14px'} h={'14px'} mr={1} />
                  {uploadTime.toLocaleString()}
                </Flex>
                {isUploadedFile ? (
                  <Flex alignItems={'center'}>
                    <Avatar
                      src={userInfo?.avatar}
                      w={'14px'}
                      h={'14px'}
                      borderRadius="50%"
                      mr={1}
                    />
                    {userInfo?.team?.memberName || '-'}
                  </Flex>
                ) : (
                  <Flex alignItems={'center'}>
                    {uploaderAvatar && (
                      <Avatar
                        src={uploaderAvatar}
                        w={'14px'}
                        h={'14px'}
                        borderRadius="50%"
                        mr={1}
                      />
                    )}
                    {uploaderName || '-'}
                  </Flex>
                )}
              </HStack>
            </Box>
          </Flex>

          {/* 操作按钮 */}
          <HStack gap={2}>
            {isFailedUpload && (
              <Center w={6} h={6}>
                <MyIcon name={'common/warnTriangle'} w={'16px'} h={'16px'} />
              </Center>
            )}

            {/* 下载按钮 */}
            {!isUploadedFile && onDownload && (
              <Center
                w={6}
                h={6}
                cursor="pointer"
                onClick={onDownload}
                _hover={{
                  color: 'primary.500'
                }}
              >
                <MyIcon name={'common/download'} w={'16px'} h={'16px'} />
              </Center>
            )}

            {/* 删除按钮 */}
            {isUploadedFile ? (
              <Center
                w={6}
                h={6}
                cursor={isUploading ? 'not-allowed' : 'pointer'}
                onClick={isUploading ? undefined : onClear}
              >
                {isUploading ? (
                  <Spinner size="sm" emptyColor="gray.200" color="primary.500" />
                ) : (
                  <MyIcon name={'delete'} w={'16px'} h={'16px'} />
                )}
              </Center>
            ) : (
              <Popover
                isOpen={showDeleteConfirm}
                onClose={onCancelDelete}
                placement="left"
                closeOnBlur={true}
              >
                <PopoverTrigger>
                  <Center
                    w={6}
                    h={6}
                    cursor="pointer"
                    onClick={onDelete}
                    _hover={{
                      color: 'red.500'
                    }}
                  >
                    <MyIcon name={'delete'} w={'16px'} h={'16px'} />
                  </Center>
                </PopoverTrigger>
                <PopoverContent w={POPOVER_WIDTH}>
                  <PopoverArrow />
                  <PopoverBody p={3}>
                    <VStack spacing={3} align="stretch">
                      <HStack spacing={2}>
                        <MyIcon name="common/warn" w={'24px'} h={'24px'}></MyIcon>
                        <Text fontSize="14px" fontWeight="medium">
                          {t('dataset:synonym_confirm_delete')}
                        </Text>
                      </HStack>
                      <HStack spacing={2} justify="flex-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isDeleting}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelDelete?.();
                          }}
                        >
                          {t('common:Cancel')}
                        </Button>
                        <Button
                          size="sm"
                          colorScheme="red"
                          variant="solid"
                          onClick={onConfirmDelete}
                          isLoading={isDeleting}
                        >
                          {t('common:Delete')}
                        </Button>
                      </HStack>
                    </VStack>
                  </PopoverBody>
                </PopoverContent>
              </Popover>
            )}
          </HStack>
        </Flex>
      </Box>
    </VStack>
  );
};

const SynonymTab = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { datasetDetail } = useContextSelector(DatasetPageContext, (v) => v);

  const [synonymFile, setSynonymFile] = useState<SynonymFile | null>(null);
  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<boolean>(false);

  // 删除同义词文件的请求
  const { runAsync: onDeleteSynonymFile, loading: isDeleting } = useRequest2(deleteSynonymFile, {
    successToast: t('dataset:synonym_delete_success')
  });

  // 获取同义词文件列表
  const { runAsync: fetchSynonymFiles, loading: isLoading } = useRequest2(
    async () => {
      const response = datasetDetail._id && (await getSynonymFileList(datasetDetail._id));
      return response && response.files && response.files.length > 0 ? response.files[0] : null;
    },
    {
      onSuccess: (data) => {
        setSynonymFile(data);
      },
      onError: (error) => {
        toast({
          status: 'error',
          title: t('dataset:synonym_fetch_failed'),
          description: (error as Error).message
        });
      }
    }
  );

  // 处理文件选择和上传
  const handleFileSelectorChange = useCallback(
    async (files: SelectFileItemType[]) => {
      if (files.length === 0) return;

      const fileToUpload = files[0];
      setSelectFiles([fileToUpload]);
      setIsUploading(true);

      try {
        // 先设置上传中状态
        setUploadedFile({
          name: fileToUpload.name,
          size: fileToUpload.size,
          uploadTime: new Date(),
          status: 'success',
          file: fileToUpload.file
        });

        // 上传文件
        await postUploadSynonymFile({
          datasetId: datasetDetail._id,
          file: fileToUpload.file
        });

        // 刷新文件列表
        await fetchSynonymFiles();

        // 重置状态
        setSelectFiles([]);
        setUploadedFile(null);

        toast({
          status: 'success',
          title: t('dataset:synonym_upload_success')
        });
      } catch (error) {
        // 上传失败，更新状态
        setUploadedFile({
          name: fileToUpload.name,
          size: fileToUpload.size,
          uploadTime: new Date(),
          status: 'failed',
          file: fileToUpload.file
        });

        toast({
          status: 'error',
          title: t('dataset:synonym_upload_failed'),
          description: (error as Error).message
        });
      } finally {
        setIsUploading(false);
      }
    },
    [datasetDetail._id, fetchSynonymFiles, toast, t]
  );

  // 清除上传状态
  const handleClearUpload = useCallback(() => {
    setUploadedFile(null);
    setSelectFiles([]);
  }, []);

  // 文件下载处理
  const handleFileDownload = useCallback(async () => {
    if (!synonymFile) return;

    try {
      await downloadFetch({
        url: `/api/core/dataset/synonym/download?id=${synonymFile._id}`,
        filename: synonymFile.fileName
      });

      toast({
        status: 'success',
        title: `${synonymFile.fileName} ${t('dataset:synonym_download_started')}`
      });
    } catch (error) {
      toast({
        status: 'error',
        title: t('dataset:synonym_download_failed')
      });
    }
  }, [synonymFile, toast, t]);

  // 处理删除点击
  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmItem(true);
  }, []);

  // 处理删除确认
  const handleDeleteConfirmClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!synonymFile) return;
      await onDeleteSynonymFile(datasetDetail._id, synonymFile._id);
      setSynonymFile(null);
      setDeleteConfirmItem(false);
    },
    [synonymFile, datasetDetail._id, onDeleteSynonymFile]
  );

  // 下载模板文件
  const handleDownloadTemplate = useCallback(() => {
    const template = `standardizedTerm,synonymTerms,,,,
refund,return,chargeback,reimbursement,money back
order,purchase order,order number,transaction,invoice`;

    fileDownload({
      text: template,
      type: 'text/csv;charset=utf-8',
      filename: 'synonym_template.csv'
    });
  }, []);

  // 组件初始化时获取文件列表
  useEffect(() => {
    fetchSynonymFiles();
  }, [fetchSynonymFiles]);

  // 使用 useMemo 缓存主要渲染节点
  const renderNodes = useMemo(() => {
    // 已有文件显示区域
    const existingFileNode = (() => {
      if (uploadedFile) {
        return (
          <FileInfo
            name={uploadedFile.name}
            size={uploadedFile.size}
            uploadTime={uploadedFile.uploadTime}
            isUploadedFile={true}
            uploadStatus={uploadedFile.status}
            onClear={handleClearUpload}
            isUploading={isUploading}
          />
        );
      }
      if (synonymFile) {
        return (
          <FileInfo
            name={synonymFile.fileName}
            size={formatFileSize(synonymFile.size)}
            uploadTime={new Date(synonymFile.uploadTime)}
            isUploadedFile={false}
            uploaderName={synonymFile.uploaderName}
            uploaderAvatar={synonymFile.uploaderAvatar}
            onDownload={handleFileDownload}
            onDelete={handleDeleteClick}
            showDeleteConfirm={deleteConfirmItem}
            onCancelDelete={() => setDeleteConfirmItem(false)}
            onConfirmDelete={handleDeleteConfirmClick}
            isDeleting={isDeleting}
          />
        );
      }
      return null;
    })();

    // 文件上传区域
    const uploadAreaNode = (
      <Flex justifyContent={'center'}>
        <VStack spacing={4} alignItems="stretch" w={UPLOAD_AREA_WIDTH}>
          {/* 模板下载区域 */}
          <HStack>
            <VStack spacing={1} align="start" w={'100%'}>
              <Button
                variant={'whiteBase'}
                w={'100%'}
                leftIcon={<MyIcon name={'common/download'} w={4} />}
                onClick={handleDownloadTemplate}
              >
                {t('dataset:synonym_download_template')}
              </Button>
            </VStack>
          </HStack>

          {/* 文件选择区域 - 无文件且无上传状态时显示 */}
          {!uploadedFile && (
            <FileSelector
              fileType={ACCEPTED_FILE_TYPES.join(',')}
              selectFiles={selectFiles}
              setSelectFiles={handleFileSelectorChange}
              maxCount={1}
              maxSize={MAX_FILE_SIZE}
              FileTypeNode={
                <Box fontSize={'xs'}>
                  <Trans
                    i18nKey={'file:template_csv_file_select_tip'}
                    values={{
                      fileType: ACCEPTED_FILE_TYPES.join(t('common:comma_symbol'))
                    }}
                    components={{
                      highlight: <Box as="span" color="primary.600" fontWeight="medium" />
                    }}
                  />
                </Box>
              }
              fileTipNode={t('dataset:file_upload_tip', { maxCount: 1, maxSize: '50 MB' })}
              autoFilterOverSize={true}
            />
          )}
        </VStack>
      </Flex>
    );

    return {
      existingFileNode,
      uploadAreaNode
    };
  }, [
    synonymFile,
    handleDownloadTemplate,
    uploadedFile,
    selectFiles,
    handleFileSelectorChange,
    handleFileDownload,
    handleDeleteClick,
    handleDeleteConfirmClick,
    handleClearUpload,
    deleteConfirmItem,
    isDeleting,
    isUploading,
    t
  ]);

  return (
    <Flex flexDirection={'column'} h={'100%'} py={6} px={4}>
      {/* 顶部提示Banner */}
      <MyBox py={3} px={6} bg={'blue.50'} borderRadius={'md'} mb={4}>
        <Flex alignItems={'center'}>
          <MyIcon name={'infoRounded'} w={'16px'} h={'16px'} color={'primary.600'} mr={2} />
          <Text fontSize={'sm'} color={'myGray.600'} fontWeight={500}>
            {t('dataset:synonym_usage_tip')}
          </Text>
        </Flex>
      </MyBox>
      {/* 主要内容区域 */}
      <MyBox
        flex={1}
        isLoading={isLoading}
        bg={'white'}
        borderRadius={'md'}
        borderColor={theme.borders.base}
      >
        {renderNodes.existingFileNode || renderNodes.uploadAreaNode}
      </MyBox>
    </Flex>
  );
};

export default SynonymTab;
