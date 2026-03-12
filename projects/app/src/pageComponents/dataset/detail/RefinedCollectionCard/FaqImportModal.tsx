import React, { useState } from 'react';
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
import { postImportFaqByTemplate, postCheckDuplicateCollection } from '@/web/core/dataset/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { Trans } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DuplicateConfirmModal from './DuplicateConfirmModal';
import ExcelJS from 'exceljs';

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
  const [enableEnhance, setEnableEnhance] = useState(true);

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

        await postImportFaqByTemplate({
          datasetId,
          parentId,
          file: filesToUpload[i].file,
          overwriteDuplicate,
          enableEnhance,
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
    // 检查是否有重名文件
    const fileNames = selectFiles.map((file) => file.file.name);
    const checkResult = await postCheckDuplicateCollection({
      datasetId,
      parentId: parentId || undefined,
      fileNames
    });

    if (checkResult.duplicateFileNames && checkResult.duplicateFileNames.length > 0) {
      setDuplicateFiles(checkResult.duplicateFileNames);
      setShowDuplicateModal(true);
    } else {
      // 没有重名文件，直接上传
      await uploadFiles(selectFiles);
    }
  };

  const handleSkipDuplicates = async () => {
    const filesToUpload = selectFiles.filter((file) => !duplicateFiles.includes(file.file.name));

    if (filesToUpload.length === 0) {
      toast({
        title: t('dataset:upload_other_files'),
        status: 'warning'
      });
      setShowDuplicateModal(false);
      return;
    }

    setShowDuplicateModal(false);
    await uploadFiles(filesToUpload);
  };

  const handleContinueUpload = async () => {
    setShowDuplicateModal(false);
    await uploadFiles(selectFiles);
  };

  const handleReplaceFiles = async () => {
    setShowDuplicateModal(false);
    await uploadFiles(selectFiles, duplicateFiles);
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
      const headerRow = worksheet.addRow(['q', 'a', 'indexes']);

      // 设置表头样式
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // 添加示例数据
      worksheet.addRow([
        'Who are you?',
        'I am an AI assistant, here to help with your questions and provide support. I can assist with learning, daily life queries, and creative ideas.',
        "1. What are you?\n2. What can you do?\n3. What topics can you help with?\n4. How do you assist users?\n5. What's your goal?"
      ]);

      worksheet.addRow([
        'What are you?',
        'I am an AI assistant designed to help users with their questions and provide support across various topics.',
        'What are you?'
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
      link.download = 'template.xlsx';
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
              maxCount={15}
              maxSize={50 * 1024 * 1024}
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
                      highlight: <Box as="span" color="primary.600" fontWeight="medium" />
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
                      <MyTooltip label={item.name}>
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
    </>
  );
};

export default FaqImportModal;
