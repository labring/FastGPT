import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { base64ToFile, fileToBase64 } from '@/web/common/file/utils';
import { compressBase64Img } from '@fastgpt/web/common/file/img';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCallback, useRef, useTransition } from 'react';
import { useTranslation } from 'next-i18next';

export const useUploadAvatar = ({
  temporay = false,
  onSuccess
}: {
  temporay?: boolean;
  onSuccess: (avatar: string) => void;
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [uploading, startUpload] = useTransition();
  const uploadAvatarRef = useRef<HTMLInputElement>(null);

  const handleFileSelectorOpen = useCallback(() => {
    if (!uploadAvatarRef.current) return;
    uploadAvatarRef.current.click();
  }, []);

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

      if (!file.name.match(/\.(jpg|png|jpeg)$/)) {
        toast({ title: t('account_info:avatar_can_only_select_jpg_png'), status: 'warning' });
        e.target.value = '';
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
        const { url, fields } = await getUploadAvatarPresignedUrl({
          filename: file.name,
          temporay
        });
        const formData = new FormData();
        Object.entries(fields).forEach(([k, v]) => formData.set(k, v));
        formData.set('file', compressed);
        await fetch(url, { method: 'POST', body: formData }); // 204

        const avatar = `/api/system/img/${fields.key}`;
        onSuccess(avatar);

        e.target.value = '';
      });
    },
    [t, temporay, toast, onSuccess]
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
    handleFileSelectorOpen
  };
};
