import React, { useState } from 'react';
import {
  Card,
  Flex,
  Box,
  Button,
  ModalBody,
  ModalHeader,
  ModalFooter,
  useTheme,
  Textarea
} from '@chakra-ui/react';
import Avatar from '@/components/Avatar';
import { KbListItemType } from '@/types/plugin';
import { useForm } from 'react-hook-form';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { SelectedKbType } from '@/types/plugin';
import { useGlobalStore } from '@/store/global';
import { useToast } from '@/hooks/useToast';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import MyIcon from '@/components/Icon';

export type KbParamsType = {
  searchSimilarity: number;
  searchLimit: number;
  searchEmptyText: string;
};

export const KBSelectModal = ({
  kbList,
  activeKbs = [],
  onChange,
  onClose
}: {
  kbList: KbListItemType[];
  activeKbs: SelectedKbType;
  onChange: (e: SelectedKbType) => void;
  onClose: () => void;
}) => {
  const theme = useTheme();
  const [selectedKbList, setSelectedKbList] = useState<SelectedKbType>(activeKbs);
  const { isPc } = useGlobalStore();
  const { toast } = useToast();

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
          <Box>关联的知识库({selectedKbList.length})</Box>
          <Box fontSize={'sm'} color={'myGray.500'} fontWeight={'normal'}>
            仅能选择同一个索引模型的知识库
          </Box>
        </ModalHeader>

        <ModalBody
          flex={['1 0 0', '0 0 auto']}
          maxH={'80vh'}
          overflowY={'auto'}
          display={'grid'}
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']}
          gridGap={3}
          userSelect={'none'}
        >
          {kbList.map((item) =>
            (() => {
              const selected = !!selectedKbList.find((kb) => kb.kbId === item._id);
              const active = !!activeKbs.find((kb) => kb.kbId === item._id);
              return (
                <Card
                  key={item._id}
                  p={3}
                  border={theme.borders.base}
                  boxShadow={'sm'}
                  h={'80px'}
                  cursor={'pointer'}
                  order={active ? 0 : 1}
                  _hover={{
                    boxShadow: 'md'
                  }}
                  {...(selected
                    ? {
                        bg: 'myBlue.300'
                      }
                    : {})}
                  onClick={() => {
                    if (selected) {
                      setSelectedKbList((state) => state.filter((kb) => kb.kbId !== item._id));
                    } else {
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
        </ModalBody>

        <ModalFooter>
          <Button
            onClick={() => {
              onClose();
              onChange(selectedKbList);
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
