import React, { useState } from 'react';
import {
  getAppVersionDetail,
  getWorkflowVersionList,
  updateAppVersion
} from '@/web/core/app/api/version';
import { useVirtualScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import CustomRightDrawer from '@fastgpt/web/components/common/MyDrawer/CustomRightDrawer';
import { useTranslation } from 'next-i18next';
import { Box, BoxProps, Button, Flex, Input } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from './context';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import type { WorkflowSnapshotsType } from './WorkflowComponents/context';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Tag from '@fastgpt/web/components/common/Tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { AppVersionSchemaType, VersionListItemType } from '@fastgpt/global/core/app/version';
import type { SimpleAppSnapshotType } from './SimpleApp/useSnapshots';

const PublishHistoriesSlider = <T extends SimpleAppSnapshotType | WorkflowSnapshotsType>({
  onClose,
  past,
  onSwitchTmpVersion,
  onSwitchCloudVersion,
  positionStyles
}: {
  onClose: () => void;
  past: T[];
  onSwitchTmpVersion: (params: T, customTitle: string) => void;
  onSwitchCloudVersion: (appVersion: AppVersionSchemaType) => void;
  positionStyles?: BoxProps;
}) => {
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
        {...positionStyles}
      >
        {currentTab === 'myEdit' ? (
          <MyEdit past={past} onSwitchTmpVersion={onSwitchTmpVersion} />
        ) : (
          <TeamCloud onSwitchCloudVersion={onSwitchCloudVersion} />
        )}
      </CustomRightDrawer>
    </>
  );
};

export default PublishHistoriesSlider;

const MyEdit = <T extends SimpleAppSnapshotType | WorkflowSnapshotsType>({
  past,
  onSwitchTmpVersion
}: {
  past: T[];
  onSwitchTmpVersion: (params: T, customTitle: string) => void;
}) => {
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

              onSwitchTmpVersion(initialSnapshot, t(`app:version_initial_copy`));
              toast({
                title: t('workflow:workflow.Switch_success'),
                status: 'success'
              });
            }}
          >
            {t('app:version_back')}
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
                onSwitchTmpVersion(item, `${t('app:version_copy')}-${item.title}`);
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

const TeamCloud = ({
  onSwitchCloudVersion
}: {
  onSwitchCloudVersion: (appVersion: AppVersionSchemaType) => void;
}) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { loadAndGetTeamMembers } = useUserStore();
  const { feConfigs } = useSystemStore();

  const { scrollDataList, ScrollList, isLoading, fetchData, setData } = useVirtualScrollPagination(
    getWorkflowVersionList,
    {
      itemHeight: 40,
      overscan: 20,

      pageSize: 30,
      defaultParams: {
        appId: appDetail._id
      }
    }
  );
  const { data: members = [] } = useRequest2(loadAndGetTeamMembers, {
    manual: !feConfigs.isPlus
  });
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined);

  const { toast } = useToast();

  const { runAsync: onChangeVersion, loading: isLoadingVersion } = useRequest2(
    async (versionItem: VersionListItemType) => {
      const versionDetail = await getAppVersionDetail(versionItem._id, versionItem.appId);

      if (!versionDetail) return;

      onSwitchCloudVersion(versionDetail);
      toast({
        title: t('workflow:workflow.Switch_success'),
        status: 'success'
      });
    }
  );

  const { runAsync: onUpdateVersion, loading: isEditing } = useRequest2(
    async (item: VersionListItemType, name: string) => {
      await updateAppVersion({
        appId: item.appId,
        versionName: name,
        versionId: item._id
      });
      setData((state) =>
        state.map((version) =>
          version._id === item._id ? { ...version, versionName: name } : version
        )
      );
      setEditIndex(undefined);
    }
  );

  return (
    <ScrollList isLoading={isLoading || isLoadingVersion} flex={'1 0 0'} px={5}>
      {scrollDataList.map((data, index) => {
        const item = data.data;
        const firstPublishedIndex = scrollDataList.findIndex((data) => data.data.isPublish);
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
                  onBlur={(e) => onUpdateVersion(item, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // @ts-ignore
                      onUpdateVersion(item, e.target.value);
                    }
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
