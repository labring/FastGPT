import React, { useMemo, useState } from 'react';
import { Box, Flex, HStack } from '@chakra-ui/react';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import PermissionIconText from '@/components/support/permission/IconText';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useContextSelector } from 'use-context-selector';
import { DatasetsContext } from '../../../pages/dataset/list/context';
import { useTranslation } from 'next-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import SideTag from './SideTag';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';

type OpenConfirmFn = (params: {
  onConfirm?: Function;
  onCancel?: any;
  customContent?: string | React.ReactNode;
  inputConfirmText?: string;
}) => () => void;

export type DatasetCardProps = {
  dataset: DatasetListItemType & { label?: string; icon?: string };
  parentDataset: DatasetListItemType | undefined;
  getBoxProps: (params: { dataId: string; isFolder: boolean }) => Record<string, any>;
  setEditedDataset: (data?: EditResourceInfoFormType) => void;
  setEditPerDatasetId: (id: string) => void;
  exportDataset: (dataset: { _id: string; name: string }) => Promise<any>;
  openConfirmDel: OpenConfirmFn;
  onDelDataset: (id: string) => Promise<void>;
};

const DatasetCard = React.memo(function DatasetCard({
  dataset,
  parentDataset,
  getBoxProps,
  setEditedDataset,
  setEditPerDatasetId,
  exportDataset,
  openConfirmDel,
  onDelDataset
}: DatasetCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { getModelProvider } = useSystemStore();
  const { setMoveDatasetId, setSearchKey, refetchPaths, loadMyDatasets } = useContextSelector(
    DatasetsContext,
    (v) => v
  );

  const vectorModelAvatar = getModelProvider(dataset.vectorModel?.provider)?.avatar;

  const [isHovered, setIsHovered] = useState(false);

  const menuList = useMemo(
    () => [
      {
        children: [
          {
            icon: 'edit',
            label: t('common:dataset.Edit Info'),
            onClick: () =>
              setEditedDataset({
                id: dataset._id,
                name: dataset.name,
                intro: dataset.intro,
                avatar: dataset.avatar
              })
          },
          ...((parentDataset ? parentDataset : dataset)?.permission.hasManagePer
            ? [
                {
                  icon: 'common/file/move',
                  label: t('common:Move'),
                  onClick: () => {
                    setMoveDatasetId(dataset._id);
                  }
                }
              ]
            : []),
          ...(dataset.permission.hasManagePer
            ? [
                {
                  icon: 'key',
                  label: t('common:permission.Permission'),
                  onClick: () => setEditPerDatasetId(dataset._id)
                }
              ]
            : [])
        ]
      },
      ...(dataset.type !== DatasetTypeEnum.folder && !isDatabaseDataset(dataset.type)
        ? [
            {
              children: [
                {
                  icon: 'export',
                  label: t('common:Export'),
                  onClick: () => {
                    exportDataset(dataset);
                  }
                }
              ]
            }
          ]
        : []),
      ...(dataset.permission.hasManagePer
        ? [
            {
              children: [
                {
                  icon: 'delete',
                  label: t('common:Delete'),
                  type: 'danger' as 'danger',
                  onClick: () =>
                    openConfirmDel({
                      onConfirm: () =>
                        onDelDataset(dataset._id).then(() => {
                          refetchPaths();
                          loadMyDatasets();
                        }),
                      customContent: t('common:core.dataset.Delete Confirm'),
                      inputConfirmText: dataset.name
                    })()
                }
              ]
            }
          ]
        : [])
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, parentDataset]
  );

  const hasMenuPer =
    dataset.type === DatasetTypeEnum.folder
      ? dataset.permission.hasManagePer
      : dataset.permission.hasWritePer;

  return (
    <MyTooltip
      label={
        <Flex flexDirection={'column'} alignItems={'center'}>
          <Box fontSize={'xs'} color={'myGray.500'}>
            {dataset.type === DatasetTypeEnum.folder
              ? t('common:open_folder')
              : t('common:folder.open_dataset')}
          </Box>
        </Flex>
      }
    >
      <MyBox
        display={'flex'}
        flexDirection={'column'}
        lineHeight={1.5}
        h="100%"
        pt={5}
        pb={3}
        px={5}
        cursor={'pointer'}
        borderWidth={1.5}
        border={'base'}
        bg={'white'}
        borderRadius={'8px'}
        position={'relative'}
        minH={'150px'}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        {...getBoxProps({
          dataId: dataset._id,
          isFolder: dataset.type === DatasetTypeEnum.folder
        })}
        _hover={{
          borderColor: 'primary.300',
          '& .time': {
            display: ['flex', 'none']
          }
        }}
        onClick={() => {
          if (dataset.type === DatasetTypeEnum.folder) {
            setSearchKey('');
            router.push({
              pathname: '/dataset/list',
              query: {
                parentId: dataset._id
              }
            });
          } else {
            router.push({
              pathname: '/dataset/detail',
              query: {
                datasetId: dataset._id
              }
            });
          }
        }}
      >
        <Flex w="100%" alignItems={'center'}>
          <Avatar src={dataset.avatar} borderRadius={6} w={'28px'} flexShrink={0} />
          <Box width="0" flex="1" className="textEllipsis" color={'myGray.900'} ml={2}>
            {dataset.name}
          </Box>

          {dataset.type !== DatasetTypeEnum.folder && (
            <Box flexShrink={0} mr={-5}>
              <SideTag
                type={dataset.type}
                py={0.5}
                px={2}
                borderLeftRadius={'sm'}
                borderRightRadius={0}
              />
            </Box>
          )}
        </Flex>

        <Box
          flex={'1 0 72px'}
          py={3}
          textAlign={'justify'}
          wordBreak={'break-all'}
          fontSize={'xs'}
          color={'myGray.500'}
        >
          <Box className={'textEllipsis3'} whiteSpace={'pre-wrap'}>
            {dataset.intro ||
              (dataset.type === DatasetTypeEnum.folder
                ? t('common:core.dataset.Folder placeholder')
                : t('common:core.dataset.Intro Placeholder'))}
          </Box>
        </Box>

        <Flex
          h={'24px'}
          alignItems={'center'}
          justifyContent={'space-between'}
          fontSize={'sm'}
          fontWeight={500}
          color={'myGray.500'}
        >
          <HStack spacing={3.5}>
            <UserBox
              sourceMember={dataset.sourceMember}
              fontSize="xs"
              avatarSize="1rem"
              spacing={0.5}
            />
            <PermissionIconText
              flexShrink={0}
              private={dataset.private}
              iconColor="myGray.400"
              color={'myGray.500'}
            />
          </HStack>

          <HStack>
            {isPc &&
              dataset.type !== DatasetTypeEnum.folder &&
              dataset.type !== DatasetTypeEnum.structureDocument && (
                <HStack spacing={1} className="time">
                  <Avatar src={vectorModelAvatar} w={'0.85rem'} />
                  <Box color={'myGray.500'} fontSize={'mini'}>
                    {dataset.vectorModel?.name}
                  </Box>
                </HStack>
              )}
            {hasMenuPer && (isHovered || !isPc) && (
              <Box
                display={'flex'}
                borderRadius={'md'}
                _hover={{
                  '& .icon': {
                    bg: 'myGray.100'
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <MyMenu
                  Button={
                    <Box w={'22px'} h={'22px'}>
                      <MyIcon
                        className="icon"
                        name={'more'}
                        h={'16px'}
                        w={'16px'}
                        px={1}
                        py={1}
                        borderRadius={'md'}
                        cursor={'pointer'}
                      />
                    </Box>
                  }
                  menuList={menuList}
                />
              </Box>
            )}
          </HStack>
        </Flex>
      </MyBox>
    </MyTooltip>
  );
});

export default DatasetCard;
