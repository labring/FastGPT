import React, { useState } from 'react';
import {
  getAppVersionDetail,
  getWorkflowVersionList,
  updateAppVersion
} from '@/web/core/app/api/version';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import CustomRightDrawer from '@fastgpt/web/components/common/MyDrawer/CustomRightDrawer';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { WorkflowContext } from './WorkflowComponents/context';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Tag from '@fastgpt/web/components/common/Tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { storeEdgesRenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { versionListResponse } from '@/pages/api/core/app/version/listWorkflow';

const WorkflowPublishHistoriesSlider = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState<'myEdit' | 'teamCloud'>('myEdit');

  return (
    <>
      <CustomRightDrawer
        onClose={() => onClose()}
        title={
          (
            <>
              <LightRowTabs
                list={[
                  { label: t('workflow:workflow.My edit'), value: 'myEdit' },
                  { label: t('workflow:workflow.Team cloud'), value: 'teamCloud' }
                ]}
                value={currentTab}
                onChange={setCurrentTab}
                inlineStyles={{ px: 0.5, pb: 2 }}
                gap={5}
                py={0}
                fontSize={'sm'}
              />
            </>
          ) as any
        }
        maxW={'340px'}
        px={0}
        showMask={false}
        overflow={'unset'}
      >
        {currentTab === 'myEdit' ? <MyEdit /> : <TeamCloud />}
      </CustomRightDrawer>
    </>
  );
};

export default React.memo(WorkflowPublishHistoriesSlider);

const MyEdit = () => {
  const { past, saveSnapshot, resetSnapshot } = useContextSelector(WorkflowContext, (v) => v);
  const { t } = useTranslation();
  const { toast } = useToast();

  return (
    <Flex px={5} flex={'1 0 0'} flexDirection={'column'}>
      {past.length > 0 && (
        <Box py={2} px={3}>
          <Button
            variant={'whiteBase'}
            w={'full'}
            h={'30px'}
            onClick={async () => {
              const initialSnapshot = past[past.length - 1];

              const res = await saveSnapshot({
                pastNodes: initialSnapshot.nodes,
                pastEdges: initialSnapshot.edges,
                chatConfig: initialSnapshot.chatConfig,
                customTitle: t(`app:app.version_initial_copy`)
              });

              if (res) {
                resetSnapshot(initialSnapshot);
              }

              toast({
                title: t('workflow:workflow.Switch_success'),
                status: 'success'
              });
            }}
          >
            {t('app:app.version_back')}
          </Button>
        </Box>
      )}
      <Flex flex={'1 0 0'} flexDirection={'column'} overflow={'auto'}>
        {past.map((item, index) => {
          return (
            <Flex
              key={index}
              alignItems={'center'}
              py={2}
              px={3}
              borderRadius={'md'}
              cursor={'pointer'}
              fontWeight={500}
              _hover={{
                bg: 'primary.50'
              }}
              onClick={async () => {
                const res = await saveSnapshot({
                  pastNodes: item.nodes,
                  pastEdges: item.edges,
                  chatConfig: item.chatConfig,
                  customTitle: `${t('app:app.version_copy')}-${item.title}`
                });
                if (res) {
                  resetSnapshot(item);
                }

                toast({
                  title: t('workflow:workflow.Switch_success'),
                  status: 'success'
                });
              }}
            >
              <Box
                w={'12px'}
                h={'12px'}
                borderWidth={'2px'}
                borderColor={'primary.600'}
                borderRadius={'50%'}
                position={'relative'}
                {...(index !== past.length - 1 && {
                  _after: {
                    content: '""',
                    height: '26px',
                    width: '2px',
                    bgColor: 'myGray.250',
                    position: 'absolute',
                    top: '10px',
                    left: '3px'
                  }
                })}
              ></Box>
              <Box
                ml={3}
                flex={'1 0 0'}
                fontSize={'sm'}
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                color={'myGray.900'}
              >
                {item.title}
              </Box>
            </Flex>
          );
        })}
        <Box py={2} textAlign={'center'} color={'myGray.600'} fontSize={'xs'}>
          {t('common:common.No more data')}
        </Box>
      </Flex>
    </Flex>
  );
};

