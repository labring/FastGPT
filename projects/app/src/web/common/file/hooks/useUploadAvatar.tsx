import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { base64ToFile, fileToBase64 } from '@/web/common/file/utils';
import { compressBase64Img } from '@fastgpt/web/common/file/img';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCallback, useRef, useState, useTransition } from 'react';
import { useTranslation } from 'next-i18next';

export const useUploadAvatar = (onSuccess: (avatar: string) => void) => {
  const { t } = useTranslation();
  const uploadAvatarRef = useRef<HTMLInputElement>(null);
  const [isUploading, startUpload] = useTransition();
  const { toast } = useToast();
  const [_, setAvatar] = useState<string>();

  const handleOpenSelectFile = useCallback(() => {
    if (!uploadAvatarRef.current) return;
    uploadAvatarRef.current.click();
  }, []);

  const onUploadAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      if (files.length > 1) {
        toast({ title: t('account_info:avatar_can_only_select_one'), status: 'warning' });
        return;
      }
      const file = files[0];
      if (!file) return;

      if (!file.name.match(/\.(jpg|png|jpeg)$/)) {
        toast({ title: t('account_info:avatar_can_only_select_jpg_png'), status: 'warning' });
        return;
      }

      startUpload(async () => {
        const compressed = base64ToFile(
          await compressBase64Img({
            base64Img: await fileToBase64(file),
            maxW: 300,
            maxH: 300
          }),
          file.name
        );
        const { url, fields } = await getUploadAvatarPresignedUrl(file.name);
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.set(k, v));
        formData.set('file', compressed);
        await fetch(url, { method: 'POST', body: formData }); // 204

        const prefix = '/api/system/img/';
        const avatar = `${prefix}${fields.key}`;
        setAvatar(avatar);
        onSuccess(avatar);
      });
    },
    [toast, onSuccess, t]
  );

  const UploadAvatar = () => {
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
  };

  return {
    isUploading,
    UploadAvatar,
    handleOpenSelectFile
  };
};
