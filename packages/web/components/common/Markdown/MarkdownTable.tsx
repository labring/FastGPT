import React, { useRef, useCallback } from 'react';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { exportTableToCSV } from './utils';
import MyIcon from '../Icon';

type MarkdownTableProps = {
  children: React.ReactNode;
};

/**
 * Custom table component for Markdown with CSV export functionality
 */
const MarkdownTable = ({ children }: MarkdownTableProps) => {
  const { t } = useTranslation();
  const tableRef = useRef<HTMLTableElement>(null);

  const handleExport = useCallback(() => {
    if (tableRef.current) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      exportTableToCSV(tableRef.current, `table-${timestamp}`);
    }
  }, []);

  return (
    <Box
      ref={tableRef}
      as="table"
      _hover={{
        '.export-button': {
          display: 'flex'
        }
      }}
    >
      <IconButton
        className="export-button"
        icon={<MyIcon name="export" w={'14px'} />}
        size={'xs'}
        display="none"
        variant={'whiteBase'}
        onClick={handleExport}
        position="absolute"
        top={1}
        right={2}
        zIndex={1}
        aria-label={''}
      />
      {children}
    </Box>
  );
};

export default React.memo(MarkdownTable);
