import React from 'react';
import { VStack, Box, Grid, GridItem } from '@chakra-ui/react';
import type { FileItem } from './useFileUpload';
import FileItemComponent from './FileItem';

interface FileListProps {
  files: FileItem[];
  onRemoveFile?: (id: string) => void;
  onRetryFailed?: () => void;
  disabled?: boolean;
}

const FileList: React.FC<FileListProps> = ({ files, onRemoveFile, disabled = false }) => {
  if (files.length === 0) {
    return null;
  }

  return (
    <VStack spacing={2} align="stretch">
      {/* 文件网格列表 */}
      <Box maxH="400px" overflowY="auto">
        <Grid templateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap={2}>
          {files.map((fileItem) => (
            <GridItem key={fileItem.id}>
              <FileItemComponent
                fileItem={fileItem}
                onRemove={() => onRemoveFile?.(fileItem.id)}
                disabled={disabled}
              />
            </GridItem>
          ))}
        </Grid>
      </Box>
    </VStack>
  );
};

export default React.memo(FileList);
