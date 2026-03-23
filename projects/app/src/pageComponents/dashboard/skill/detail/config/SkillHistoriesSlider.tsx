import React, { useState } from 'react';
import CustomRightDrawer from '@fastgpt/web/components/common/MyDrawer/CustomRightDrawer';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Flex, Input } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import Tag from '@fastgpt/web/components/common/Tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import type { VersionListItemType } from '@fastgpt/global/core/app/version/type';

// Mock 历史版本数据
const mockVersionList: VersionListItemType[] = [
  {
    _id: 'v1',
    appId: 'skill1',
    versionName: 'PublishedVersion',
    time: new Date('2024-03-10T10:00:00'),
    isPublish: true,
    tmbId: 'tmb1',
    sourceMember: {
      name: 'Admin',
      avatar: '',
      status: 'active' as any
    }
  },
  {
    _id: 'v2',
    appId: 'skill1',
    versionName: '',
    time: new Date('2024-03-09T15:30:00'),
    isPublish: true,
    tmbId: 'tmb1',
    sourceMember: {
      name: 'Admin',
      avatar: '',
      status: 'active' as any
    }
  },
  {
    _id: 'v3',
    appId: 'skill1',
    versionName: '',
    time: new Date('2024-03-08T09:20:00'),
    isPublish: false,
    tmbId: 'tmb1',
    sourceMember: {
      name: 'Admin',
      avatar: '',
      status: 'active' as any
    }
  }
];

const SkillHistoriesSlider = ({ onClose }: { onClose: () => void }) => {
  const { t } = useSafeTranslation();

  return (
    <CustomRightDrawer
      onClose={onClose}
      title={t('skill:history_versions')}
      maxW={'340px'}
      px={0}
      showMask={false}
      overflow={'unset'}
      bottom={3}
    >
      <HistoryList onClose={onClose} />
    </CustomRightDrawer>
  );
};

export default SkillHistoriesSlider;

const HistoryList = ({ onClose }: { onClose: () => void }) => {
  const { t } = useSafeTranslation();
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>(undefined);
  const [versionList, setVersionList] = useState<VersionListItemType[]>(mockVersionList);
  const [isEditing, setIsEditing] = useState(false);

  const firstPublishedIndex = versionList.findIndex((data) => data.isPublish);

  const onChangeVersion = (item: VersionListItemType) => {
    // TODO: 接入真实切换版本接口
    console.log('switch to version:', item._id);
    onClose();
  };

  const onUpdateVersion = async (item: VersionListItemType, name: string) => {
    // TODO: 接入真实更新版本名称接口
    setIsEditing(true);
    await new Promise((r) => setTimeout(r, 300));
    setVersionList((state) =>
      state.map((version) =>
        version._id === item._id ? { ...version, versionName: name } : version
      )
    );
    setEditIndex(undefined);
    setIsEditing(false);
  };

  return (
    <Flex flex={'1 0 0'} px={5} flexDirection={'column'} overflow={'auto'}>
      {versionList.map((item, index) => (
        <Flex
          key={item._id}
          alignItems={'center'}
          py={editIndex !== index ? 2 : 1}
          px={3}
          borderRadius={'md'}
          cursor={'pointer'}
          fontWeight={500}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(undefined)}
          _hover={{ bg: 'primary.50' }}
          onClick={() => editIndex === undefined && onChangeVersion(item)}
        >
          <MyPopover
            trigger="hover"
            placement={'bottom-end'}
            w={'208px'}
            h={'72px'}
            Trigger={
              <Box>
                <Avatar
                  src={item.sourceMember.avatar ?? ''}
                  borderRadius={'50%'}
                  w={'24px'}
                  h={'24px'}
                />
              </Box>
            }
          >
            {() => (
              <Flex alignItems={'center'} h={'full'} pl={5} gap={2}>
                <Box>
                  <Avatar
                    src={item.sourceMember.avatar ?? ''}
                    borderRadius={'50%'}
                    w={'36px'}
                    h={'36px'}
                  />
                </Box>
                <Box>
                  <Flex gap={1} fontSize={'sm'} color={'myGray.900'}>
                    <Box>{item.sourceMember.name}</Box>
                    {item.sourceMember.status === 'leave' && (
                      <Tag color="gray">{t('common:user_leaved')}</Tag>
                    )}
                  </Flex>
                  <Box fontSize={'xs'} mt={2} color={'myGray.500'}>
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
                    {t(item.versionName) || formatTime2YMDHMS(item.time)}
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
                    onUpdateVersion(item, (e.target as HTMLInputElement).value);
                  }
                }}
              />
            </MyBox>
          )}
        </Flex>
      ))}
    </Flex>
  );
};
