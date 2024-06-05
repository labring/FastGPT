import React, { useCallback, useState } from 'react';
import { getPublishList, postRevertVersion } from '@/web/core/app/versionApi';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import CustomRightDrawer from '@fastgpt/web/components/common/MyDrawer/CustomRightDrawer';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';
import { Box, Button, Flex } from '@chakra-ui/react';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { AppContext } from '@/web/core/app/context/appContext';

const PublishHistoriesSlider = () => {
  const { t } = useTranslation();
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('core.workflow.publish.OnRevert version confirm')
  });

  const { appDetail, setAppDetail } = useContextSelector(AppContext, (v) => v);
  const appId = useContextSelector(WorkflowContext, (e) => e.appId);
  const setIsShowVersionHistories = useContextSelector(
    WorkflowContext,
    (e) => e.setIsShowVersionHistories
  );
  const initData = useContextSelector(WorkflowContext, (e) => e.initData);

  const [selectedHistoryId, setSelectedHistoryId] = useState<string>();

  const { list, ScrollList, isLoading } = useScrollPagination(getPublishList, {
    itemHeight: 49,
    overscan: 20,

    pageSize: 30,
    defaultParams: {
      appId
    }
  });

  const onClose = useMemoizedFn(() => {
    setIsShowVersionHistories(false);
  });

  const onPreview = useCallback((data: AppVersionSchemaType) => {
    setSelectedHistoryId(data._id);

    initData({
      nodes: data.nodes,
      edges: data.edges
    });
  }, []);
  const onCloseSlider = useCallback(
    (data: { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] }) => {
      setSelectedHistoryId(undefined);
      initData(data);
      onClose();
    },
    [appDetail]
  );

  const { mutate: onRevert, isLoading: isReverting } = useRequest({
    mutationFn: async (data: AppVersionSchemaType) => {
      if (!appId) return;
      await postRevertVersion(appId, {
        versionId: data._id,
        editNodes: appDetail.modules, // old workflow
        editEdges: appDetail.edges
      });

      setAppDetail((state) => ({
        ...state,
        modules: data.nodes,
        edges: data.edges
      }));

      onCloseSlider(data);
    }
  });

  const showLoading = isLoading || isReverting;

  return (
    <>
      <CustomRightDrawer
        onClose={() =>
          onCloseSlider({
            nodes: appDetail.modules,
            edges: appDetail.edges
          })
        }
        iconSrc="core/workflow/versionHistories"
        title={t('core.workflow.publish.histories')}
        maxW={'300px'}
        px={0}
        showMask={false}
        mt={'60px'}
        overflow={'unset'}
      >
        <Button
          mx={'20px'}
          variant={'whitePrimary'}
          mb={2}
          isDisabled={!selectedHistoryId}
          onClick={() => {
            setSelectedHistoryId(undefined);
            initData({
              nodes: appDetail.modules,
              edges: appDetail.edges
            });
          }}
        >
          {t('core.workflow.Current workflow')}
        </Button>
        <ScrollList isLoading={showLoading} flex={'1 0 0'} px={5}>
          {list.map((data, index) => {
            const item = data.data;

            return (
              <Flex
                key={data.index}
                alignItems={'center'}
                py={3}
                px={3}
                borderRadius={'md'}
                cursor={'pointer'}
                fontWeight={500}
                _hover={{
                  bg: 'primary.50'
                }}
                {...(selectedHistoryId === item._id && {
                  color: 'primary.600'
                })}
                onClick={() => onPreview(item)}
              >
                <Box
                  w={'12px'}
                  h={'12px'}
                  borderWidth={'2px'}
                  borderColor={'primary.600'}
                  borderRadius={'50%'}
                  position={'relative'}
                  {...(index !== list.length - 1 && {
                    _after: {
                      content: '""',
                      height: '40px',
                      width: '2px',
                      bgColor: 'myGray.250',
                      position: 'absolute',
                      top: '10px',
                      left: '3px'
                    }
                  })}
                ></Box>
                <Box ml={3} flex={'1 0 0'}>
                  {formatTime2YMDHM(item.time)}
                </Box>
                {item._id === selectedHistoryId && (
                  <MyTooltip label={t('core.workflow.publish.OnRevert version')}>
                    <MyIcon
                      name={'core/workflow/revertVersion'}
                      w={'20px'}
                      color={'primary.600'}
                      onClick={(e) => {
                        e.stopPropagation();
                        openConfirm(() => onRevert(item))();
                      }}
                    />
                  </MyTooltip>
                )}
              </Flex>
            );
          })}
        </ScrollList>
      </CustomRightDrawer>
      <ConfirmModal />
    </>
  );
};

export default React.memo(PublishHistoriesSlider);
