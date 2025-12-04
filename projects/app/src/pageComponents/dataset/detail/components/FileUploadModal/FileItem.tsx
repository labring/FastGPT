import React from 'react';
import { HStack, Box, Spinner } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { FileStatus } from './useFileUpload';
import type { FileItem } from './useFileUpload';
import { useTranslation } from 'next-i18next';

interface FileItemProps {
  fileItem: FileItem;
  onRemove?: () => void;
  disabled?: boolean;
}

const FileItemComponent: React.FC<FileItemProps> = ({ fileItem, onRemove, disabled = false }) => {
  const { t } = useTranslation();
  const getStatusIcon = () => {
    switch (fileItem.status) {
      case FileStatus.UPLOADING:
        return <Spinner size="md" color="blue.500" thickness="3px" />;
      case FileStatus.SUCCESS:
        return <MyIcon name="common/check" w={6} h={6} color="green.500" />;
      case FileStatus.FAILED:
        return <MyIcon name="common/errorFill" w={6} h={6} color="red.500" />;
      default:
        return null;
    }
  };

  const getFileIconColor = () => {
    const fileName = fileItem.file.name.toLowerCase();
    if (fileName.endsWith('.pdf')) return 'red.500';
    if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) return 'blue.500';
    if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) return 'green.500';
    if (fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) return 'orange.500';
    if (fileName.endsWith('.txt') || fileName.endsWith('.md')) return 'gray.600';
    return 'myGray.500';
  };

  const getCardBg = () => {
    switch (fileItem.status) {
      case FileStatus.SUCCESS:
        return 'green.50';
      case FileStatus.FAILED:
        return 'red.50';
      case FileStatus.UPLOADING:
        return 'blue.50';
      default:
        return 'white';
    }
  };

  const getBorderColor = () => {
    switch (fileItem.status) {
      case FileStatus.SUCCESS:
        return 'green.200';
      case FileStatus.FAILED:
        return 'red.200';
      case FileStatus.UPLOADING:
        return 'blue.200';
      default:
        return 'myGray.200';
    }
  };

  return (
    <HStack
      w={'100%'}
      p={2}
      borderRadius="md"
      bg={getCardBg()}
      borderColor={getBorderColor()}
      _hover={{
        borderColor: 'primary.300',
        bg: fileItem.status === FileStatus.PENDING ? 'gray.50' : getCardBg()
      }}
    >
      {/* 文件图标或状态图标 */}
      <MyIcon name={fileItem.icon as any} w={'1rem'} color={getFileIconColor()} />

      {/* 文件名 */}
      <Box
        color={fileItem.status === FileStatus.FAILED ? 'red.700' : 'myGray.900'}
        flex={1}
        w={'50%'}
        fontSize="sm"
        fontWeight="medium"
      >
        {fileItem.file.name}
      </Box>

      {/* 文件大小 */}
      <Box fontSize="xs" color="myGray.500">
        {formatFileSize(fileItem.file.size)}
      </Box>

      {/* 删除按钮或加载图标 */}
      {fileItem.status === FileStatus.UPLOADING ? (
        <Spinner size="sm" color="blue.500" thickness="2px" />
      ) : (fileItem.status === FileStatus.PENDING || fileItem.status === FileStatus.FAILED) &&
        !disabled &&
        onRemove ? (
        <MyIconButton
          icon="delete"
          onClick={onRemove}
          aria-label={t('common:Delete')}
          color="myGray.500"
          _hover={{ color: 'red.500', bg: 'red.50' }}
        />
      ) : null}
    </HStack>
  );
};

export default React.memo(FileItemComponent);
