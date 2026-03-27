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
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';
import {
  getSkillVersionList,
  postSwitchSkillVersion,
  postUpdateSkillVersion
} from '@/web/core/skill/api';
import type { SkillVersionListItemType } from '@fastgpt/global/core/agentSkills/api';

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
  const { skillId } = useContextSelector(SkillDetailContext, (v) => v);

  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);

  const {
    ScrollData,
    data: versionList,
    setData
  } = useScrollPagination(getSkillVersionList, {
    pageSize: 20,
    params: { skillId }
  });

  const firstActiveIndex = versionList.findIndex((item) => item.isActive);

  const onChangeVersion = async (item: SkillVersionListItemType) => {
    await postSwitchSkillVersion({ skillId, versionId: item._id });
    onClose();
  };

  const onUpdateVersion = async (item: SkillVersionListItemType, name: string) => {
    setIsEditing(true);
    try {
      await postUpdateSkillVersion({ skillId, versionId: item._id, versionName: name });
      setData((prev) => prev.map((v) => (v._id === item._id ? { ...v, versionName: name } : v)));
    } finally {
      setEditId(undefined);
      setIsEditing(false);
    }
  };

  return (
    <ScrollData flex={'1 0 0'} px={5}>
      {versionList.map((item, index) => (
        <Flex
          key={item._id}
          alignItems={'center'}
          py={editId !== item._id ? 2 : 1}
          px={3}
          borderRadius={'md'}
          cursor={'pointer'}
          fontWeight={500}
          onMouseEnter={() => setHoveredId(item._id)}
          onMouseLeave={() => setHoveredId(undefined)}
          _hover={{ bg: 'primary.50' }}
          onClick={() => editId === undefined && onChangeVersion(item)}
        >
          <MyPopover
            trigger="hover"
            placement={'bottom-end'}
            w={'208px'}
            h={'72px'}
            Trigger={
              <Box>
                <Avatar src={''} borderRadius={'50%'} w={'24px'} h={'24px'} />
              </Box>
            }
          >
            {() => (
              <Flex alignItems={'center'} h={'full'} pl={5} gap={2}>
                <Box>
                  <Avatar src={''} borderRadius={'50%'} w={'36px'} h={'36px'} />
                </Box>
                <Box>
                  <Box fontSize={'sm'} color={'myGray.900'}>
                    {t('common:version')} {item.version}
                  </Box>
                  <Box fontSize={'xs'} mt={2} color={'myGray.500'}>
                    {formatTime2YMDHMS(new Date(item.createdAt))}
                  </Box>
                </Box>
              </Flex>
            )}
          </MyPopover>

          {editId !== item._id ? (
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
                    {item.versionName || formatTime2YMDHMS(new Date(item.createdAt))}
                  </Box>
                </Box>
                {item.isActive && (
                  <Tag
                    ml={3}
                    flexShrink={0}
                    type="borderSolid"
                    colorSchema={index === firstActiveIndex ? 'green' : 'blue'}
                  >
                    {index === firstActiveIndex
                      ? t('app:app.version_current')
                      : t('app:app.version_past')}
                  </Tag>
                )}
              </Box>
              {hoveredId === item._id && (
                <MyIcon
                  name="edit"
                  w={'18px'}
                  ml={2}
                  _hover={{ color: 'primary.600' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditId(item._id);
                  }}
                />
              )}
            </>
          ) : (
            <MyBox ml={3} isLoading={isEditing} size={'md'}>
              <Input
                autoFocus
                h={8}
                defaultValue={item.versionName || formatTime2YMDHMS(new Date(item.createdAt))}
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
    </ScrollData>
  );
};
