import React, { useMemo, useState } from 'react';
import { ModalBody, useTheme, ModalFooter, Button, Box, Card, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import DatasetSelectModal, { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import dynamic from 'next/dynamic';
import { AdminFbkType } from '@fastgpt/global/core/chat/type.d';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { getDefaultIndex } from '@fastgpt/global/core/dataset/utils';

const InputDataModal = dynamic(() => import('@/pages/dataset/detail/components/InputDataModal'));

export type AdminMarkType = {
  dataId?: string;
  datasetId?: string;
  collectionId?: string;
  q: string;
  a?: string;
};

const SelectMarkCollection = ({
  adminMarkData,
  setAdminMarkData,
  onSuccess,
  onClose
}: {
  adminMarkData: AdminMarkType;
  setAdminMarkData: (e: AdminMarkType) => void;
  onClose: () => void;
  onSuccess: (adminFeedback: AdminFbkType) => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>();
  const [selectedDatasetCollectionIds, setSelectedDatasetCollectionIds] = useState<string[]>([]);
  const { paths, setParentId, datasets, isFetching } = useDatasetSelect();

  return (
    <>
      {/* select dataset */}
      {!adminMarkData.datasetId && (
        <DatasetSelectModal
          isOpen
          paths={paths}
          onClose={onClose}
          setParentId={setParentId}
          tips={t('core.chat.Select Mark Kb Desc')}
        >
          <ModalBody flex={'1 0 0'} overflowY={'auto'}>
            <Grid
              gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
              gridGap={3}
              userSelect={'none'}
            >
              {datasets.map((item) =>
                (() => {
                  const selected = selectedDatasetId === item._id;
                  return (
                    <Card
                      key={item._id}
                      p={3}
                      border={theme.borders.base}
                      boxShadow={'sm'}
                      h={'80px'}
                      cursor={'pointer'}
                      _hover={{
                        boxShadow: 'md'
                      }}
                      {...(selected
                        ? {
                            bg: 'primary.200'
                          }
                        : {})}
                      onClick={() => {
                        if (item.type === DatasetTypeEnum.folder) {
                          setParentId(item._id);
                        } else {
                          setSelectedDatasetId(item._id);
                        }
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar src={item.avatar} w={['24px', '28px', '32px']}></Avatar>
                        <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg', 'xl']}>
                          {item.name}
                        </Box>
                      </Flex>
                      <Flex justifyContent={'flex-end'} alignItems={'center'} fontSize={'sm'}>
                        <MyIcon mr={1} name="kbTest" w={'12px'} />
                        <Box color={'myGray.500'}>{item.vectorModel.name}</Box>
                      </Flex>
                    </Card>
                  );
                })()
              )}
            </Grid>
            {datasets.length === 0 && (
              <Flex mt={'10vh'} flexDirection={'column'} alignItems={'center'}>
                <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
                <Box mt={2} color={'myGray.500'}>
                  这个目录已经没东西可选了~
                </Box>
              </Flex>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              isLoading={isFetching}
              isDisabled={!selectedDatasetId}
              onClick={() => {
                setAdminMarkData({ ...adminMarkData, datasetId: selectedDatasetId });
              }}
            >
              {t('common.Next Step')}
            </Button>
          </ModalFooter>
        </DatasetSelectModal>
      )}

      {/* select collection */}
      {adminMarkData.datasetId && !adminMarkData.collectionId && (
        <SelectCollections
          datasetId={adminMarkData.datasetId}
          type={'collection'}
          title={t('dataset.collections.Select One Collection To Store')}
          onClose={onClose}
          onChange={({ collectionIds }) => {
            setSelectedDatasetCollectionIds(collectionIds);
          }}
          CustomFooter={
            <ModalFooter>
              <Button
                variant={'whiteBase'}
                mr={2}
                onClick={() => {
                  setAdminMarkData({
                    ...adminMarkData,
                    datasetId: undefined
                  });
                }}
              >
                {t('common.Last Step')}
              </Button>
              <Button
                isDisabled={selectedDatasetCollectionIds.length === 0}
                onClick={() => {
                  setAdminMarkData({
                    ...adminMarkData,
                    collectionId: selectedDatasetCollectionIds[0]
                  });
                }}
              >
                {t('common.Next Step')}
              </Button>
            </ModalFooter>
          }
        />
      )}

      {/* input data */}
      {adminMarkData.datasetId && adminMarkData.collectionId && (
        <InputDataModal
          onClose={onClose}
          collectionId={adminMarkData.collectionId}
          dataId={adminMarkData.dataId}
          defaultValue={{
            q: adminMarkData.q,
            a: adminMarkData.a
          }}
          onSuccess={(data) => {
            if (
              !data.q ||
              !adminMarkData.datasetId ||
              !adminMarkData.collectionId ||
              !data.dataId
            ) {
              return onClose();
            }

            onSuccess({
              dataId: data.dataId,
              datasetId: adminMarkData.datasetId,
              collectionId: adminMarkData.collectionId,
              q: data.q,
              a: data.a
            });
            onClose();
          }}
        />
      )}
    </>
  );
};

export default React.memo(SelectMarkCollection);
