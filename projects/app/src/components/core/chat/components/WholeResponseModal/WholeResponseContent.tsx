import { useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { AiChatRows, CommonInfoRows, DatasetSearchRows, WorkflowResultRows } from './ResponseRows';

export const WholeResponseContent = ({
  activeModule,
  hideTabs,
  dataId,
  onOpenRequestIdDetail
}: {
  activeModule: ChatHistoryItemResType;
  hideTabs?: boolean;
  dataId?: string;
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
  const queryPreviewDatasetId = activeModule?.quoteList?.[0]?.datasetId;
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeModule]);

  if (!activeModule) return null;

  return (
    <Box
      h={'100%'}
      ref={contentRef}
      py={3}
      px={hideTabs ? 4 : 3}
      display={'flex'}
      flexDirection={'column'}
      gap={3}
      {...(hideTabs
        ? {}
        : {
            flex: '1 0 0',
            overflow: 'auto'
          })}
    >
      <CommonInfoRows activeModule={activeModule} />
      <AiChatRows
        activeModule={activeModule}
        queryPreviewDatasetId={queryPreviewDatasetId}
        onOpenRequestIdDetail={onOpenRequestIdDetail}
      />
      <DatasetSearchRows activeModule={activeModule} dataId={dataId} />
      <WorkflowResultRows activeModule={activeModule} />
    </Box>
  );
};
