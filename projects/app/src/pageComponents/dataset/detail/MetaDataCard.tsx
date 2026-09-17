import React, { useMemo } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getDatasetCollectionById,
  getCollectionCollaboratorList,
  postUpdateCollectionCollaborators
} from '@/web/core/dataset/api/collection';
import { useRouter } from 'next/router';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import {
  DatasetCollectionDataProcessModeMap,
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeMap,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CollaboratorContextProvider from '@/components/support/permission/MemberManager/context';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { CollectionRoleList } from '@fastgpt/global/support/permission/collection/constant';

// 后端返回的 file.filename/name 已是解码后的纯文件名，但仍可能包含字面 %（如 `¥%……`）。
// 直接 decodeURIComponent 会抛 URIError；这里安全解码，兼容历史百分号编码数据且不崩溃。
const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const MetaDataCard = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { collectionId = '' } = router.query as {
    collectionId: string;
    datasetId: string;
  };

  const readSource = getCollectionSourceAndOpen({
    collectionId
  });
  const {
    data: collection,
    loading: isLoading,
    runAsync: refetchCollection
  } = useRequest(() => getDatasetCollectionById(collectionId), {
    onError: () => {
      router.replace({
        query: {
          datasetId
        }
      });
    },
    manual: false
  });

  const metadataList = useMemo<{ label?: string; value?: any }[]>(() => {
    if (!collection) return [];

    const webSelector = collection?.metadata?.webPageSelector;
    const trainingType = collection.trainingType ?? DatasetCollectionDataProcessModeEnum.chunk;
    const trainingTypeConfig = DatasetCollectionDataProcessModeMap[trainingType];

    return [
      {
        label: t('common:core.dataset.collection.id'),
        value: collection?._id
      },
      {
        label: t('common:core.dataset.collection.metadata.source'),
        value: t(DatasetCollectionTypeMap[collection.type]?.name as any)
      },
      {
        label: t('dataset:collection_name'),
        value: safeDecodeURIComponent(
          collection.file?.filename || collection?.rawLink || collection?.name
        )
      },
      ...(collection.file
        ? [
            {
              label: t('common:core.dataset.collection.metadata.source size'),
              value: formatFileSize(collection.file.contentLength || 0)
            }
          ]
        : []),
      {
        label: t('common:core.dataset.collection.metadata.Createtime'),
        value: formatTime2YMDHM(collection.createTime)
      },
      {
        label: t('common:core.dataset.collection.metadata.Updatetime'),
        value: formatTime2YMDHM(collection.updateTime)
      },
      ...(collection.customPdfParse !== undefined
        ? [
            {
              label: t('dataset:collection_metadata_custom_pdf_parse'),
              value: collection.customPdfParse ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.rawTextLength !== undefined
        ? [
            {
              label: t('common:core.dataset.collection.metadata.Raw text length'),
              value: collection.rawTextLength
            }
          ]
        : []),
      ...(collection.trainingType && DatasetCollectionDataProcessModeMap[collection.trainingType]
        ? [
            {
              label: t('dataset:collection.training_type'),
              value: t(trainingTypeConfig.label as any)
            }
          ]
        : []),
      ...(collection.indexPrefixTitle !== undefined
        ? [
            {
              label: t('dataset:index_prefix_title'),
              value: collection.indexPrefixTitle ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.imageIndex !== undefined
        ? [
            {
              label: t('dataset:data_index_image'),
              value: collection.imageIndex ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.autoIndexes !== undefined
        ? [
            {
              label: t('dataset:auto_indexes'),
              value: collection.autoIndexes ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.chunkSize !== undefined
        ? [
            {
              label: t('dataset:chunk_size'),
              value: collection.chunkSize
            }
          ]
        : []),
      ...(collection.indexSize !== undefined
        ? [
            {
              label: t('dataset:index_size'),
              value: collection.indexSize
            }
          ]
        : []),
      ...(webSelector !== undefined
        ? [
            {
              label: t('common:core.dataset.collection.metadata.Web page selector'),
              value: webSelector
            }
          ]
        : []),
      ...(collection.tags
        ? [
            {
              label: t('dataset:collection_tags'),
              value: collection.tags?.join(', ') || '-'
            }
          ]
        : [])
    ];
  }, [collection, t]);

  return (
    <MyBox isLoading={isLoading} w={'100%'} h={'100%'} p={6} overflow={'auto'}>
      {/* “查看原始内容”置顶，不随元数据折叠隐藏 */}
      {collection?.sourceId && (
        <Button variant={'whitePrimary'} onClick={readSource} mb={6}>
          <Flex py={2} px={3}>
            <MyIcon name="visible" w={'1rem'} mr={'0.38rem'} />
            <Box>{t('common:core.dataset.collection.metadata.read source')}</Box>
          </Flex>
        </Button>
      )}

      {/* 元数据整体折叠，默认收起 */}
      <Accordion allowToggle defaultIndex={-1}>
        <AccordionItem borderTop={'none'} borderBottom={'none'}>
          <AccordionButton
            p={0}
            mb={4}
            justifyContent={'space-between'}
            bg={'transparent'}
            border={'none'}
            boxShadow={'none'}
            _hover={{ bg: 'transparent' }}
            _expanded={{ bg: 'transparent' }}
          >
            <Box fontSize={'md'} fontWeight={'bold'} color={'myGray.900'}>
              {t('common:core.dataset.collection.metadata.metadata')}
            </Box>
            <AccordionIcon w={'1.25rem'} h={'1.25rem'} color={'myGray.500'} />
          </AccordionButton>

          <AccordionPanel p={0}>
            {metadataList.map(
              (item, i) =>
                item.label &&
                item.value && (
                  <Box key={i} mb={3} wordBreak={'break-all'}>
                    <Box color={'myGray.500'} fontSize={'xs'}>
                      {item.label}
                    </Box>
                    <Box color={'myGray.900'} fontSize={'sm'}>
                      {item.value}
                    </Box>
                  </Box>
                )
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {/* 文件级权限关闭态不存在 collection 快照，避免对无 ACL 的集合发起协作者查询 */}
      {!!collection?._id && collection.dataset.collectionPermissionEnabled === true && (
        <Box mt={6}>
          <CollaboratorContextProvider
            permission={collection.permission}
            defaultRole={ReadRoleVal}
            roleList={CollectionRoleList}
            isInheritPermission={collection.inheritPermission !== false}
            hasParent
            refetchResource={refetchCollection}
            refreshDeps={[collection._id, collection.inheritPermission]}
            onGetCollaboratorList={() => getCollectionCollaboratorList(collection._id)}
            onUpdateCollaborators={(props) =>
              postUpdateCollectionCollaborators({
                ...props,
                collectionId: collection._id
              })
            }
          >
            {({ MemberListCard, onOpenManageModal }) => (
              <>
                <Flex alignItems="center" justifyContent="space-between">
                  <Box fontSize={'sm'} color={'myGray.500'}>
                    {t('common:permission.Collaborator')}
                  </Box>
                  {collection.permission.hasManagePer && (
                    <MyTooltip label={t('common:permission.Manage')}>
                      <MyIcon
                        w="1rem"
                        name="common/settingLight"
                        cursor={'pointer'}
                        _hover={{ color: 'primary.600' }}
                        onClick={onOpenManageModal}
                      />
                    </MyTooltip>
                  )}
                </Flex>
                <MemberListCard mt={2} p={1.5} bg={'myGray.100'} borderRadius={'md'} />
              </>
            )}
          </CollaboratorContextProvider>
        </Box>
      )}
    </MyBox>
  );
};

export default React.memo(MetaDataCard);
