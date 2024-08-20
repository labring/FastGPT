import React, { useState } from 'react';
import { getPublishList, updateAppVersion } from '@/web/core/app/api/version';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import CustomRightDrawer from '@fastgpt/web/components/common/MyDrawer/CustomRightDrawer';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Input } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import { AppSchema } from '@fastgpt/global/core/app/type';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { WorkflowContext } from './WorkflowComponents/context';
import { formatTime2YMDHM, formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Tag from '@fastgpt/web/components/common/Tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { storeEdgesRenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';

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
        top={'60px'}
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

  return (
    <Flex px={5} flex={'1 0 0'} flexDirection={'column'}>
      {past.length > 0 && (
        <Box py={2} px={3}>
          <Button
            variant={'whiteBase'}
            w={'full'}
            h={'30px'}
            onClick={() => {
              const initialState = past[past.length - 1];
              saveSnapshot({
                customTitle: t(`app:app.version_initial_copy`)
              });
              resetSnapshot(initialState);
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
              onClick={() => {
                saveSnapshot({
                  customTitle: `${t('app:app.version_copy')}-${item.title}`
                });

                resetSnapshot(item);
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
              <Box ml={3} flex={'1 0 0'} fontSize={'sm'}>
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

  const { list, ScrollList, isLoading, fetchData } = useScrollPagination(getPublishList, {
    itemHeight: 40,
    overscan: 20,

    pageSize: 30,
    defaultParams: {
      appId: appDetail._id
    }
  });
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined);

  const [isEditing, setIsEditing] = useState(false);

  return (
    <ScrollList isLoading={isLoading} flex={'1 0 0'} px={5}>
      {list.map((data, index) => {
        const item = data.data;
        const firstPublishedIndex = list.findIndex((data) => data.data.isPublish);

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
            onClick={() => {
              const state = {
                nodes: item.nodes?.map((item) => storeNode2FlowNode({ item })),
                edges: item.edges?.map((item) => storeEdgesRenderEdge({ edge: item })),
                title: item.versionName,
                chatConfig: item.chatConfig
              };

              saveSnapshot({
                customTitle: `${t('app:app.version_copy')}-${state.title}`
              });

              resetSnapshot(state);
            }}
          >
            <MyPopover
              trigger="hover"
              placement={'bottom-end'}
              w={'208px'}
              h={'72px'}
              Trigger={
                <Box>
                  <Avatar src={item.avatar} borderRadius={'50%'} w={'24px'} h={'24px'} />
                </Box>
              }
            >
              {({ onClose }) => (
                <Flex alignItems={'center'} h={'full'} pl={5} gap={3}>
                  <Box>
                    <Avatar src={item.avatar} borderRadius={'50%'} w={'36px'} h={'36px'} />
                  </Box>
                  <Box>
                    <Box fontSize={'14px'} color={'myGray.900'}>
                      {item.username}
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
                <Box ml={3} flex={'1 0 0'} fontSize={'sm'}>
                  {item.versionName || formatTime2YMDHM(item.time)}
                </Box>
                {hoveredIndex !== index && item.isPublish && (
                  <Tag
                    type="borderSolid"
                    colorSchema={index === firstPublishedIndex ? 'green' : 'blue'}
                  >
                    {index === firstPublishedIndex
                      ? t('app:app.version_current')
                      : t('app:app.version_past')}
                  </Tag>
                )}
                {hoveredIndex === index && (
                  <MyIcon
                    name="edit"
                    w={'18px'}
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
                  defaultValue={item.versionName || formatTime2YMDHM(item.time)}
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
