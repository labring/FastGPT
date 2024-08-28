import React, { useState } from 'react';
import { ModalBody, useTheme, ModalFooter, Button, Box, Card, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import DatasetSelectModal, { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import dynamic from 'next/dynamic';
import { AdminFbkType } from '@fastgpt/global/core/chat/type.d';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

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
          isLoading={isFetching}
          tips={t('common:core.chat.Select dataset Desc')}
        >
          <ModalBody flex={'1 0 0'} overflowY={'auto'}>
            <Grid
              display={'grid'}
              gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
              gridGap={3}
              userSelect={'none'}
            >
              {datasets.map((item) =>
                (() => {
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
                      onClick={() => {
                        if (item.type === DatasetTypeEnum.folder) {
                          setParentId(item._id);
                        } else {
                          setAdminMarkData({ ...adminMarkData, datasetId: item._id });
                        }
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar src={item.avatar} w={['24px', '28px', '32px']}></Avatar>
                        <Box ml={3} fontWeight={'bold'} fontSize={['md', 'lg']}>
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
            {datasets.length === 0 && <EmptyTip text={t('chat:empty_directory')}></EmptyTip>}
          </ModalBody>
        </DatasetSelectModal>
      )}

      {/* select collection */}
      {adminMarkData.datasetId && (
        <SelectCollections
          datasetId={adminMarkData.datasetId}
          type={'collection'}
          title={t('common:dataset.collections.Select One Collection To Store')}
          onClose={onClose}
          onChange={({ collectionIds }) => {
            setAdminMarkData({
              ...adminMarkData,
              collectionId: collectionIds[0]
            });
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
                {t('common:common.Last Step')}
              </Button>
            </ModalFooter>
          }
        />
      )}

      {/* input data */}
      {adminMarkData.datasetId && adminMarkData.collectionId && (
        <InputDataModal
          onClose={() => {
            setAdminMarkData({
              ...adminMarkData,
              collectionId: undefined
            });
          }}
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
