import React, { useState, useRef } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  HStack,
  ModalBody,
  ModalFooter,
  VStack,
  Text,
  Switch
} from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '@/components/Select/FileSelectorBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  postImportFaqByTemplate,
  postCheckDuplicateCollection,
  postCheckMd5Duplicate
} from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { Trans } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DuplicateConfirmModal from './DuplicateConfirmModal';
import Md5DuplicateModal, { type Md5DuplicateItem } from './Md5DuplicateModal';
import ExcelJS from 'exceljs';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import SparkMD5 from 'spark-md5';

const FaqImportModal = ({
  onFinish,
  onClose,
  parentId
}: {
  onFinish: () => void;
  onClose: () => void;
  parentId?: string;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  const maxCount =
    feConfigs?.uploadFileMaxAmount || teamPlanStatus?.standard?.maxUploadFileCount || 1000;
  const maxSize =
    (feConfigs?.uploadFileMaxSize ?? teamPlanStatus?.standard?.maxUploadFileSize ?? 500) *
    1024 *
    1024;

  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    totalPercent: number;
    currentFileIndex: number;
    currentFilePercent: number;
  }>({
    totalPercent: 0,
    currentFileIndex: 0,
    currentFilePercent: 0
  });
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [md5DuplicateFiles, setMd5DuplicateFiles] = useState<Md5DuplicateItem[]>([]);
  const [showMd5DuplicateModal, setShowMd5DuplicateModal] = useState(false);
  const [enableEnhance, setEnableEnhance] = useState(true);
  const fileMd5MapRef = useRef<Map<string, string>>(new Map());
  const dedupedFilesRef = useRef<SelectFileItemType[]>([]);

  /** 流式计算单个文件的 MD5，避免全量加载到内存 */
  const computeFileMd5 = async (file: File): Promise<string> => {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk
    const spark = new SparkMD5.ArrayBuffer();
    const stream = file.stream();
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      spark.append(value.buffer as ArrayBuffer);
    }

    return spark.end();
  };

  /** 批量计算文件 MD5 */
  const computeFilesMd5 = async (files: SelectFileItemType[]): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    for (const f of files) {
      const md5 = await computeFileMd5(f.file);
      map.set(f.name, md5);
    }
    return map;
  };

  const { runAsync: uploadFiles, loading: isImporting } = useRequest(
    async (filesToUpload: SelectFileItemType[], replaceFiles: string[] = []) => {
      const totalFiles = filesToUpload.length;

      // 遍历所有选中的文件并依次上传
      for (let i = 0; i < totalFiles; i++) {
        setUploadProgress({
          totalPercent: Math.floor((i / totalFiles) * 100),
          currentFileIndex: i,
          currentFilePercent: 0
        });

        const overwriteDuplicate = replaceFiles.includes(filesToUpload[i].file.name);
        const md5Val = fileMd5MapRef.current.get(filesToUpload[i].name);

        await postImportFaqByTemplate({
          datasetId,
          parentId,
          file: filesToUpload[i].file,
          overwriteDuplicate,
          enableEnhance,
          fileMd5: md5Val,
          percentListen: (filePercent) => {
            // 计算总体进度：已完成文件的比例 + 当前文件的上传进度
            const totalPercent = Math.floor((i / totalFiles) * 100 + filePercent / totalFiles);
            setUploadProgress({
              totalPercent,
              currentFileIndex: i,
              currentFilePercent: filePercent
            });
          }
        });
      }

      // 所有文件上传完成
      setUploadProgress({
        totalPercent: 100,
        currentFileIndex: totalFiles - 1,
        currentFilePercent: 100
      });
    },
    {
      onSuccess() {
        onFinish();
        onClose();
      },
      successToast: t('common:import_success')
    }
  );

  const handleCheckAndImport = async () => {
    if (selectFiles.length === 0) return;

    // 1. 计算所有文件的 MD5
    const md5Map = await computeFilesMd5(selectFiles);
    fileMd5MapRef.current = md5Map;

    // 2. 统一调用 md5Duplicate API 检测同批次内重复 + 与知识库已有文件重复
    const md5Record: Record<string, string> = {};
    for (const f of selectFiles) {
      const md5 = md5Map.get(f.name);
      if (md5) md5Record[f.name] = md5;
    }
    if (Object.keys(md5Record).length > 0) {
      const md5CheckResult = await postCheckMd5Duplicate({ datasetId, md5Map: md5Record });
      if (md5CheckResult.duplicates?.length > 0) {
        // 弹出 MD5 重复确认弹窗
        setMd5DuplicateFiles(md5CheckResult.duplicates);
        setShowMd5DuplicateModal(true);
        return;
      }
    }

    // 3. 文件名重复检查
    const fileNames = selectFiles.map((f) => f.file.name);
    const checkResult = await postCheckDuplicateCollection({
      datasetId,
      parentId: parentId || undefined,
      fileNames
    });

    if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
      setDuplicateFiles(checkResult.duplicateFileNames);
      setShowDuplicateModal(true);
    } else {
      await uploadFiles(selectFiles);
    }
  };

  const handleMd5Confirm = async () => {
    const md5DupNewNames = new Set(md5DuplicateFiles.map((d) => d.newFileName));

    // 过滤掉 MD5 重复的文件
    const remainingFiles = selectFiles.filter((f) => !md5DupNewNames.has(f.name));
    setSelectFiles(remainingFiles);
    dedupedFilesRef.current = remainingFiles;
    setShowMd5DuplicateModal(false);

    if (remainingFiles.length === 0) {
      toast({ title: t('dataset:upload_other_files'), status: 'warning' });
      return;
    }

    // 继续文件名重复检查
    const fileNames = remainingFiles.map((f) => f.file.name);
    const checkResult = await postCheckDuplicateCollection({
      datasetId,
      parentId: parentId || undefined,
      fileNames
    });

    if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
      setDuplicateFiles(checkResult.duplicateFileNames);
      setShowDuplicateModal(true);
    } else {
      await uploadFiles(remainingFiles);
    }
  };

  const handleSkipDuplicates = async () => {
    const filesToUpload = dedupedFilesRef.current.filter(
      (file) => !duplicateFiles.includes(file.file.name)
    );

    if (filesToUpload.length === 0) {
      toast({ title: t('dataset:upload_other_files'), status: 'warning' });
      setShowDuplicateModal(false);
      return;
    }
    setShowDuplicateModal(false);
    await uploadFiles(filesToUpload);
  };

  const handleContinueUpload = async () => {
    setShowDuplicateModal(false);
    await uploadFiles(dedupedFilesRef.current);
  };

  const handleReplaceFiles = async () => {
    setShowDuplicateModal(false);
    await uploadFiles(dedupedFilesRef.current, duplicateFiles);
  };

  const handleDownloadTemplate = async () => {
    try {
      // 创建工作簿和工作表
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Template');

      // 设置列宽
      worksheet.columns = [
        { width: 30 }, // q
        { width: 60 }, // a
        { width: 60 } // indexes
      ];

      // 添加表头（第一行）
      const headerRow = worksheet.addRow([
        t('dataset:faq_template_col_question'),
        t('dataset:faq_template_col_answer'),
        t('dataset:faq_template_col_indexes')
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
        t('dataset:faq_example_q1'),
        t('dataset:faq_example_a1'),
        t('dataset:faq_example_i1')
      ]);

      worksheet.addRow([
        t('dataset:faq_example_q2'),
        t('dataset:faq_example_a2'),
        t('dataset:faq_example_i2')
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
      link.download = `${t('dataset:faq_template_filename')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download template:', error);
    }
  };

  return (
    <>
      <MyModal
        iconSrc="core/dataset/tableCollection"
        iconColor={'primary.600'}
        title={t('dataset:faq_import_title')}
        isOpen
        onClose={onClose}
        closeOnOverlayClick={false}
        w={'500px'}
        h={'auto'}
      >
        <ModalBody>
          <VStack spacing={3} alignItems="stretch">
            <HStack w={'100%'} spacing={2}>
              <Button
                variant="whiteBase"
                flex={1}
                h={'40px'}
                leftIcon={<MyIcon name={'common/download'} w={'18px'} />}
                onClick={handleDownloadTemplate}
              >
                {t('dataset:download_template')}
              </Button>
              <QuestionTip label={t('dataset:template_csv_format_tip')} maxW={'400px'} />
            </HStack>

            <FileSelector
              showFaqTip={true}
              maxCount={maxCount}
              maxSize={maxSize}
              fileType=".csv,.xlsx,.xls"
              selectFiles={selectFiles}
              setSelectFiles={setSelectFiles}
              autoFilterOverSize={true}
              FileTypeNode={
                <Box fontSize={'xs'}>
                  <Trans
                    i18nKey={'file:template_csv_file_select_tip'}
                    values={{
                      fileType: '.xlsx, .xls, .csv'
                    }}
                    components={{
                      highlight: <Box as="span" color="myGray.900" fontWeight="bold" />
                    }}
                  />
                </Box>
              }
            />

            {/* File render */}
            {selectFiles.length > 0 && (
              <VStack gap={2} alignItems="stretch">
                {selectFiles.map((item, index) => (
                  <HStack key={index} w={'100%'} spacing={2} justifyContent="space-between">
                    <HStack spacing={2} flex={1} overflow="hidden">
                      <MyIcon name={item.icon as any} w={'1rem'} flexShrink={0} />
                      <MyTooltip label={item.name} maxW="500px">
                        <Box
                          fontSize={'sm'}
                          color={'myGray.900'}
                          flex={1}
                          overflow="hidden"
                          textOverflow="ellipsis"
                          whiteSpace="nowrap"
                          maxW="320px"
                        >
                          {item.name}
                        </Box>
                      </MyTooltip>
                      <Box fontSize={'xs'} color={'myGray.500'} flexShrink={0}>
                        {item.size}
                      </Box>
                    </HStack>
                    <MyIconButton
                      icon="delete"
                      hoverColor="red.500"
                      hoverBg="red.50"
                      onClick={() => {
                        setSelectFiles(selectFiles.filter((_, i) => i !== index));
                      }}
                    />
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>
        </ModalBody>

        {/* 增强索引开关 */}
        <HStack justify="space-between" px={6} pb={4}>
          <HStack spacing={2}>
            <Text fontSize="sm" color="myGray.900">
              {t('dataset:enable_enhance_index')}
            </Text>
            <QuestionTip label={t('dataset:enable_enhance_index_tip')} />
          </HStack>
          <Switch
            isChecked={enableEnhance}
            onChange={(e) => setEnableEnhance(e.target.checked)}
            colorScheme="blue"
            size="md"
          />
        </HStack>

        <ModalFooter>
          <Button isLoading={isImporting} variant="whiteBase" mr={2} onClick={onClose}>
            {t('dataset:cancel')}
          </Button>
          <Button
            onClick={handleCheckAndImport}
            isDisabled={selectFiles.length === 0 || isImporting}
          >
            {isImporting
              ? uploadProgress.totalPercent === 100
                ? t('dataset:data_parsing')
                : `${t('dataset:data_uploading', {
                    num: uploadProgress.totalPercent
                  })} (${uploadProgress.currentFileIndex + 1}/${selectFiles.length})`
              : t('dataset:confirm')}
          </Button>
        </ModalFooter>
      </MyModal>

      {/* 重名校验弹窗 */}
      <DuplicateConfirmModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicateFiles={duplicateFiles}
        onSkipDuplicates={handleSkipDuplicates}
        onContinueUpload={handleContinueUpload}
        onReplaceFiles={handleReplaceFiles}
      />
      {/* MD5 重复弹窗 */}
      <Md5DuplicateModal
        isOpen={showMd5DuplicateModal}
        onClose={() => setShowMd5DuplicateModal(false)}
        md5DuplicateFiles={md5DuplicateFiles}
        onConfirm={handleMd5Confirm}
      />
    </>
  );
};

export default FaqImportModal;
