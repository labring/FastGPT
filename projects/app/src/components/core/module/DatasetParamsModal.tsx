import React, { useMemo, useState } from 'react';
import { Box, Button, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';
import { useTranslation } from 'next-i18next';
import { reRankModelList } from '@/web/common/system/staticData';

import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constant';
import MyRadio from '@/components/common/MyRadio';

type DatasetParamsProps = {
  similarity?: number;
  limit?: number;
  searchMode: `${DatasetSearchModeEnum}`;
  searchEmptyText?: string;
  maxTokens?: number;
};

const DatasetParamsModal = ({
  searchEmptyText,
  limit,
  similarity,
  searchMode = DatasetSearchModeEnum.embedding,
  maxTokens = 3000,
  onClose,
  onSuccess
}: DatasetParamsProps & { onClose: () => void; onSuccess: (e: DatasetParamsProps) => void }) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { register, setValue, getValues, handleSubmit } = useForm<DatasetParamsProps>({
    defaultValues: {
      searchEmptyText,
      limit,
      similarity,
      searchMode
    }
  });

  const searchModeList = useMemo(() => {
    const list = Object.values(DatasetSearchModeMap);
    if (reRankModelList.length > 0) {
      return list;
    }
    return list.slice(0, 1);
  }, []);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('core.dataset.search.Dataset Search Params')}
      w={['90vw', '550px']}
      h={['90vh', 'auto']}
      overflow={'unset'}
      isCentered={searchEmptyText !== undefined}
    >
      <ModalBody flex={['1 0 0', 'auto']} overflow={'auto'}>
        <MyRadio
          gridGap={2}
          gridTemplateColumns={'repeat(1,1fr)'}
          list={searchModeList}
          value={getValues('searchMode')}
          onChange={(e) => {
            setValue('searchMode', e as `${DatasetSearchModeEnum}`);
            setRefresh(!refresh);
          }}
        />

        {similarity !== undefined && (
          <Box display={['block', 'flex']} py={8} mt={3}>
            <Box flex={'0 0 100px'} mb={[8, 0]}>
              {t('core.dataset.search.Min Similarity')}
              <MyTooltip label={t('core.dataset.search.Min Similarity Tips')} forceShow>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Box>
            <Box flex={1} mx={4}>
              <MySlider
                markList={[
                  { label: '0', value: 0 },
                  { label: '1', value: 1 }
                ]}
                min={0}
                max={1}
                step={0.01}
                value={getValues(ModuleInputKeyEnum.datasetSimilarity) ?? 0.5}
                onChange={(val) => {
                  setValue(ModuleInputKeyEnum.datasetSimilarity, val);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Box>
        )}
        {limit !== undefined && (
          <Box display={['block', 'flex']} py={8}>
            <Box flex={'0 0 100px'} mb={[8, 0]}>
              {t('core.dataset.search.Max Tokens')}
              <MyTooltip label={t('core.dataset.search.Max Tokens Tips')} forceShow>
                <QuestionOutlineIcon ml={1} />
              </MyTooltip>
            </Box>
            <Box flex={1} mx={4}>
              <MySlider
                markList={[
                  { label: '300', value: 300 },
                  { label: maxTokens, value: maxTokens }
                ]}
                min={300}
                max={maxTokens}
                step={10}
                value={getValues(ModuleInputKeyEnum.datasetLimit) ?? 1000}
                onChange={(val) => {
                  setValue(ModuleInputKeyEnum.datasetLimit, val);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Box>
        )}
        {searchEmptyText !== undefined && (
          <Box display={['block', 'flex']} pt={3}>
            <Box flex={'0 0 100px'} mb={[2, 0]}>
              {t('core.dataset.search.Empty result response')}
            </Box>
            <Box flex={1}>
              <Textarea
                rows={5}
                maxLength={500}
                placeholder={t('core.dataset.search.Empty result response Tips')}
                {...register('searchEmptyText')}
              ></Textarea>
            </Box>
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          onClick={() => {
            onClose();
            handleSubmit(onSuccess)();
          }}
        >
          {t('common.Done')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default DatasetParamsModal;
