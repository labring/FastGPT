import React, { useMemo, useState } from 'react';
import {
  Card,
  Flex,
  Box,
  Button,
  ModalBody,
  ModalFooter,
  useTheme,
  Textarea,
  Grid,
  Divider,
  Switch,
  Image
} from '@chakra-ui/react';
import Avatar from '@/components/Avatar';
import { useForm } from 'react-hook-form';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { SelectedDatasetType } from '@fastgpt/global/core/module/api.d';
import { useToast } from '@/web/common/hooks/useToast';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import MyIcon from '@/components/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { useTranslation } from 'next-i18next';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { feConfigs } from '@/web/common/system/staticData';
import DatasetSelectContainer, { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import { useLoading } from '@/web/common/hooks/useLoading';
import EmptyTip from '@/components/EmptyTip';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';

type DatasetParamsProps = AppSimpleEditFormType['dataset'];

export const DatasetSelectModal = ({
  isOpen,
  defaultSelectedDatasets = [],
  onChange,
  onClose
}: {
  isOpen: boolean;
  defaultSelectedDatasets: SelectedDatasetType;
  onChange: (e: SelectedDatasetType) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { allDatasets } = useDatasetStore();
  const [selectedDatasets, setSelectedDatasets] = useState<SelectedDatasetType>(
    defaultSelectedDatasets.filter((dataset) => {
      return allDatasets.find((item) => item._id === dataset.datasetId);
    })
  );
  const { toast } = useToast();
  const { paths, setParentId, datasets, isFetching } = useDatasetSelect();
  const { Loading } = useLoading();

  const filterDatasets = useMemo(() => {
    return {
      selected: allDatasets.filter((item) =>
        selectedDatasets.find((dataset) => dataset.datasetId === item._id)
      ),
      unSelected: datasets.filter(
        (item) => !selectedDatasets.find((dataset) => dataset.datasetId === item._id)
      )
    };
  }, [datasets, allDatasets, selectedDatasets]);

  return (
    <DatasetSelectContainer
      isOpen={isOpen}
      paths={paths}
      setParentId={setParentId}
      tips={t('dataset.Select Dataset Tips')}
      onClose={onClose}
    >
      <Flex h={'100%'} flexDirection={'column'} flex={'1 0 0'}>
        <ModalBody flex={'1 0 0'} overflowY={'auto'} userSelect={'none'}>
          <Grid
            gridTemplateColumns={[
              'repeat(1, minmax(0, 1fr))',
              'repeat(2, minmax(0, 1fr))',
              'repeat(3, minmax(0, 1fr))'
            ]}
            gridGap={3}
          >
            {filterDatasets.selected.map((item) =>
              (() => {
                return (
                  <Card
                    key={item._id}
                    p={3}
                    border={theme.borders.base}
                    boxShadow={'sm'}
                    bg={'myBlue.300'}
                  >
                    <Flex alignItems={'center'} h={'38px'}>
                      <Avatar src={item.avatar} w={['24px', '28px']}></Avatar>
                      <Box flex={'1 0 0'} w={0} className="textEllipsis" mx={3}>
                        {item.name}
                      </Box>
                      <MyIcon
                        name={'delete'}
                        w={'14px'}
                        cursor={'pointer'}
                        _hover={{ color: 'red.500' }}
                        onClick={() => {
                          setSelectedDatasets((state) =>
                            state.filter((kb) => kb.datasetId !== item._id)
                          );
                        }}
                      />
                    </Flex>
                  </Card>
                );
              })()
            )}
          </Grid>

          {filterDatasets.selected.length > 0 && <Divider my={3} />}

          <Grid
            gridTemplateColumns={[
              'repeat(1, minmax(0, 1fr))',
              'repeat(2, minmax(0, 1fr))',
              'repeat(3, minmax(0, 1fr))'
            ]}
            gridGap={3}
          >
            {filterDatasets.unSelected.map((item) =>
              (() => {
                return (
                  <MyTooltip
                    key={item._id}
                    label={
                      item.type === DatasetTypeEnum.dataset
                        ? t('dataset.Select Dataset')
                        : t('dataset.Select Folder')
                    }
                  >
                    <Card
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
                        } else if (item.type === DatasetTypeEnum.dataset) {
                          const vectorModel = selectedDatasets[0]?.vectorModel?.model;

                          if (vectorModel && vectorModel !== item.vectorModel.model) {
                            return toast({
                              status: 'warning',
                              title: t('dataset.Select Dataset Tips')
                            });
                          }
                          setSelectedDatasets((state) => [
                            ...state,
                            { datasetId: item._id, vectorModel: item.vectorModel }
                          ]);
                        }
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar src={item.avatar} w={['24px', '28px']}></Avatar>
                        <Box
                          flex={'1 0 0'}
                          w={0}
                          className="textEllipsis"
                          ml={3}
                          fontWeight={'bold'}
                          fontSize={['md', 'lg', 'xl']}
                        >
                          {item.name}
                        </Box>
                      </Flex>
                      <Flex justifyContent={'flex-end'} alignItems={'center'} fontSize={'sm'}>
                        {item.type === DatasetTypeEnum.folder ? (
                          <Box color={'myGray.500'}>{t('Folder')}</Box>
                        ) : (
                          <>
                            <MyIcon mr={1} name="kbTest" w={'12px'} />
                            <Box color={'myGray.500'}>{item.vectorModel.name}</Box>
                          </>
                        )}
                      </Flex>
                    </Card>
                  </MyTooltip>
                );
              })()
            )}
          </Grid>
          {filterDatasets.unSelected.length === 0 && <EmptyTip text={t('common.folder.empty')} />}
        </ModalBody>

        <ModalFooter>
          <Button
            onClick={() => {
              // filter out the dataset that is not in the kList
              const filterDatasets = selectedDatasets.filter((dataset) => {
                return allDatasets.find((item) => item._id === dataset.datasetId);
              });

              onClose();
              onChange(filterDatasets);
            }}
          >
            {t('common.Done')}
          </Button>
        </ModalFooter>

        <Loading fixed={false} loading={isFetching} />
      </Flex>
    </DatasetSelectContainer>
  );
};

export const DatasetParamsModal = ({
  searchEmptyText,
  limit,
  similarity,
  rerank,
  onClose,
  onChange
}: DatasetParamsProps & { onClose: () => void; onChange: (e: DatasetParamsProps) => void }) => {
  const [refresh, setRefresh] = useState(false);
  const { register, setValue, getValues, handleSubmit } = useForm<DatasetParamsProps>({
    defaultValues: {
      searchEmptyText,
      limit,
      similarity,
      rerank
    }
  });

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={'搜索参数调整'}
      minW={['90vw', '600px']}
    >
      <Flex flexDirection={'column'}>
        <ModalBody>
          {feConfigs?.isPlus && (
            <Box display={['block', 'flex']} py={5} pt={[0, 5]}>
              <Box flex={'0 0 100px'} mb={[8, 0]}>
                结果重排
                <MyTooltip label={'将召回的结果进行进一步重排，可增加召回率'} forceShow>
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Box>
              <Switch
                size={'lg'}
                isChecked={getValues(ModuleInputKeyEnum.datasetStartReRank)}
                onChange={(e) => {
                  setValue(ModuleInputKeyEnum.datasetStartReRank, e.target.checked);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          )}
          <Box display={['block', 'flex']} py={5} pt={[0, 5]}>
            <Box flex={'0 0 100px'} mb={[8, 0]}>
              相似度
              <MyTooltip
                label={'不同索引模型的相似度有区别，请通过搜索测试来选择合适的数值'}
                forceShow
              >
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Box>
            <MySlider
              markList={[
                { label: '0', value: 0 },
                { label: '1', value: 1 }
              ]}
              min={0}
              max={1}
              step={0.01}
              value={getValues(ModuleInputKeyEnum.datasetSimilarity)}
              onChange={(val) => {
                setValue(ModuleInputKeyEnum.datasetSimilarity, val);
                setRefresh(!refresh);
              }}
            />
          </Box>
          <Box display={['block', 'flex']} py={8}>
            <Box flex={'0 0 100px'} mb={[8, 0]}>
              单次搜索数量
            </Box>
            <Box flex={1}>
              <MySlider
                markList={[
                  { label: '1', value: 1 },
                  { label: '20', value: 20 }
                ]}
                min={1}
                max={20}
                value={getValues(ModuleInputKeyEnum.datasetLimit)}
                onChange={(val) => {
                  setValue(ModuleInputKeyEnum.datasetLimit, val);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Box>
          <Box display={['block', 'flex']} pt={3}>
            <Box flex={'0 0 100px'} mb={[2, 0]}>
              空搜索回复
            </Box>
            <Box flex={1}>
              <Textarea
                rows={5}
                maxLength={500}
                placeholder={`若填写该内容，没有搜索到对应内容时，将直接回复填写的内容。\n为了连贯上下文，${feConfigs?.systemTitle} 会取部分上一个聊天的搜索记录作为补充，因此在连续对话时，该功能可能会失效。`}
                {...register('searchEmptyText')}
              ></Textarea>
            </Box>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant={'base'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => {
              onClose();
              handleSubmit(onChange)();
            }}
          >
            完成
          </Button>
        </ModalFooter>
      </Flex>
    </MyModal>
  );
};

export default DatasetSelectModal;
