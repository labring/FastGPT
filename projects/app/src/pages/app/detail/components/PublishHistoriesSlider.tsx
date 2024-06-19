import React, { useCallback, useState } from 'react';
import { getPublishList, postRevertVersion } from '@/web/core/app/api/version';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import CustomRightDrawer from '@fastgpt/web/components/common/MyDrawer/CustomRightDrawer';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useContextSelector } from 'use-context-selector';
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppContext } from './context';
import { useI18n } from '@/web/context/I18n';
import { AppSchema } from '@fastgpt/global/core/app/type';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

export type InitProps = {
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
};

const PublishHistoriesSlider = ({
  onClose,
  initData,
  defaultData
}: {
  onClose: () => void;
  initData: (data: InitProps) => void;
  defaultData: InitProps;
}) => {
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { appDetail, setAppDetail, reloadAppLatestVersion } = useContextSelector(
    AppContext,
    (v) => v
  );
  const appId = appDetail._id;

  const [selectedHistoryId, setSelectedHistoryId] = useState<string>();

  const { list, ScrollList, isLoading } = useScrollPagination(getPublishList, {
    itemHeight: 49,
    overscan: 20,

    pageSize: 30,
    defaultParams: {
      appId
    }
  });

  const onPreview = useCallback(
    (data: AppVersionSchemaType) => {
      setSelectedHistoryId(data._id);

      initData({
        nodes: data.nodes,
        edges: data.edges,
        chatConfig: data.chatConfig
      });
    },
    [initData]
  );
  const onCloseSlider = useCallback(
    (data: InitProps) => {
      setSelectedHistoryId(undefined);
      initData(data);
      onClose();
    },
    [initData, onClose]
  );

  const { runAsync: onRevert } = useRequest2(
    async (data: AppVersionSchemaType) => {
      if (!appId) return;
      await postRevertVersion(appId, {
        versionId: data._id,
        editNodes: defaultData.nodes, // old workflow
        editEdges: defaultData.edges,
        editChatConfig: defaultData.chatConfig
      });

      setAppDetail((state) => ({
        ...state,
        modules: data.nodes,
        edges: data.edges
      }));

      onCloseSlider(data);
      reloadAppLatestVersion();
    },
    {
      successToast: appT('version.Revert success')
    }
  );

  const showLoading = isLoading;

  return (
    <>
      <CustomRightDrawer
        onClose={() =>
          onCloseSlider({
            nodes: defaultData.nodes,
            edges: defaultData.edges,
            chatConfig: defaultData.chatConfig
          })
        }
        iconSrc="core/workflow/versionHistories"
        title={t('core.workflow.publish.histories')}
        maxW={'300px'}
        px={0}
        showMask={false}
        top={'60px'}
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
              nodes: defaultData.nodes,
              edges: defaultData.edges,
              chatConfig: defaultData.chatConfig
            });
          }}
        >
          {appT('Current settings')}
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
                  <PopoverConfirm
                    showCancel
                    content={t('core.workflow.publish.OnRevert version confirm')}
                    onConfirm={() => onRevert(item)}
                    Trigger={
                      <Box>
                        <MyTooltip label={t('core.workflow.publish.OnRevert version')}>
                          <MyIcon
                            name={'core/workflow/revertVersion'}
                            w={'20px'}
                            color={'primary.600'}
                          />
                        </MyTooltip>
                      </Box>
                    }
                  />
                )}
              </Flex>
            );
          })}
        </ScrollList>
      </CustomRightDrawer>
    </>
  );
};

export default React.memo(PublishHistoriesSlider);
