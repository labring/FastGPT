import React, { useMemo } from 'react';
import { Box, useTheme } from '@chakra-ui/react';
import { getFileAndOpen } from '@/utils/web/file';
import { useToast } from '@/hooks/useToast';
import { getErrText } from '@/utils/tools';

type QuoteItemType = {
  file_id?: string;
  filename: string;
};

const QuoteBlock = ({ code }: { code: string }) => {
  const theme = useTheme();
  const { toast } = useToast();
  const quoteList = useMemo(() => {
    try {
      return JSON.parse(code) as QuoteItemType[];
    } catch (error) {
      return [];
    }
  }, [code]);

  return (
    <Box mt={3} pt={2} borderTop={theme.borders.base}>
      {quoteList.length > 0 ? (
        <>
          <Box>本次回答的引用:</Box>
          <Box as={'ol'}>
            {quoteList.map((item, i) => (
              <Box
                key={i}
                as={'li'}
                {...(item.file_id
                  ? {
                      textDecoration: 'underline',
                      color: 'myBlue.800',
                      cursor: 'pointer'
                    }
                  : {})}
                onClick={async () => {
                  if (!item.file_id) return;
                  try {
                    await getFileAndOpen(item.file_id);
                  } catch (error) {
                    toast({
                      status: 'warning',
                      title: getErrText(error, '打开文件失败')
                    });
                  }
                }}
              >
                {item.filename}
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <Box>正在生成引用……</Box>
      )}
    </Box>
  );
};

export default QuoteBlock;
