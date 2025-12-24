import { base64ToFile, fileToBase64 } from '../utils';
import { compressBase64Img } from '../img';
import { useToast } from '../../../hooks/useToast';
import { useCallback, useRef, useTransition } from 'react';
import { useTranslation } from 'next-i18next';
import { type CreatePostPresignedUrlResult } from '../../../../service/common/s3/type';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';

export const useUploadAvatar = (
  api: (params: { filename: string }) => Promise<CreatePostPresignedUrlResult>,
  {
    onSuccess,
    maxW = 300,
    maxH = 300,
    maxSize = 1024 * 500 // 500KB
  }: {
    onSuccess?: (avatar: string) => void;
    maxW?: number;
    maxH?: number;
    maxSize?: number;
  } = {}
) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [uploading, startUpload] = useTransition();
  const uploadAvatarRef = useRef<HTMLInputElement>(null);

  const handleFileSelectorOpen = useCallback(() => {
    if (!uploadAvatarRef.current) return;
    uploadAvatarRef.current.click();
  }, []);

  // manually upload avatar
  const handleUploadAvatar = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(jpg|png|jpeg)$/)) {
        toast({ title: t('account_info:avatar_can_only_select_jpg_png'), status: 'warning' });
        return;
      }

      startUpload(async () => {
        const compressed = base64ToFile(
          await compressBase64Img({
            base64Img: await fileToBase64(file),
            maxW,
            maxH,
            maxSize
          }),
          file.name
        );
        const { url, fields } = await api({ filename: file.name });
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.set(k, v));
        formData.set('file', compressed);
        const res = await fetch(url, { method: 'POST', body: formData }); // 204
        if (res.ok && res.status === 204) {
          onSuccess?.(`${imageBaseUrl}${fields.key}`);
        }
      });
    },
    [t, toast, api, onSuccess]
  );

  const onUploadAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;

      if (!files || files.length === 0) {
        e.target.value = '';
        return;
      }
      if (files.length > 1) {
        toast({ title: t('account_info:avatar_can_only_select_one'), status: 'warning' });
        e.target.value = '';
        return;
      }
      const file = files[0]!;
      handleUploadAvatar(file);
    },
    [t, toast, handleUploadAvatar]
  );

  const Component = useCallback(() => {
    return (
      <input
        hidden
        type="file"
        multiple={false}
        accept=".jpg,.png,.jpeg"
        ref={uploadAvatarRef}
        onChange={onUploadAvatarChange}
      />
    );
  }, [onUploadAvatarChange]);

  return {
    uploading,
    Component,
    handleFileSelectorOpen,
    handleUploadAvatar
  };
};
