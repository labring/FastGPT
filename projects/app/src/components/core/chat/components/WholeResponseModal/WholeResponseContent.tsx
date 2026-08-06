import { useEffect, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { AiChatRows, CommonInfoRows, DatasetSearchRows, WorkflowResultRows } from './ResponseRows';

export const WholeResponseContent = ({
  activeModule,
  hideTabs,
  dataId,
  contentHeight,
  onOpenRequestIdDetail
}: {
  activeModule: ChatHistoryItemResType;
  hideTabs?: boolean;
  dataId?: string;
  contentHeight?: number;
  onOpenRequestIdDetail?: (requestId: string) => void;
}) => {
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
      minH={0}
      ref={contentRef}
      py={3}
      // 详情页移动端需要让内容贴合滚动容器，水平留白由外层面板负责。
      // 桌面端保留原有留白，避免改变完整结果的布局。
      px={hideTabs ? [0, 4] : 3}
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
      <AiChatRows activeModule={activeModule} onOpenRequestIdDetail={onOpenRequestIdDetail} />
      <DatasetSearchRows activeModule={activeModule} dataId={dataId} />
      <WorkflowResultRows activeModule={activeModule} contentHeight={contentHeight} />
    </Box>
  );
};
