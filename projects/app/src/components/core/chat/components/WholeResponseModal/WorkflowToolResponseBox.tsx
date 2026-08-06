import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { WholeResponseSideTab } from './SideTab';
import { WholeResponseContent } from './WholeResponseContent';
import { flattenResponse, getSideTabItems } from './responseData';

const RequestIdDetailModal = dynamic(() => import('@/components/core/ai/requestId'));

/**
 * 工作流工具专用完整结果：列表沿用工具面板的父级滚动，详情覆盖整个结果区域。
 */
export const WorkflowToolResponseBox = React.memo(function WorkflowToolResponseBox({
  response,
  dataId
}: {
  response: ChatHistoryItemResType[];
  dataId?: string;
}) {
  const { t } = useSafeTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string>();

  // 流式运行期间 response 可能原地追加内容，不能按数组引用缓存计算结果。
  const flattedResponse = flattenResponse(response);
  const [currentNodeId, setCurrentNodeId] = useState(
    flattedResponse[0]?.id ?? flattedResponse[0]?.nodeId ?? ''
  );

  const firstNodeId = flattedResponse[0]?.id ?? flattedResponse[0]?.nodeId ?? '';
  const hasCurrentNode = flattedResponse.some((item) => item.id === currentNodeId);

  useEffect(() => {
    if (!firstNodeId) {
      setCurrentNodeId('');
      return;
    }
    if (hasCurrentNode) return;

    setCurrentNodeId(firstNodeId);
  }, [currentNodeId, firstNodeId, hasCurrentNode]);

  const activeModule = (flattedResponse.find((item) => item.id === currentNodeId) ||
    flattedResponse[0]) as ChatHistoryItemResType;
  // 流式响应会暂时按 parentId 挂成树，工具面板需要和历史结果保持一致，逐节点展示完整执行链路。
  const sliderResponseList = getSideTabItems(flattedResponse);

  const { isOpen: isOpenDetail, onOpen: onOpenDetail, onClose: onCloseDetail } = useDisclosure();

  const handleOpenRequestIdDetail = useCallback((requestId: string) => {
    setSelectedRequestId(requestId);
  }, []);

  return (
    <Box ref={rootRef} minH={'100%'} h={'100%'}>
      {isOpenDetail ? (
        <Flex bg={'white'} flexDirection={'column'} h={'100%'} minH={0}>
          <Flex
            align={'center'}
            justifyContent={'center'}
            px={2}
            py={2}
            borderBottom={'sm'}
            position={'relative'}
            height={'40px'}
            flexShrink={0}
          >
            <MyIcon
              width={4}
              height={4}
              name="common/backLight"
              onClick={(e) => {
                e.stopPropagation();
                onCloseDetail();
              }}
              position={'absolute'}
              left={2}
              top={'50%'}
              transform={'translateY(-50%)'}
              cursor={'pointer'}
              _hover={{ color: 'primary.500' }}
            />

            <Avatar
              src={
                activeModule.moduleLogo ||
                moduleTemplatesFlat.find(
                  (template) => activeModule.moduleType === template.flowNodeType
                )?.avatar
              }
              w={'1.25rem'}
              h={'1.25rem'}
              borderRadius={'sm'}
            />

            <Box ml={1.5} lineHeight={'1.25rem'} alignItems={'center'}>
              {t(activeModule.moduleName as any, activeModule.moduleNameArgs)}
            </Box>
          </Flex>

          <Box flex={'1 1 0'} minH={0} overflowY={'auto'}>
            <WholeResponseContent
              dataId={dataId}
              activeModule={activeModule}
              hideTabs={true}
              onOpenRequestIdDetail={handleOpenRequestIdDetail}
            />
          </Box>
        </Flex>
      ) : (
        <WholeResponseSideTab
          response={sliderResponseList}
          value={currentNodeId}
          onChange={(item: string) => {
            setCurrentNodeId(item);
            rootRef.current?.parentElement?.scrollTo({ top: 0 });
            onOpenDetail();
          }}
          isMobile={true}
        />
      )}

      {selectedRequestId && (
        <RequestIdDetailModal
          onClose={() => setSelectedRequestId(undefined)}
          requestId={selectedRequestId}
        />
      )}
    </Box>
  );
});
