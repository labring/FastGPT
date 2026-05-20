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
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  getSynonymFileList,
  postUploadSynonymFile,
  deleteSynonymFile
} from '@/web/core/dataset/api';
import FileSelector, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import { downloadFetch } from '@/web/common/system/utils';
import type { ListSynonymFilesResponse } from '@/pages/api/core/dataset/synonym/list';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Trans } from 'next-i18next';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import ExcelJS from 'exceljs';

type SynonymFile = NonNullable<ListSynonymFilesResponse['files']>[0];

// 常量定义
const ACCEPTED_FILE_TYPES = ['.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const POPOVER_WIDTH = '318px';

interface UploadedFile {
  name: string;
  size: string;
  uploadTime: Date;
  status: 'success' | 'failed';
  file: File;
  errorMessage?: string;
}

// 文件信息组件Props
interface FileInfoProps {
  name: string;
  size: string;
  uploadTime: Date;
  isUploadedFile?: boolean;
  uploaderName?: string;
  onDownload?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onClear?: () => void;
  isUploading?: boolean;
  isDeleting?: boolean;
  showDeleteConfirm?: boolean;
  onCancelDelete?: () => void;
  onConfirmDelete?: (e: React.MouseEvent) => Promise<void>;
  uploadStatus?: 'success' | 'failed';
  errorMessage?: string;
}

// 文件信息组件
const FileInfo: React.FC<FileInfoProps> = ({
  name,
  size,
  uploadTime,
  isUploadedFile = false,
  uploaderName,
  onDownload,
  onDelete,
  onClear,
  isUploading = false,
  isDeleting = false,
  showDeleteConfirm = false,
  onCancelDelete,
  onConfirmDelete,
  uploadStatus,
  errorMessage
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const isFailedUpload = isUploadedFile && uploadStatus === 'failed';

  const uploaderLabel = isUploadedFile ? userInfo?.team?.memberName || '-' : uploaderName || '-';

  return (
    <VStack spacing={2} alignItems="stretch" w={'100%'}>
      <Box p={4} borderRadius="10px" bg="#FCFCFD" border="1px solid #E8EBF0">
        <Flex alignItems="stretch" justifyContent="space-between">
          <Flex alignItems="stretch" gap={3}>
            {/* 图标容器 */}
            <Flex
              flexShrink={0}
              alignItems="center"
              justifyContent="center"
              p="10px"
              borderRadius="6px"
              bg="white"
              border="1px solid #DCE0E6"
              sx={{ boxShadow: '0px 1px 4px 0px rgba(0, 0, 0, 0.08)' }}
            >
              <MyIcon name={getFileIcon(name) as any} w="32px" h="32px" />
            </Flex>

            {/* 文件信息 */}
            <Flex flex={1} direction="column" justifyContent="center">
              <Text
                h="24px"
                fontSize="16px"
                fontWeight={600}
                lineHeight="24px"
                color="#111824"
                noOfLines={1}
              >
                {name}
              </Text>
              <HStack gap="40px" mt={2} alignItems="center">
                <Flex alignItems="center" gap={1}>
                  <MyIcon name="common/list" color="#9CA0A6" w="16px" h="16px" />
                  <Text fontSize="12px" color="#666666">
                    {size}
                  </Text>
                </Flex>
                <Flex alignItems="center" gap={1}>
                  <MyIcon name="common/user" color="#9CA0A6" w="16px" h="16px" />
                  <Text fontSize="12px" color="#666666">
                    {uploaderLabel}
                  </Text>
                </Flex>
                <Flex alignItems="center" gap={1}>
                  <MyIcon name="history" color="#9CA0A6" w="16px" h="16px" />
                  <Text fontSize="12px" color="#666666">
                    {uploadTime.toLocaleString()}
                  </Text>
                </Flex>
              </HStack>
            </Flex>
          </Flex>

          {/* 操作按钮 */}
          <HStack gap={2} alignSelf="center">
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
                _hover={{ color: 'primary.500' }}
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
                    _hover={{ color: 'red.500' }}
                  >
                    <MyIcon name={'delete'} w={'16px'} h={'16px'} />
                  </Center>
                </PopoverTrigger>
                <PopoverContent w={POPOVER_WIDTH}>
                  <PopoverArrow />
                  <PopoverBody p={3}>
                    <VStack spacing={3} align="stretch">
                      <HStack spacing={2}>
                        <MyIcon name="common/warn" w={'24px'} h={'24px'} />
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

      {/* 错误信息显示 */}
      {isFailedUpload && errorMessage && (
        <Box py={'4px'} px={'8px'}>
          <Text fontSize={'12px'} color={'red.600'}>
            {errorMessage}
          </Text>
        </Box>
      )}
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
  const { runAsync: onDeleteSynonymFile, loading: isDeleting } = useRequest(deleteSynonymFile, {
    successToast: t('dataset:synonym_delete_success')
  });

  // 获取同义词文件列表
  const { runAsync: fetchSynonymFiles, loading: isLoading } = useRequest(
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
          file: fileToUpload.file,
          errorMessage: t((error as Error).message)
        });

        toast({
          status: 'error',
          title: t('dataset:synonym_upload_failed')
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
        title: t('dataset:synonym_download_started', { fileName: synonymFile.fileName })
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

  // 下载模板文件 (XLSX格式，UTF-8编码) - 前端生成
  const handleDownloadTemplate = useCallback(async () => {
    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Synonyms');

      // 设置列宽
      worksheet.columns = [
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
        { width: 20 }
      ];

      // 添加表头（第一行）
      const headerRow = worksheet.addRow([
        t('dataset:synonym_template_col_standard'),
        t('dataset:synonym_template_col_synonyms'),
        '',
        '',
        '',
        ''
      ]);

      // 设置表头样式
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // 添加示例数据
      worksheet.addRow([
        t('dataset:synonym_example_standard1'),
        ...t('dataset:synonym_example_synonyms1').split(','),
        ''
      ]);
      worksheet.addRow([
        t('dataset:synonym_example_standard2'),
        ...t('dataset:synonym_example_synonyms2').split(','),
        ''
      ]);

      // 生成 Buffer（UTF-8编码）
      const buffer = await workbook.xlsx.writeBuffer();

      // 创建 Blob 并下载
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${t('dataset:synonym_template_filename')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
    }
  }, [t]);

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
          <Box py="40px" px="32px">
            <FileInfo
              name={uploadedFile.name}
              size={uploadedFile.size}
              uploadTime={uploadedFile.uploadTime}
              isUploadedFile={true}
              uploadStatus={uploadedFile.status}
              errorMessage={uploadedFile.errorMessage}
              onClear={handleClearUpload}
              isUploading={isUploading}
            />
          </Box>
        );
      }
      if (synonymFile) {
        return (
          <Box py="40px" px="32px">
            <FileInfo
              name={synonymFile.fileName}
              size={formatFileSize(synonymFile.size)}
              uploadTime={new Date(synonymFile.uploadTime)}
              isUploadedFile={false}
              uploaderName={synonymFile.uploaderName}
              onDownload={handleFileDownload}
              onDelete={handleDeleteClick}
              showDeleteConfirm={deleteConfirmItem}
              onCancelDelete={() => setDeleteConfirmItem(false)}
              onConfirmDelete={handleDeleteConfirmClick}
              isDeleting={isDeleting}
            />
            {/* 卡片下方说明文字 */}
            <Box mt="16px" ml="4px">
              {[t('dataset:synonym_file_tip1'), t('dataset:synonym_file_tip2')].map((tip) => (
                <Flex key={tip} alignItems="center" gap={2} lineHeight="24px">
                  <Box flexShrink={0} w="4px" h="4px" borderRadius="full" bg="#666666" />
                  <Text fontSize="14px" lineHeight="24px" color="#666666">
                    {tip}
                  </Text>
                </Flex>
              ))}
            </Box>
          </Box>
        );
      }
      return null;
    })();

    // 空状态：左右布局
    const emptyStateNode = (
      <Flex justifyContent="center" alignItems="center" h="100%">
        <Flex gap="80px" alignItems="flex-start">
          {/* 左侧说明区域 */}
          <Box w="380px">
            <Text h="22px" fontSize="16px" fontWeight={600} color="#333333" lineHeight="22px">
              {t('dataset:synonym_empty_title')}
            </Text>

            <Text mt="14px" fontSize="14px" lineHeight="20px" color="#333333">
              {t('dataset:synonym_empty_description')}
            </Text>

            {/* 示例表格（渐变边框） */}
            <Box
              mt="14px"
              position="relative"
              borderRadius="8px"
              p="1px"
              sx={{
                background:
                  'conic-gradient(from 180deg at 50% 50%, rgba(50, 170, 255, 0.6) -42deg, rgba(119, 226, 57, 0.6) 19deg, rgba(38, 219, 131, 0.6) 50deg, rgba(81, 155, 252, 0.6) 133deg, rgba(36, 131, 255, 0.6) 151deg, rgba(118, 105, 253, 0.6) 225deg, rgba(237, 125, 214, 0.6) 244deg, rgba(50, 170, 255, 0.6) 318deg, rgba(119, 226, 57, 0.6) 379deg)',
                boxShadow: '0px 2px 6px 0px rgba(0, 78, 212, 0.06)'
              }}
            >
              <Box
                display="grid"
                gridTemplateColumns="repeat(4, minmax(min-content, 1fr))"
                borderRadius="8px"
                overflow="hidden"
                bg="white"
              >
                {/* 表头 */}
                <Box bg="#E6F1FF" h="40px" display="flex" alignItems="center" px={3}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_template_col_standard')}
                  </Text>
                </Box>
                <Box
                  bg="#E6F1FF"
                  h="40px"
                  display="flex"
                  alignItems="center"
                  px={3}
                  sx={{ gridColumn: 'span 3' }}
                >
                  <Text fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_template_col_synonyms')}
                  </Text>
                </Box>

                {/* 第一行：库存单位 */}
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term1')}
                  </Text>
                </Box>
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term1_syn1')}
                  </Text>
                </Box>
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term1_syn2')}
                  </Text>
                </Box>
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term1_syn3')}
                  </Text>
                </Box>

                {/* 第二行：应收账款 */}
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term2')}
                  </Text>
                </Box>
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term2_syn1')}
                  </Text>
                </Box>
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term2_syn2')}
                  </Text>
                </Box>
                <Box px={3} py={2}>
                  <Text whiteSpace="nowrap" fontSize="12px" lineHeight="20px" color="#475466">
                    {t('dataset:synonym_display_term2_syn3')}
                  </Text>
                </Box>
              </Box>
            </Box>

            {/* 下载模板按钮 */}
            <Box mt="8px">
              <Button
                variant="link"
                fontSize="12px"
                color="#156AD9"
                onClick={handleDownloadTemplate}
              >
                {t('dataset:synonym_download_template')}
              </Button>
            </Box>
          </Box>

          {/* 右侧上传区域 */}
          <FileSelector
            fileType={ACCEPTED_FILE_TYPES.join(',')}
            selectFiles={selectFiles}
            setSelectFiles={handleFileSelectorChange}
            maxCount={1}
            maxSize={MAX_FILE_SIZE}
            w="480px"
            h="280px"
            FileTypeNode={
              <Box fontSize={'xs'}>
                <Trans
                  i18nKey={'file:template_csv_file_select_tip'}
                  values={{
                    fileType: ACCEPTED_FILE_TYPES.join(t('common:comma_symbol'))
                  }}
                  components={{
                    highlight: <Box as="span" color="myGray.900" fontWeight="bold" />
                  }}
                />
              </Box>
            }
            fileTipNode={t('dataset:file_upload_tip', { maxCount: 1, maxSize: '50 MB' })}
            autoFilterOverSize={true}
          />
        </Flex>
      </Flex>
    );

    return {
      existingFileNode,
      emptyStateNode
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
      {/* 主要内容区域 */}
      <MyBox
        flex={1}
        isLoading={isLoading}
        bg={'white'}
        borderRadius={'md'}
        borderColor={theme.borders.base}
      >
        {renderNodes.existingFileNode || renderNodes.emptyStateNode}
      </MyBox>
    </Flex>
  );
};

export default SynonymTab;
