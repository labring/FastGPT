import React, { useRef, useCallback } from 'react';
import { Box, HStack, IconButton } from '@chakra-ui/react';
import MyTooltip from '../MyTooltip';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '../../../hooks/useCopyData';
import { exportTableToCSV, parseTableToMarkdownString } from './utils';
import MyIcon from '../Icon';

type MarkdownTableProps = {
  children: React.ReactNode;
};

/**
 * 增强型 Markdown 表格组件：
 * 1. 外层响应式横向滚动包装，防止超长表格撑破外层布局；
 * 2. 右上角悬浮操作栏：支持一键复制为 Markdown、下载为 CSV 文件。
 */
const MarkdownTable = ({ children }: MarkdownTableProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const tableRef = useRef<HTMLTableElement>(null);

  // 复制为 Markdown 表格
  const handleCopyMarkdown = useCallback(() => {
    if (tableRef.current) {
      const md = parseTableToMarkdownString(tableRef.current);
      if (md) copyData(md);
    }
  }, [copyData]);

  // 下载为本地 CSV 文件
  const handleDownloadCSV = useCallback(() => {
    if (tableRef.current) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      exportTableToCSV(tableRef.current, `table-${timestamp}`);
    }
  }, []);

  return (
    <Box
      my={3}
      w={'100%'}
      maxW={'100%'}
      position={'relative'}
      borderRadius={'md'}
      _hover={{
        '.table-action-bar': {
          opacity: 1,
          pointerEvents: 'auto'
        }
      }}
    >
      {/* 右上角悬浮操作栏 */}
      <HStack
        className="table-action-bar"
        spacing={1}
        position={'absolute'}
        top={2}
        right={2}
        zIndex={2}
        opacity={0}
        pointerEvents={'none'}
        transition={'opacity 0.2s'}
        bg={'rgba(255, 255, 255, 0.9)'}
        _dark={{
          bg: 'rgba(30, 36, 46, 0.9)'
        }}
        backdropFilter={'blur(4px)'}
        p={1}
        borderRadius={'md'}
        boxShadow={'0 1px 3px rgba(0, 0, 0, 0.1)'}
        border={'1px solid'}
        borderColor={'myGray.200'}
      >
        <MyTooltip label={t('common:copy_as_markdown')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="copy" w={'13px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={handleCopyMarkdown}
            aria-label={t('common:copy_as_markdown')}
          />
        </MyTooltip>
        <MyTooltip label={t('common:download_as_csv')} placement="top" hasArrow>
          <IconButton
            icon={<MyIcon name="export" w={'13px'} />}
            size={'xs'}
            variant={'ghost'}
            color={'myGray.600'}
            _hover={{ color: 'primary.600', bg: 'myGray.100' }}
            onClick={handleDownloadCSV}
            aria-label={t('common:download_as_csv')}
          />
        </MyTooltip>
      </HStack>

      {/* 横向平滑滚动容器 */}
      <Box overflowX={'auto'} overflowY={'hidden'} w={'100%'} maxW={'100%'} borderRadius={'md'}>
        <Box ref={tableRef} as="table" w={'100%'} minW={'max-content'}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(MarkdownTable);
