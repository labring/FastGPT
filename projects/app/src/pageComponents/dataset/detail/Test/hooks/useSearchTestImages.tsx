import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { getUploadSearchTestImagePresignedUrl } from '@/web/core/dataset/api/file';
import { useUserStore } from '@/web/support/user/useUserStore';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { putFileToS3 } from '@fastgpt/web/common/file/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  IMAGE_EXTENSION_SET,
  MAX_SEARCH_TEST_IMAGE_COUNT,
  SEARCH_TEST_IMAGE_UPLOAD_ENABLED
} from '../constants';
import type { SearchTestImageRef } from '../type';

export const useSearchTestImages = ({
  datasetId,
  canUseImageSearch,
  uploadFileMaxSize
}: {
  datasetId: string;
  canUseImageSearch: boolean;
  uploadFileMaxSize?: number;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { teamPlanStatus, initTeamPlanStatus } = useUserStore();
  const { File: ImageFileSelector, onOpen: onOpenImageSelector } = useSelectFile({
    fileType: imageFileType,
    multiple: true,
    maxCount: MAX_SEARCH_TEST_IMAGE_COUNT
  });
  const [queryImageRefs, setQueryImageRefs] = useState<SearchTestImageRef[]>([]);
  const [uploadingImageCount, setUploadingImageCount] = useState(0);

  // Feature flag lets the UI stay wired while image search upload is being rolled out.
  const showSearchTestImageEntry = SEARCH_TEST_IMAGE_UPLOAD_ENABLED && canUseImageSearch;

  const onSelectFile = async (files: File[]) => {
    const imageFiles = files.filter((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return !!extension && IMAGE_EXTENSION_SET.has(extension);
    });
    if (imageFiles.length < files.length) {
      toast({
        status: 'warning',
        title: t('chat:unsupported_file_type')
      });
    }

    // Prefer live team limits; fall back to frontend config so validation still works offline.
    const planStatus =
      teamPlanStatus ||
      (await initTeamPlanStatus()
        .then(() => useUserStore.getState().teamPlanStatus)
        .catch(() => undefined));
    const maxImageSize =
      (planStatus?.standard?.maxUploadFileSize ?? uploadFileMaxSize ?? 500) * 1024 * 1024;
    const validImageFiles = imageFiles.filter((file) => file.size <= maxImageSize);
    if (validImageFiles.length < imageFiles.length) {
      toast({
        status: 'warning',
        title: t('file:some_file_size_exceeds_limit', {
          maxSize: formatFileSize(maxImageSize)
        })
      });
    }

    if (queryImageRefs.length + validImageFiles.length > MAX_SEARCH_TEST_IMAGE_COUNT) {
      toast({
        status: 'warning',
        title: t('common:core.dataset.test.max_images_tip')
      });
    }

    // Trim the selected batch instead of rejecting all files when the max count is exceeded.
    const uploadFiles = validImageFiles.slice(
      0,
      Math.max(MAX_SEARCH_TEST_IMAGE_COUNT - queryImageRefs.length, 0)
    );
    if (uploadFiles.length === 0) return;

    setUploadingImageCount(uploadFiles.length);
    try {
      const uploadedImages = await Promise.all(
        uploadFiles.map(async (file) => {
          const { url, key, headers, maxSize, previewUrl } =
            await getUploadSearchTestImagePresignedUrl({
              datasetId,
              filename: file.name
            });
          await putFileToS3({
            url,
            headers,
            file,
            maxSize,
            t
          });
          return { key, previewUrl };
        })
      );
      setQueryImageRefs((state) => [...state, ...uploadedImages]);
    } catch {
      toast({
        status: 'warning',
        title: t('common:upload_file_error')
      });
    } finally {
      setUploadingImageCount(0);
    }
  };

  return {
    ImageFileSelector,
    queryImageRefs,
    uploadingImageCount,
    showSearchTestImageEntry,
    onOpenImageSelector,
    onSelectFile,
    removeImage: (key: string) =>
      setQueryImageRefs((state) => state.filter((item) => item.key !== key))
  };
};
