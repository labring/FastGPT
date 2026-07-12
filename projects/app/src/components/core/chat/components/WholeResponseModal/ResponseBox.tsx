import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { WHOLE_RESPONSE_SIDE_TAB_PANEL_PADDING, WholeResponseSideTab } from './SideTab';
import { WholeResponseContent } from './WholeResponseContent';
import { flattenResponse, getSideTabItems, getSideTabMaxDepth } from './responseData';

const RequestIdDetailModal = dynamic(() => import('@/components/core/ai/requestId'));
const sideTabBaseWidth = 204;
const sideTabDeepTreeExtraWidth = 50;
const sideTabDeepTreeMinDepth = 4;

export const ResponseBox = React.memo(function ResponseBox({
  response,
  dataId,
  hideTabs = false,
  useMobile = false
}: {
  response: ChatHistoryItemResType[];
  dataId?: string;
  hideTabs?: boolean;
  useMobile?: boolean;
}) {
  const { t } = useSafeTranslation();
  const { isPc } = useSystem();
  const [selectedRequestId, setSelectedRequestId] = useState<string>();

  const handleOpenRequestIdDetail = useCallback((requestId: string) => {
    setSelectedRequestId(requestId);
  }, []);

  const handleCloseRequestIdModal = useCallback(() => {
    setSelectedRequestId(undefined);
  }, []);

  const flattedResponse = useMemo(() => flattenResponse(response), [response]);
  const [currentNodeId, setCurrentNodeId] = useState(
    flattedResponse[0]?.id ?? flattedResponse[0]?.nodeId ?? ''
  );

  useEffect(() => {
    if (flattedResponse.length === 0) {
      setCurrentNodeId('');
      return;
    }
    if (flattedResponse.some((item) => item.id === currentNodeId)) return;

    setCurrentNodeId(flattedResponse[0].id ?? flattedResponse[0].nodeId ?? '');
  }, [currentNodeId, flattedResponse]);

  const activeModule = useMemo(
    () =>
      (flattedResponse.find((item) => item.id === currentNodeId) ||
        flattedResponse[0]) as ChatHistoryItemResType,
    [currentNodeId, flattedResponse]
  );

  const sliderResponseList = useMemo(() => getSideTabItems(response), [response]);
  const sideTabWidth = useMemo(() => {
    const maxDepth = getSideTabMaxDepth(sliderResponseList);
    return `${sideTabBaseWidth + (maxDepth >= sideTabDeepTreeMinDepth ? sideTabDeepTreeExtraWidth : 0)}px`;
  }, [sliderResponseList]);

  const {
    isOpen: isOpenMobileModal,
    onOpen: onOpenMobileModal,
    onClose: onCloseMobileModal
  } = useDisclosure();

  return (
    <>
      {isPc && !useMobile ? (
        <Flex
          overflow={'hidden'}
          height={'100%'}
          minH={0}
          bg={'myGray.25'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'12px'}
        >
          <Box
            w={sideTabWidth}
            flexShrink={0}
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
            p={`${WHOLE_RESPONSE_SIDE_TAB_PANEL_PADDING}px`}
            overflowY={'auto'}
            overflowX={'hidden'}
          >
            <WholeResponseSideTab
              response={sliderResponseList}
              value={currentNodeId}
              onChange={setCurrentNodeId}
            />
          </Box>
          <Box flex={'1 0 0'} w={0} h={'100%'} minH={0} overflow={'hidden'}>
            <WholeResponseContent
              dataId={dataId}
              activeModule={activeModule}
              hideTabs={hideTabs}
              onOpenRequestIdDetail={handleOpenRequestIdDetail}
            />
          </Box>
        </Flex>
      ) : (
        <Box h={'100%'} minH={0} overflow={'hidden'} position={'relative'}>
          <Box h={'100%'} minH={0} overflow={'auto'}>
            <WholeResponseSideTab
              response={sliderResponseList}
              value={currentNodeId}
              onChange={(item: string) => {
                setCurrentNodeId(item);
                onOpenMobileModal();
              }}
              isMobile={true}
            />
          </Box>
          {isOpenMobileModal && (
            <Flex
              position={'absolute'}
              inset={0}
              zIndex={1}
              bg={'white'}
              flexDirection={'column'}
              h={'100%'}
              minH={0}
            >
              <Flex
                align={'center'}
                justifyContent={'center'}
                px={2}
                py={2}
                borderBottom={'sm'}
                position={'relative'}
                height={'40px'}
              >
                <MyIcon
                  width={4}
                  height={4}
                  name="common/backLight"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseMobileModal();
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
          )}
        </Box>
      )}

      {selectedRequestId && (
        <RequestIdDetailModal onClose={handleCloseRequestIdModal} requestId={selectedRequestId} />
      )}
    </>
  );
});
