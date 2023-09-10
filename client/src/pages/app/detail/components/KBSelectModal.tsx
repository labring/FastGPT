import React, { useMemo, useState } from 'react';
import {
  Card,
  Flex,
  Box,
  Button,
  ModalBody,
  ModalHeader,
  ModalFooter,
  useTheme,
  Textarea,
  Grid,
  Divider
} from '@chakra-ui/react';
import { getKbPaths } from '@/api/plugins/kb';
import Avatar from '@/components/Avatar';
import { useForm } from 'react-hook-form';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { SelectedKbType } from '@/types/plugin';
import { useGlobalStore } from '@/store/global';
import { useToast } from '@/hooks/useToast';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import MyIcon from '@/components/Icon';
import { KbTypeEnum } from '@/constants/kb';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useDatasetStore } from '@/store/dataset';

export type KbParamsType = {
  searchSimilarity: number;
  searchLimit: number;
  searchEmptyText: string;
};

export const KBSelectModal = ({
  activeKbs = [],
  onChange,
  onClose
}: {
  activeKbs: SelectedKbType;
  onChange: (e: SelectedKbType) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [selectedKbList, setSelectedKbList] = useState<SelectedKbType>(activeKbs);
  const { isPc } = useGlobalStore();
  const { toast } = useToast();
  const [parentId, setParentId] = useState<string>();
  const { myKbList, loadKbList, datasets, loadAllDatasets } = useDatasetStore();

  const { data } = useQuery(['loadKbList', parentId], () => {
    return Promise.all([loadKbList(parentId), getKbPaths(parentId)]);
  });
  useQuery(['loadAllDatasets'], loadAllDatasets);
  const paths = useMemo(
    () => [
      {
        parentId: '',
        parentName: t('kb.My Dataset')
      },
      ...(data?.[1] || [])
    ],
    [data, t]
  );
  const filterKbList = useMemo(() => {
    return {
      selected: datasets.filter((item) => selectedKbList.find((kb) => kb.kbId === item._id)),
      unSelected: myKbList.filter((item) => !selectedKbList.find((kb) => kb.kbId === item._id))
    };
  }, [myKbList, datasets, selectedKbList]);

  return (
    <MyModal
      isOpen={true}
      isCentered={!isPc}
      maxW={['90vw', '800px']}
      w={'800px'}
      onClose={onClose}
    >
      <Flex flexDirection={'column'} h={['90vh', 'auto']}>
        <ModalHeader>
          {!!parentId ? (
            <Flex flex={1}>
              {paths.map((item, i) => (
                <Flex key={item.parentId} mr={2} alignItems={'center'}>
                  <Box
                    fontSize={'lg'}
                    borderRadius={'md'}
                    {...(i === paths.length - 1
                      ? {
                          cursor: 'default'
                        }
                      : {
                          cursor: 'pointer',
                          _hover: {
                            color: 'myBlue.600'
                          },
                          onClick: () => {
                            setParentId(item.parentId);
                          }
                        })}
                  >
                    {item.parentName}
                  </Box>
                  {i !== paths.length - 1 && (
                    <MyIcon name={'rightArrowLight'} color={'myGray.500'} />
                  )}
                </Flex>
              ))}
            </Flex>
          ) : (
            <Box>关联的知识库({selectedKbList.length})</Box>
          )}
          {isPc && (
            <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'normal'}>
              仅能选择同一个索引模型的知识库
            </Box>
          )}
        </ModalHeader>

        <ModalBody
          flex={['1 0 0', '0 0 auto']}
          maxH={'80vh'}
          overflowY={'auto'}
          display={'grid'}
          userSelect={'none'}
        >
          <Grid
            h={'auto'}
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
            gridGap={3}
          >
            {filterKbList.selected.map((item) =>
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
                      <Box flex={'1 0 0'} mx={3}>
                        {item.name}
                      </Box>
                      <MyIcon
                        name={'delete'}
                        w={'14px'}
                        cursor={'pointer'}
                        _hover={{ color: 'red.500' }}
                        onClick={() => {
                          setSelectedKbList((state) => state.filter((kb) => kb.kbId !== item._id));
                        }}
                      />
                    </Flex>
                  </Card>
                );
              })()
            )}
          </Grid>

          {filterKbList.selected.length > 0 && <Divider my={3} />}

          <Grid
            gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
            gridGap={3}
          >
            {filterKbList.unSelected.map((item) =>
              (() => {
                return (
                  <MyTooltip
                    key={item._id}
                    label={
                      item.type === KbTypeEnum.dataset
                        ? t('kb.Select Dataset')
                        : t('kb.Select Folder')
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
                        if (item.type === KbTypeEnum.folder) {
                          setParentId(item._id);
                        } else if (item.type === KbTypeEnum.dataset) {
                          const vectorModel = selectedKbList[0]?.vectorModel?.model;

                          if (vectorModel && vectorModel !== item.vectorModel.model) {
                            return toast({
                              status: 'warning',
                              title: '仅能选择同一个索引模型的知识库'
                            });
                          }
                          setSelectedKbList((state) => [
                            ...state,
                            { kbId: item._id, vectorModel: item.vectorModel }
                          ]);
                        }
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar src={item.avatar} w={['24px', '28px']}></Avatar>
                        <Box
                          className="textEllipsis"
                          ml={3}
                          fontWeight={'bold'}
                          fontSize={['md', 'lg', 'xl']}
                        >
                          {item.name}
                        </Box>
                      </Flex>
                      <Flex justifyContent={'flex-end'} alignItems={'center'} fontSize={'sm'}>
                        {item.type === KbTypeEnum.folder ? (
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
          {filterKbList.unSelected.length === 0 && (
            <Flex mt={5} flexDirection={'column'} alignItems={'center'}>
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
              <Box mt={2} color={'myGray.500'}>
                这个目录已经没东西可选了~
              </Box>
            </Flex>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            onClick={() => {
              // filter out the kb that is not in the kList
              const filterKbList = selectedKbList.filter((kb) => {
                return datasets.find((item) => item._id === kb.kbId);
              });

              onClose();
              onChange(filterKbList);
            }}
          >
            完成
          </Button>
        </ModalFooter>
      </Flex>
    </MyModal>
  );
};

export const KbParamsModal = ({
  searchEmptyText,
  searchLimit,
  searchSimilarity,
  onClose,
  onChange
}: KbParamsType & { onClose: () => void; onChange: (e: KbParamsType) => void }) => {
  const [refresh, setRefresh] = useState(false);
  const { register, setValue, getValues, handleSubmit } = useForm<KbParamsType>({
    defaultValues: {
      searchEmptyText,
      searchLimit,
      searchSimilarity
    }
  });

  return (
    <MyModal isOpen={true} onClose={onClose} title={'搜索参数调整'} minW={['90vw', '600px']}>
      <Flex flexDirection={'column'}>
        <ModalBody>
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
              value={getValues('searchSimilarity')}
              onChange={(val) => {
                setValue('searchSimilarity', val);
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
                value={getValues('searchLimit')}
                onChange={(val) => {
                  setValue('searchLimit', val);
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
                placeholder={
                  '若填写该内容，没有搜索到对应内容时，将直接回复填写的内容。\n为了连贯上下文，FastGPT 会取部分上一个聊天的搜索记录作为补充，因此在连续对话时，该功能可能会失效。'
                }
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

export default KBSelectModal;
