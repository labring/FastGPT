import React, { useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import {
  Box,
  Flex,
  Input,
  Popover,
  PopoverContent,
  PopoverBody,
  IconButton,
  useDisclosure,
  Portal,
  PopoverAnchor,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useContextSelector } from 'use-context-selector';
import VersionPublisherPopover from '@fastgpt/web/components/common/VersionPublisherPopover';
import { SkillDetailContext } from '../context';
import {
  getSkillVersionList,
  postSwitchSkillVersion,
  postUpdateSkillVersion
} from '@/web/core/skill/api';
import type { SkillVersionListItemType } from '@fastgpt/global/core/ai/skill/api';

const SkillHistoriesPopover = ({ publishButton }: { publishButton: React.ReactNode }) => {
  const { t } = useSafeTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Popover
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      placement="bottom-end"
      closeOnBlur={true}
      isLazy
    >
      <PopoverAnchor>
        <HStack spacing={3}>
          <IconButton
            icon={<MyIcon name={'history'} w={'18px'} />}
            aria-label={''}
            size={'sm'}
            w={'34px'}
            h={'34px'}
            variant={'whitePrimary'}
            onClick={isOpen ? onClose : onOpen}
          />
          {publishButton}
        </HStack>
      </PopoverAnchor>
      <Portal>
        <PopoverContent
          w="min(368px, calc(100vw - 32px))"
          minH="368px"
          maxH="min(592px, calc(100vh - 120px))"
          boxShadow="3.5"
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="md"
          bg="white"
          display="flex"
          flexDirection="column"
          _focus={{
            boxShadow: '3.5'
          }}
        >
          <PopoverBody p={0} display="flex" flexDirection="column" flex={1} minH={0}>
            <Box
              px="24px"
              pt="24px"
              pb="16px"
              fontSize="16px"
              fontWeight="500"
              color="black"
              lineHeight="24px"
            >
              {t('skill:history_versions')}
            </Box>
            <HistoryList onClose={onClose} />
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

export default SkillHistoriesPopover;

const HistoryList = ({ onClose }: { onClose: () => void }) => {
  const { t } = useSafeTranslation();
  const { skillId, refreshSkillDetail, restartSandbox } = useContextSelector(
    SkillDetailContext,
    (v) => ({
      skillId: v.skillId,
      refreshSkillDetail: v.refreshSkillDetail,
      restartSandbox: v.restartSandbox
    })
  );

  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);

  const {
    ScrollData,
    data: versionList,
    setData
  } = useScrollPagination(getSkillVersionList, {
    pageSize: 10,
    params: { skillId }
  });

  const onChangeVersion = async (item: SkillVersionListItemType) => {
    if (item.isCurrent) return;
    await postSwitchSkillVersion({ skillId, versionId: item._id });
    refreshSkillDetail();
    restartSandbox();
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
    <ScrollData
      flex={1}
      minH={0}
      px={0}
      pb={0}
      display="flex"
      flexDirection="column"
      sx={{
        '& > *:last-child': {
          mt: 'auto !important',
          pt: 4,
          pb: '24px'
        }
      }}
    >
      <Box px="24px" display="flex" flexDirection="column" gap="8px">
        {versionList.map((item) => (
          <Flex
            key={item._id}
            alignItems={'center'}
            py="8px"
            pl="8px"
            pr="16px"
            borderRadius="xs"
            fontWeight={500}
            onMouseEnter={() => setHoveredId(item._id)}
            onMouseLeave={() => setHoveredId(undefined)}
            _hover={{ bg: 'myGray.05' }}
          >
            <VersionPublisherPopover
              sourceMember={item.sourceMember}
              time={new Date(item.createdAt)}
            />

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
                    <Box as={'span'} color={'myGray.900'} fontWeight="normal" lineHeight="20px">
                      {item.versionName || formatTime2YMDHMS(new Date(item.createdAt))}
                    </Box>
                  </Box>
                  {item.isCurrent && (
                    <Box
                      ml={3}
                      flexShrink={0}
                      border="1px solid"
                      borderColor="myGray.200"
                      bg="white"
                      color="myGray.700"
                      borderRadius="sm"
                      px="8px"
                      h="20px"
                      display="inline-flex"
                      alignItems="center"
                      fontSize="10px"
                      fontWeight="500"
                      lineHeight="14px"
                    >
                      {t('app:app.version_current')}
                    </Box>
                  )}
                </Box>
                {hoveredId === item._id && (
                  <Flex alignItems="center" ml={2} gap={2} onClick={(e) => e.stopPropagation()}>
                    <MyIcon
                      name="edit"
                      w={'16px'}
                      h={'16px'}
                      color="myGray.500"
                      cursor="pointer"
                      _hover={{ color: 'primary.600' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditId(item._id);
                      }}
                    />
                    {!item.isCurrent && (
                      <PopoverConfirm
                        content={t('skill:switch_version_confirm')}
                        type="delete"
                        placement="bottom"
                        modifiers={[
                          {
                            name: 'preventOverflow',
                            options: {
                              padding: { top: 8, bottom: 8, left: 8, right: 16 }
                            }
                          }
                        ]}
                        onConfirm={() => onChangeVersion(item)}
                        Trigger={
                          <Flex alignItems="center" justifyContent="center" w="16px" h="16px">
                            <MyIcon
                              name="common/rollback"
                              w={'16px'}
                              h={'16px'}
                              color="myGray.500"
                              cursor="pointer"
                              _hover={{ color: 'primary.600' }}
                            />
                          </Flex>
                        }
                      />
                    )}
                  </Flex>
                )}
              </>
            ) : (
              <MyBox ml={3} isLoading={isEditing} size={'md'} flex={'1 0 0'}>
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
      </Box>
    </ScrollData>
  );
};
