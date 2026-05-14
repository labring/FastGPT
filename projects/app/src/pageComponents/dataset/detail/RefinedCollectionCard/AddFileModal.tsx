import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Flex,
  Grid,
  Button,
  ModalBody,
  ModalFooter,
  Textarea,
  Switch,
  HStack,
  VStack,
  Text
} from '@chakra-ui/react';
import { useTranslation, Trans } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { CollectionTagValueType } from '@fastgpt/global/core/dataset/type';
import TagRowsEditor, { type TagEditorRow } from './TagRowsEditor';
import FileSelector, {
  type SelectFileItemType as ImportSelectFileItemType
} from '../Import/components/FileSelector';
import { documentAndImageFileType } from '@fastgpt/global/common/file/constants';
import { getUploadDatasetFilePresignedUrl } from '@/web/core/dataset/api';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import type { ImportSourceItemType } from '@/web/core/dataset/type';
import {
  postCreateCustomFileIdCollection,
  postCheckDuplicateCollection,
  postCheckMd5Duplicate,
  postCreateCustomWebsiteCollection,
  getAllTags
} from '@/web/core/dataset/api';
import { createImageDatasetCollection } from '@/web/core/dataset/image/api';
import DuplicateConfirmModal from './DuplicateConfirmModal';
import Md5DuplicateModal, { type Md5DuplicateItem } from './Md5DuplicateModal';
import FileSelectorBox, {
  type SelectFileItemType as FaqSelectFileItemType
} from '@/components/Select/FileSelectorBox';
import { postImportFaqByTemplate } from '@/web/core/dataset/api';
import ExcelJS from 'exceljs';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import TagManageModal from './TagManageModal';
import SparkMD5 from 'spark-md5';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

type AddMode = 'file' | 'faq' | 'web';

export type AddFileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  datasetId: string;
  parentId?: string;
  onFinish: () => void;
};

// ─── 卡片配置 ────────────────────────────────────────────────────────────────

const ADD_MODE_CARDS: { mode: AddMode; icon: string; nameKey: string; descKey: string }[] = [
  {
    mode: 'file',
    icon: 'core/dataset/addFile',
    nameKey: 'dataset:upload_file_type_name',
    descKey: 'dataset:upload_file_type_desc'
  },
  {
    mode: 'faq',
    icon: 'core/dataset/addFaq',
    nameKey: 'dataset:upload_faq_type_name',
    descKey: 'dataset:upload_faq_type_desc'
  },
  {
    mode: 'web',
    icon: 'core/dataset/addWebLink',
    nameKey: 'dataset:add_web_link_type_name',
    descKey: 'dataset:add_web_link_type_desc'
  }
];

// ─── 标签工具函数 ─────────────────────────────────────────────────────────────

