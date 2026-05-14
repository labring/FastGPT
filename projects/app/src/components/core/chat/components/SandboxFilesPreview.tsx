import React, { useMemo } from 'react';
import FilesBlock from '@/components/core/chat/ChatContainer/ChatBox/components/FilesBox';
import type { UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

export type SandboxFileItem = { fileUrl: string; filename: string };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

const SandboxFilesPreview = ({ files }: { files: SandboxFileItem[] }) => {
  const items = useMemo<UserInputFileItemType[]>(
    () =>
      files.map((f, i) => {
        const isImage = IMAGE_EXT.test(f.filename);
        return {
          id: `${i}-${f.filename}`,
          type: isImage ? ChatFileTypeEnum.image : ChatFileTypeEnum.file,
          name: f.filename,
          url: f.fileUrl,
          icon: isImage ? '' : getFileIcon(f.filename),
          status: 1
        };
      }),
    [files]
  );

  return <FilesBlock files={items} />;
};

export default React.memo(SandboxFilesPreview);