const TeamCloud = () => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { saveSnapshot, resetSnapshot } = useContextSelector(WorkflowContext, (v) => v);
  const { loadAndGetTeamMembers } = useUserStore();
  const { feConfigs } = useSystemStore();

  const { list, ScrollList, isLoading, fetchData } = useScrollPagination(getWorkflowVersionList, {
    itemHeight: 40,
    overscan: 20,

    pageSize: 30,
    defaultParams: {
      appId: appDetail._id
    }
  });
  const { data: members = [] } = useRequest2(loadAndGetTeamMembers, {
    manual: !feConfigs.isPlus
  });
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined);

  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const { runAsync: onChangeVersion, loading: isLoadingVersion } = useRequest2(
    async (versionItem: versionListResponse) => {
      const versionDetail = await getAppVersionDetail(versionItem._id, versionItem.appId);

      if (!versionDetail) return;

      const state = {
        nodes: versionDetail.nodes?.map((item) => storeNode2FlowNode({ item, t })),
        edges: versionDetail.edges?.map((item) => storeEdgesRenderEdge({ edge: item })),
        title: versionItem.versionName,
        chatConfig: versionDetail.chatConfig
      };

      await saveSnapshot({
        pastNodes: state.nodes,
        pastEdges: state.edges,
        chatConfig: state.chatConfig,
        customTitle: `${t('app:app.version_copy')}-${state.title}`
      });

      resetSnapshot(state);
      toast({
        title: t('workflow:workflow.Switch_success'),
        status: 'success'
      });
    }
  );

  return (
    <ScrollList isLoading={isLoading || isLoadingVersion} flex={'1 0 0'} px={5}>
      {list.map((data, index) => {
        const item = data.data;
        const firstPublishedIndex = list.findIndex((data) => data.data.isPublish);
        const tmb = members.find((member) => member.tmbId === item.tmbId);

        return (
          <Flex
            key={data.index}
            alignItems={'center'}
            py={editIndex !== index ? 2 : 1}
            px={3}
            borderRadius={'md'}
            cursor={'pointer'}
            fontWeight={500}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(undefined)}
            _hover={{
              bg: 'primary.50'
            }}
            onClick={() => editIndex === undefined && onChangeVersion(item)}
          >
            <MyPopover
              trigger="hover"
              placement={'bottom-end'}
              w={'208px'}
              h={'72px'}
              Trigger={
                <Box>
                  <Avatar src={tmb?.avatar} borderRadius={'50%'} w={'24px'} h={'24px'} />
                </Box>
              }
            >
              {({ onClose }) => (
                <Flex alignItems={'center'} h={'full'} pl={5} gap={3}>
                  <Box>
                    <Avatar src={tmb?.avatar} borderRadius={'50%'} w={'36px'} h={'36px'} />
                  </Box>
                  <Box>
                    <Box fontSize={'14px'} color={'myGray.900'}>
                      {tmb?.memberName}
                    </Box>
                    <Box fontSize={'12px'} color={'myGray.500'}>
                      {formatTime2YMDHMS(item.time)}
                    </Box>
                  </Box>
                </Flex>
              )}
            </MyPopover>
            {editIndex !== index ? (
              <>
                <Box
                  ml={3}
                  flex={'1 0 0'}
                  fontSize={'sm'}
                  display="flex"
                  alignItems="center"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  <Box minWidth={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    <Box as={'span'} color={'myGray.900'}>
                      {item.versionName || formatTime2YMDHMS(item.time)}
                    </Box>
                  </Box>
                  {item.isPublish && (
                    <Tag
                      ml={3}
                      flexShrink={0}
                      type="borderSolid"
                      colorSchema={index === firstPublishedIndex ? 'green' : 'blue'}
                    >
                      {index === firstPublishedIndex
                        ? t('app:app.version_current')
                        : t('app:app.version_past')}
                    </Tag>
                  )}
                </Box>
                {hoveredIndex === index && (
                  <MyIcon
                    name="edit"
                    w={'18px'}
                    ml={2}
                    _hover={{ color: 'primary.600' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditIndex(index);
                    }}
                  />
                )}
              </>
            ) : (
              <MyBox ml={3} isLoading={isEditing} size={'md'}>
                <Input
                  autoFocus
                  h={8}
                  defaultValue={item.versionName || formatTime2YMDHMS(item.time)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={async (e) => {
                    setIsEditing(true);
                    await updateAppVersion({
                      appId: item.appId,
                      versionName: e.target.value,
                      versionId: item._id
                    });
                    await fetchData();
                    setEditIndex(undefined);
                    setIsEditing(false);
                  }}
                />
              </MyBox>
            )}
          </Flex>
        );
      })}
    </ScrollList>
  );
};