function tagsToCollectionTags(rows: TagEditorRow[]): CollectionTagValueType[] {
  return rows
    .filter((r) => r.tagId && r.value.trim())
    .map((r) => ({ tagId: r.tagId, value: r.value.trim() }));
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

const AddFileModal: React.FC<AddFileModalProps> = ({
  isOpen,
  onClose,
  datasetId,
  parentId,
  onFinish
}) => {
  const { t } = useTranslation();

  // ── 顶层状态 ─────────────────────────────
  const [addMode, setAddMode] = useState<AddMode>('file');
  const [tagRows, setTagRows] = useState<TagEditorRow[]>([]);
  const [tagOptions, setTagOptions] = useState<
    { label: string; value: string; tagType?: string }[]
  >([]);
  const [showTagManageModal, setShowTagManageModal] = useState(false);

  const loadTagOptions = useCallback(() => {
    getAllTags(datasetId).then((result) => {
      setTagOptions(
        result.list.map((tag) => ({ label: tag.tag, value: tag._id, tagType: tag.tagType }))
      );
    });
  }, [datasetId]);

  useEffect(() => {
    loadTagOptions();
  }, [loadTagOptions]);

  // ── 上传文件专有状态 ──────────────────────
  const [selectFiles, setSelectFiles] = useState<ImportSourceItemType[]>([]);
  const [duplicateFiles, setDuplicateFiles] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const { toast } = useToast();

  // ── MD5 去重弹窗 ────────────────────────────
  const [md5DuplicateFiles, setMd5DuplicateFiles] = useState<Md5DuplicateItem[]>([]);
  const [showMd5DuplicateModal, setShowMd5DuplicateModal] = useState(false);
  // 缓存前端计算的 MD5 值，供弹窗确认后上传时使用
  const md5MapRef = useRef<Map<string, string>>(new Map());

  // ── FAQ 专有状态 ──────────────────────────────
  const [faqSelectFiles, setFaqSelectFiles] = useState<FaqSelectFileItemType[]>([]);
  const [faqUploadProgress, setFaqUploadProgress] = useState({
    totalPercent: 0,
    currentFileIndex: 0
  });
  const [isImportingFaq, setIsImportingFaq] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── 读取网页专有状态 ──────────────────────
  const [webUrl, setWebUrl] = useState('');
  const [webAutoSync, setWebAutoSync] = useState(false);

  // ── 文件上传逻辑 ──────────────────────────
  const imageExtensions = new Set(['.jpg', '.jpeg', '.png']);
  const isImageFile = (filename: string) => {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
    return imageExtensions.has(ext);
  };

  const docSuccessFiles = selectFiles.filter(
    (f) => !f.errorMsg && !f.isUploading && !isImageFile(f.sourceName)
  );
  const imageSuccessFiles = selectFiles.filter(
    (f) => !f.errorMsg && !f.isUploading && isImageFile(f.sourceName)
  );

  const { runAsync: onSelectFiles, loading: uploading } = useRequest(
    async (files: ImportSelectFileItemType[]) => {
      const docFiles = files.filter(({ file }) => !isImageFile(file.name));
      await Promise.all(
        docFiles.map(async ({ fileId, file }) => {
          try {
            const { url, key, headers } = await getUploadDatasetFilePresignedUrl({
              filename: file.name,
              datasetId
            });
            await putFileToS3({
              url,
              file,
              headers,
              t,
              onUploadProgress: (e) => {
                if (!e.total) return;
                const percent = Math.round((e.loaded / e.total) * 100);
                setSelectFiles((s) =>
                  s.map((item) =>
                    item.id === fileId
                      ? {
                          ...item,
                          uploadedFileRate: item.uploadedFileRate
                            ? Math.max(percent, item.uploadedFileRate)
                            : percent
                        }
                      : item
                  )
                );
              },
              onSuccess: () => {
                setSelectFiles((s) =>
                  s.map((item) =>
                    item.id === fileId
                      ? { ...item, dbFileId: key, isUploading: false, uploadedFileRate: 100 }
                      : item
                  )
                );
              }
            });
          } catch (error) {
            setSelectFiles((s) =>
              s.map((item) =>
                item.id === fileId
                  ? { ...item, isUploading: false, errorMsg: getErrText(error) }
                  : item
              )
            );
          }
        })
      );
    },
    {
      onBefore([files]) {
        setSelectFiles((s) => [
          ...s,
          ...files.map<ImportSourceItemType>(({ fileId, file }) => ({
            id: fileId,
            createStatus: 'waiting',
            file,
            sourceName: file.name,
            sourceSize: formatFileSize(file.size),
            icon: getFileIcon(file.name),
            isUploading: !isImageFile(file.name),
            uploadedFileRate: 0
          }))
        ]);
      }
    }
  );

  // ── 下载 FAQ 模板 ─────────────────────────
  const handleDownloadTemplate = useCallback(async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Template');
      worksheet.columns = [{ width: 30 }, { width: 60 }, { width: 60 }];
      const headerRow = worksheet.addRow([
        t('dataset:faq_template_col_question'),
        t('dataset:faq_template_col_answer'),
        t('dataset:faq_template_col_indexes')
      ]);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
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
      const buffer = await workbook.xlsx.writeBuffer();
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
  }, [t]);

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

  /**
   * 批量计算文件 MD5，返回 fileName→md5 的映射。
   * 文档文件已预上传至 S3 但 file 引用仍保留，因此也能计算 MD5。
   */
  const computeFilesMd5 = async (
    files: { name: string; file: File }[]
  ): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    await Promise.all(
      files.map(async (f) => {
        const md5 = await computeFileMd5(f.file);
        map.set(f.name, md5);
      })
    );
    return map;
  };

  const handleConfirm = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const tags = tagsToCollectionTags(tagRows);

      if (addMode === 'file') {
        const allSuccess = [...docSuccessFiles, ...imageSuccessFiles];
        if (allSuccess.length === 0) return;

        // 过滤出有 file 引用的条目（文档预上传后仍保留引用，图片直接持有）
        const filesWithRef = allSuccess.filter((f) => !!f.file);
        const fileNames = allSuccess.map((f) => f.sourceName);

        // 1. 计算所有文件 MD5
        const md5Map = await computeFilesMd5(
          filesWithRef.map((f) => ({ name: f.sourceName, file: f.file! }))
        );
        md5MapRef.current = md5Map;

        // 2. 统一调用 md5Duplicate API 检测同批次内重复 + 与知识库已有文件重复
        const md5Record: Record<string, string> = {};
        for (const name of fileNames) {
          const md5 = md5Map.get(name);
          if (md5) md5Record[name] = md5;
        }

        if (Object.keys(md5Record).length > 0) {
          const md5CheckResult = await postCheckMd5Duplicate({ datasetId, md5Map: md5Record });

          if (md5CheckResult.duplicates?.length > 0) {
            // 弹出 MD5 重复确认弹窗，用户确认后过滤并继续上传
            setMd5DuplicateFiles(md5CheckResult.duplicates);
            setShowMd5DuplicateModal(true);
            return;
          }
        }

        // 3. 文件名重复检查
        const finalNames = fileNames;
        const finalFiles = filesWithRef;

        if (finalNames.length === 0) return;

        const checkResult = await postCheckDuplicateCollection({
          datasetId,
          parentId: parentId || undefined,
          fileNames: finalNames
        });
        if (checkResult.duplicateFileNames?.length > 0) {
          setDuplicateFiles(checkResult.duplicateFileNames);
          setShowDuplicateModal(true);
          return;
        }

        await Promise.all([
          ...finalFiles
            .filter((f) => !isImageFile(f.sourceName))
            .map((file) =>
              postCreateCustomFileIdCollection({
                datasetId,
                parentId,
                fileId: file.dbFileId!,
                name: file.sourceName,
                overwriteDuplicate: false,
                enableEnhance: true,
                tags,
                fileMd5: md5Map.get(file.sourceName)
              })
            ),
          ...finalFiles
            .filter((f) => isImageFile(f.sourceName))
            .map((item) =>
              createImageDatasetCollection({
                datasetId,
                parentId,
                collectionName: item.sourceName,
                files: [item.file!],
                overwriteDuplicate: false,
                tags,
                fileMd5: md5Map.get(item.sourceName)
              })
            )
        ]);
      } else if (addMode === 'faq') {
        if (faqSelectFiles.length === 0) return;

        // 1. 计算所有文件 MD5
        const md5Map = await computeFilesMd5(
          faqSelectFiles.map((f) => ({ name: f.file.name, file: f.file }))
        );
        md5MapRef.current = md5Map;

        // 2. MD5 去重检测
        const md5Record: Record<string, string> = {};
        for (const f of faqSelectFiles) {
          const md5 = md5Map.get(f.file.name);
          if (md5) md5Record[f.file.name] = md5;
        }

        if (Object.keys(md5Record).length > 0) {
          const md5CheckResult = await postCheckMd5Duplicate({ datasetId, md5Map: md5Record });

          if (md5CheckResult.duplicates?.length > 0) {
            setMd5DuplicateFiles(md5CheckResult.duplicates);
            setShowMd5DuplicateModal(true);
            return;
          }
        }

        // 3. 文件名重复检查
        const fileNames = faqSelectFiles.map((f) => f.file.name);
        const checkResult = await postCheckDuplicateCollection({
          datasetId,
          parentId: parentId || undefined,
          fileNames
        });
        if (checkResult.duplicateFileNames?.length > 0) {
          setDuplicateFiles(checkResult.duplicateFileNames);
          setShowDuplicateModal(true);
          return;
        }
        setIsImportingFaq(true);
        for (let i = 0; i < faqSelectFiles.length; i++) {
          setFaqUploadProgress({
            totalPercent: Math.floor((i / faqSelectFiles.length) * 100),
            currentFileIndex: i
          });
          await postImportFaqByTemplate({
            datasetId,
            parentId,
            file: faqSelectFiles[i].file,
            overwriteDuplicate: false,
            enableEnhance: true,
            tags,
            fileMd5: md5Map.get(faqSelectFiles[i].file.name),
            percentListen: (p) =>
              setFaqUploadProgress({
                totalPercent: Math.floor(
                  (i / faqSelectFiles.length) * 100 + p / faqSelectFiles.length
                ),
                currentFileIndex: i
              })
          });
        }
        setIsImportingFaq(false);
      } else if (addMode === 'web') {
        if (!webUrl.trim()) return;
        const urls = webUrl
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 10);
        if (urls.length === 0) return;
        await postCreateCustomWebsiteCollection({
          datasetId,
          parentId,
          urls,
          autoSync: webAutoSync,
          tags
        });
      }

      onFinish();
      onClose();
    } catch (error) {
      toast({ title: getErrText(error), status: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    addMode,
    tagRows,
    datasetId,
    parentId,
    docSuccessFiles,
    imageSuccessFiles,
    faqSelectFiles,
    webUrl,
    webAutoSync,
    onFinish,
    onClose,
    toast
  ]);

  // MD5 去重弹窗确认：过滤掉重复文件后继续执行文件名检查并上传
  const handleMd5Confirm = useCallback(async () => {
    const tags = tagsToCollectionTags(tagRows);
    const md5DupNewNames = new Set(md5DuplicateFiles.map((d) => d.newFileName));

    setShowMd5DuplicateModal(false);
    setIsSubmitting(true);
    try {
      if (addMode === 'file') {
        // 过滤掉 MD5 重复的文件
        const finalDoc = docSuccessFiles.filter((f) => !md5DupNewNames.has(f.sourceName));
        const finalImg = imageSuccessFiles.filter((f) => !md5DupNewNames.has(f.sourceName));

        if (finalDoc.length === 0 && finalImg.length === 0) {
          toast({ title: t('dataset:upload_other_files'), status: 'warning' });
          setSelectFiles([]);
          return;
        }

        // 文件名重复检查
        const allFinal = [...finalDoc, ...finalImg];
        const fileNames = allFinal.map((f) => f.sourceName);
        const checkResult = await postCheckDuplicateCollection({
          datasetId,
          parentId: parentId || undefined,
          fileNames
        });
        if (checkResult.duplicateFileNames?.length > 0) {
          setDuplicateFiles(checkResult.duplicateFileNames);
          setShowDuplicateModal(true);
          return;
        }

        await Promise.all([
          ...finalDoc.map((file) =>
            postCreateCustomFileIdCollection({
              datasetId,
              parentId,
              fileId: file.dbFileId!,
              name: file.sourceName,
              overwriteDuplicate: false,
              enableEnhance: true,
              tags,
              fileMd5: md5MapRef.current.get(file.sourceName)
            })
          ),
          ...finalImg
            .filter((item) => !!item.file)
            .map((item) =>
              createImageDatasetCollection({
                datasetId,
                parentId,
                collectionName: item.sourceName,
                files: [item.file!],
                overwriteDuplicate: false,
                tags,
                fileMd5: md5MapRef.current.get(item.sourceName)
              })
            )
        ]);
      } else if (addMode === 'faq') {
        // 过滤掉 MD5 重复的 FAQ 文件
        const finalFaq = faqSelectFiles.filter((f) => !md5DupNewNames.has(f.file.name));

        if (finalFaq.length === 0) {
          toast({ title: t('dataset:upload_other_files'), status: 'warning' });
          setFaqSelectFiles([]);
          return;
        }

        // 文件名重复检查
        const fileNames = finalFaq.map((f) => f.file.name);
        const checkResult = await postCheckDuplicateCollection({
          datasetId,
          parentId: parentId || undefined,
          fileNames
        });
        if (checkResult.duplicateFileNames?.length > 0) {
          setDuplicateFiles(checkResult.duplicateFileNames);
          setShowDuplicateModal(true);
          return;
        }

        setIsImportingFaq(true);
        for (let i = 0; i < finalFaq.length; i++) {
          setFaqUploadProgress({
            totalPercent: Math.floor((i / finalFaq.length) * 100),
            currentFileIndex: i
          });
          await postImportFaqByTemplate({
            datasetId,
            parentId,
            file: finalFaq[i].file,
            overwriteDuplicate: false,
            enableEnhance: true,
            tags,
            fileMd5: md5MapRef.current.get(finalFaq[i].file.name),
            percentListen: (p) =>
              setFaqUploadProgress({
                totalPercent: Math.floor((i / finalFaq.length) * 100 + p / finalFaq.length),
                currentFileIndex: i
              })
          });
        }
        setIsImportingFaq(false);
      }

      onFinish();
      onClose();
    } catch (error) {
      toast({ title: getErrText(error), status: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    addMode,
    md5DuplicateFiles,
    docSuccessFiles,
    imageSuccessFiles,
    faqSelectFiles,
    datasetId,
    parentId,
    tagRows,
    onFinish,
    onClose,
    t,
    toast
  ]);

  const handleSkipDuplicates = useCallback(async () => {
    const tags = tagsToCollectionTags(tagRows);
    if (addMode === 'file') {
      const toUploadDoc = docSuccessFiles.filter((f) => !duplicateFiles.includes(f.sourceName));
      const toUploadImg = imageSuccessFiles.filter((f) => !duplicateFiles.includes(f.sourceName));
      if (toUploadDoc.length === 0 && toUploadImg.length === 0) {
        toast({ title: t('dataset:upload_other_files'), status: 'warning' });
        setShowDuplicateModal(false);
        return;
      }
      await Promise.all([
        ...toUploadDoc.map((f) =>
          postCreateCustomFileIdCollection({
            datasetId,
            parentId,
            fileId: f.dbFileId!,
            name: f.sourceName,
            overwriteDuplicate: false,
            enableEnhance: true,
            tags
          })
        ),
        ...toUploadImg
          .filter((f) => !!f.file)
          .map((f) =>
            createImageDatasetCollection({
              datasetId,
              parentId,
              collectionName: f.sourceName,
              files: [f.file!],
              overwriteDuplicate: false,
              tags,
              fileMd5: md5MapRef.current.get(f.sourceName)
            })
          )
      ]);
    } else {
      const toUpload = faqSelectFiles.filter((f) => !duplicateFiles.includes(f.file.name));
      if (toUpload.length === 0) {
        toast({ title: t('dataset:upload_other_files'), status: 'warning' });
        setShowDuplicateModal(false);
        return;
      }
      for (const file of toUpload) {
        await postImportFaqByTemplate({
          datasetId,
          parentId,
          file: file.file,
          overwriteDuplicate: false,
          enableEnhance: true,
          tags,
          percentListen: () => {}
        });
      }
    }
    setShowDuplicateModal(false);
    onFinish();
    onClose();
  }, [
    addMode,
    tagRows,
    datasetId,
    parentId,
    docSuccessFiles,
    imageSuccessFiles,
    faqSelectFiles,
    duplicateFiles,
    onFinish,
    onClose,
    t,
    toast
  ]);

  const handleReplaceFiles = useCallback(async () => {
    const tags = tagsToCollectionTags(tagRows);
    if (addMode === 'file') {
      await Promise.all([
        ...docSuccessFiles.map((f) =>
          postCreateCustomFileIdCollection({
            datasetId,
            parentId,
            fileId: f.dbFileId!,
            name: f.sourceName,
            overwriteDuplicate: true,
            enableEnhance: true,
            tags
          })
        ),
        ...imageSuccessFiles
          .filter((f) => !!f.file)
          .map((f) =>
            createImageDatasetCollection({
              datasetId,
              parentId,
              collectionName: f.sourceName,
              files: [f.file!],
              overwriteDuplicate: true,
              tags,
              fileMd5: md5MapRef.current.get(f.sourceName)
            })
          )
      ]);
    } else {
      for (const file of faqSelectFiles) {
        await postImportFaqByTemplate({
          datasetId,
          parentId,
          file: file.file,
          overwriteDuplicate: true,
          enableEnhance: true,
          tags,
          percentListen: () => {}
        });
      }
    }
    setShowDuplicateModal(false);
    onFinish();
    onClose();
  }, [
    addMode,
    tagRows,
    datasetId,
    parentId,
    docSuccessFiles,
    imageSuccessFiles,
    faqSelectFiles,
    onFinish,
    onClose
  ]);

  const handleContinueUpload = useCallback(async () => {
    const tags = tagsToCollectionTags(tagRows);
    if (addMode === 'file') {
      await Promise.all([
        ...docSuccessFiles.map((f) =>
          postCreateCustomFileIdCollection({
            datasetId,
            parentId,
            fileId: f.dbFileId!,
            name: f.sourceName,
            overwriteDuplicate: false,
            enableEnhance: true,
            tags
          })
        ),
        ...imageSuccessFiles
          .filter((f) => !!f.file)
          .map((f) =>
            createImageDatasetCollection({
              datasetId,
              parentId,
              collectionName: f.sourceName,
              files: [f.file!],
              overwriteDuplicate: false,
              tags,
              fileMd5: md5MapRef.current.get(f.sourceName)
            })
          )
      ]);
    } else {
      for (const file of faqSelectFiles) {
        await postImportFaqByTemplate({
          datasetId,
          parentId,
          file: file.file,
          overwriteDuplicate: false,
          enableEnhance: true,
          tags,
          percentListen: () => {}
        });
      }
    }
    setShowDuplicateModal(false);
    onFinish();
    onClose();
  }, [
    addMode,
    tagRows,
    datasetId,
    parentId,
    docSuccessFiles,
    imageSuccessFiles,
    faqSelectFiles,
    onFinish,
    onClose
  ]);

  // ── 标签操作 ──────────────────────────────
  const addTagRow = useCallback(() => {
    setTagRows((prev) => [...prev, { tagId: '', value: '' }]);
  }, []);

  const updateTagRow = useCallback((index: number, field: 'tagId' | 'value', val: string) => {
    setTagRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: val } : r)));
  }, []);

  const removeTagRow = useCallback((index: number) => {
    setTagRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── 标签输入区渲染 ────────────────────────
  const TagSection = useMemo(
    () => (
      <Flex alignItems="flex-start" mt={4}>
        <FormLabel flex="0 0 95px" h="32px">
          {t('dataset:tag.tags')}
        </FormLabel>
        <Box flex={1}>
          <TagRowsEditor
            rows={tagRows}
            allTagOptions={tagOptions}
            onAddRow={addTagRow}
            onUpdateRow={updateTagRow}
            onRemoveRow={removeTagRow}
            selectFooter={(closeMenu) => (
              <Button
                variant={'whiteBase'}
                w="100%"
                leftIcon={
                  <MyIcon name={'core/dataset/tag' as any} w="12px" h="12px" color="#3E4A59" />
                }
                onClick={() => {
                  closeMenu();
                  setShowTagManageModal(true);
                }}
              >
                {t('dataset:tag.manage')}
              </Button>
            )}
          />
        </Box>
      </Flex>
    ),
    [tagRows, tagOptions, addTagRow, updateTagRow, removeTagRow, t]
  );

  return (
    <>
      <MyModal
        title={t('dataset:add_file')}
        isOpen={isOpen}
        onClose={onClose}
        w="750px"
        maxW="750px"
        closeOnOverlayClick={false}
      >
        <ModalBody p={8}>
          {/* ── 添加方式 ── */}
          <Flex alignItems="flex-start">
            <FormLabel flex="0 0 95px" h="32px" required>
              {t('dataset:add_type_label')}
            </FormLabel>
            <Grid flex={1} gridTemplateColumns="repeat(3, 1fr)" gap={2}>
              {ADD_MODE_CARDS.map((card) => {
                const isSelected = addMode === card.mode;
                return (
                  <Box
                    key={card.mode}
                    border={isSelected ? '1px solid #1770E6' : '1px solid #E8EBF0'}
                    borderRadius="4px"
                    p={4}
                    cursor="pointer"
                    boxShadow={isSelected ? '0px 0px 0px 2px rgba(23, 112, 230, 0.15)' : 'none'}
                    onClick={() => setAddMode(card.mode)}
                  >
                    <HStack spacing="8px">
                      <MyIcon name={card.icon as any} w="20px" h="20px" flexShrink={0} />
                      <Text fontSize="14px" fontWeight="600" color="#333">
                        {t(card.nameKey as any)}
                      </Text>
                    </HStack>
                    <Text fontSize="12px" color="#666" mt="4px">
                      {t(card.descKey as any)}
                    </Text>
                  </Box>
                );
              })}
            </Grid>
          </Flex>

          {/* ── 动态字段区 ── */}
          {addMode === 'file' && (
            <FileFields
              datasetId={datasetId}
              parentId={parentId}
              tagSection={TagSection}
              selectFiles={selectFiles}
              onSelectFiles={onSelectFiles}
              setSelectFiles={setSelectFiles}
            />
          )}
          {addMode === 'faq' && (
            <FaqFields
              datasetId={datasetId}
              parentId={parentId}
              tagSection={TagSection}
              faqSelectFiles={faqSelectFiles}
              setFaqSelectFiles={setFaqSelectFiles}
              handleDownloadTemplate={handleDownloadTemplate}
            />
          )}
          {addMode === 'web' && (
            <WebFields
              webUrl={webUrl}
              setWebUrl={setWebUrl}
              webAutoSync={webAutoSync}
              setWebAutoSync={setWebAutoSync}
              tagSection={TagSection}
              t={t}
            />
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="whiteBase" mr={3} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            isLoading={isSubmitting || uploading || isImportingFaq}
            isDisabled={
              (addMode === 'file' &&
                selectFiles.filter((f) => !f.errorMsg && !f.isUploading).length === 0) ||
              (addMode === 'faq' && faqSelectFiles.length === 0) ||
              (addMode === 'web' && !webUrl.trim())
            }
          >
            {t('common:Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
      <DuplicateConfirmModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicateFiles={duplicateFiles}
        onSkipDuplicates={handleSkipDuplicates}
        onContinueUpload={handleContinueUpload}
        onReplaceFiles={handleReplaceFiles}
      />
      <Md5DuplicateModal
        isOpen={showMd5DuplicateModal}
        onClose={() => setShowMd5DuplicateModal(false)}
        md5DuplicateFiles={md5DuplicateFiles}
        onConfirm={handleMd5Confirm}
      />
      {showTagManageModal && (
        <TagManageModal
          onClose={(refresh) => {
            setShowTagManageModal(false);
            if (refresh) loadTagOptions();
          }}
        />
      )}
    </>
  );
};

// ─── 占位子组件（Task 5/6/7 中实现） ──────────────────────────────────────────

const FileFields: React.FC<{
  datasetId: string;
  parentId?: string;
  tagSection: React.ReactNode;
  selectFiles: ImportSourceItemType[];
  onSelectFiles: (files: ImportSelectFileItemType[]) => any;
  setSelectFiles: React.Dispatch<React.SetStateAction<ImportSourceItemType[]>>;
}> = ({ tagSection, selectFiles, onSelectFiles, setSelectFiles }) => {
  const { t } = useTranslation();
  return (
    <>
      <Flex alignItems="flex-start" mt={4}>
        <FormLabel flex="0 0 95px" h="32px" required>
          {t('dataset:file')}
        </FormLabel>
        <Box flex={1}>
          <FileSelector
            fileType={documentAndImageFileType}
            selectFiles={selectFiles}
            onSelectFiles={onSelectFiles}
          />
          {selectFiles.length > 0 && (
            <VStack gap={2} alignItems="stretch" mt={3}>
              {selectFiles.map((item, index) => (
                <HStack key={item.id} w="100%" spacing={2} justifyContent="space-between">
                  <HStack spacing={2} flex={1} overflow="hidden">
                    <MyIcon name={item.icon as any} w="1rem" flexShrink={0} />
                    <MyTooltip label={item.sourceName} maxW="500px">
                      <Box
                        fontSize="sm"
                        lineHeight={1.6}
                        color="myGray.900"
                        flex={1}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        maxW="380px"
                      >
                        {item.sourceName}
                      </Box>
                    </MyTooltip>
                    <Box fontSize="xs" color="myGray.500" flexShrink={0}>
                      {item.sourceSize}
                    </Box>
                    {item.errorMsg ? (
                      <Box fontSize="xs" color="red.500" flexShrink={0}>
                        {item.errorMsg}
                      </Box>
                    ) : item.isUploading ? (
                      <Box fontSize="xs" color="myGray.500" flexShrink={0}>
                        {item.uploadedFileRate}%
                      </Box>
                    ) : null}
                  </HStack>
                  {!item.errorMsg && !item.isUploading && (
                    <MyIconButton
                      icon="delete"
                      hoverColor="red.500"
                      hoverBg="red.50"
                      onClick={() => setSelectFiles((s) => s.filter((_, i) => i !== index))}
                    />
                  )}
                </HStack>
              ))}
            </VStack>
          )}
        </Box>
      </Flex>
      {tagSection}
    </>
  );
};

const FaqFields: React.FC<{
  datasetId: string;
  parentId?: string;
  tagSection: React.ReactNode;
  faqSelectFiles: FaqSelectFileItemType[];
  setFaqSelectFiles: React.Dispatch<React.SetStateAction<FaqSelectFileItemType[]>>;
  handleDownloadTemplate: () => void;
}> = ({ tagSection, faqSelectFiles, setFaqSelectFiles, handleDownloadTemplate }) => {
  const { t } = useTranslation();
  return (
    <>
      <Flex alignItems="flex-start" mt={4}>
        <FormLabel flex="0 0 95px" h="32px" required>
          {t('dataset:file')}
        </FormLabel>
        <Box flex={1}>
          <FileSelectorBox
            showFaqTip
            fileType=".csv,.xlsx,.xls"
            selectFiles={faqSelectFiles}
            setSelectFiles={setFaqSelectFiles}
            autoFilterOverSize
            FileTypeNode={
              <Box fontSize="xs">
                <Trans
                  i18nKey={'file:template_csv_file_select_tip'}
                  values={{ fileType: '.xlsx, .xls, .csv' }}
                  components={{
                    highlight: <Box as="span" color="myGray.900" fontWeight="bold" />
                  }}
                />
              </Box>
            }
          />
          {faqSelectFiles.length > 0 && (
            <VStack gap={2} alignItems="stretch" mt={2}>
              {faqSelectFiles.map((item, index) => (
                <HStack key={index} w="100%" spacing={2} justifyContent="space-between">
                  <HStack spacing={2} flex={1} overflow="hidden">
                    <MyIcon name={item.icon as any} w="1rem" flexShrink={0} />
                    <MyTooltip label={item.name} maxW="500px">
                      <Box
                        fontSize="sm"
                        lineHeight={1.6}
                        color="myGray.900"
                        flex={1}
                        overflow="hidden"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        maxW="380px"
                      >
                        {item.name}
                      </Box>
                    </MyTooltip>
                    <Box fontSize="xs" color="myGray.500" flexShrink={0}>
                      {item.size}
                    </Box>
                  </HStack>
                  <MyIconButton
                    icon="delete"
                    hoverColor="red.500"
                    hoverBg="red.50"
                    onClick={() => setFaqSelectFiles((s) => s.filter((_, i) => i !== index))}
                  />
                </HStack>
              ))}
            </VStack>
          )}
          <HStack mt={1} spacing={1}>
            <Button
              variant="link"
              fontSize="12px"
              fontWeight="normal"
              color="#156AD9"
              onClick={handleDownloadTemplate}
            >
              {t('dataset:add_file_download_template')}
            </Button>
            <QuestionTip
              label={
                <Trans
                  i18nKey="dataset:faq_template_format_tip"
                  components={{ bold: <strong /> }}
                />
              }
              maxW="400px"
            />
          </HStack>
        </Box>
      </Flex>
      {tagSection}
    </>
  );
};

const WebFields: React.FC<{
  webUrl: string;
  setWebUrl: (v: string) => void;
  webAutoSync: boolean;
  setWebAutoSync: (v: boolean) => void;
  tagSection: React.ReactNode;
  t: (key: any) => string;
}> = ({ webUrl, setWebUrl, webAutoSync, setWebAutoSync, tagSection, t }) => {
  return (
    <>
      <Flex alignItems="flex-start" mt={4}>
        <FormLabel flex="0 0 95px" h="32px" required>
          {t('dataset:web_page_url')}
        </FormLabel>
        <Textarea
          flex={1}
          h="120px"
          placeholder={t('dataset:web_single_url_placeholder')}
          value={webUrl}
          onChange={(e) => setWebUrl(e.target.value)}
          bg="white"
          fontSize="sm"
          resize="vertical"
        />
      </Flex>

      <Flex alignItems="center" mt={4}>
        <FormLabel flex="0 0 95px" h="32px">
          <HStack spacing={1}>
            <Box>{t('dataset:sync_schedule')}</Box>
            <QuestionTip label={t('dataset:sync_schedule_tip')} />
          </HStack>
        </FormLabel>
        <Switch isChecked={webAutoSync} onChange={(e) => setWebAutoSync(e.target.checked)} />
      </Flex>

      {tagSection}
    </>
  );
};

export default AddFileModal;
