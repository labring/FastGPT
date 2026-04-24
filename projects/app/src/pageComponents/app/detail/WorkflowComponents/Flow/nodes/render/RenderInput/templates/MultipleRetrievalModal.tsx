import React, { useEffect, useMemo } from 'react';
import { Box, Button, HStack, ModalBody, ModalFooter, Switch } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SelectAiModel from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'next-i18next';
import { getEmbeddingModelSelectList } from '@/web/core/app/utils';

type AgenticSearchParamsType = {
  agenticSearchLLMModel: string;
  embeddingModel: string;
  agenticSearchRerankModel: string;
  agenticSearchReasoning: boolean;
};

type MultipleRetrievalModalProps = {
  defaultValues: AgenticSearchParamsType;
  hideAiModel?: boolean;
  datasetVectorModel?: string;
  onClose: () => void;
  onSuccess: (data: AgenticSearchParamsType) => void;
};

const MultipleRetrievalModal = ({
  defaultValues,
  hideAiModel = false,
  datasetVectorModel,
  onClose,
  onSuccess
}: MultipleRetrievalModalProps) => {
  const { t } = useTranslation();
  const { reRankModelList, llmModelList, embeddingModelList, defaultModels } = useSystemStore();

  const { setValue, handleSubmit, watch, getValues } = useForm<AgenticSearchParamsType>({
    defaultValues: {
      agenticSearchLLMModel: defaultValues.agenticSearchLLMModel || defaultModels.llm?.model || '',
      embeddingModel: defaultValues.embeddingModel || '',
      agenticSearchRerankModel:
        defaultValues.agenticSearchRerankModel || defaultModels.rerank?.model || '',
      agenticSearchReasoning: defaultValues.agenticSearchReasoning ?? true
    }
  });

  const agenticSearchLLMModel = watch('agenticSearchLLMModel');
  const embeddingModel = watch('embeddingModel');
  const agenticSearchRerankModel = watch('agenticSearchRerankModel');
  const agenticSearchReasoning = watch('agenticSearchReasoning');

  const embeddingModelSelectList = useMemo(
    () => getEmbeddingModelSelectList(embeddingModelList, datasetVectorModel),
    [embeddingModelList, datasetVectorModel]
  );

  useEffect(() => {
    if (!datasetVectorModel) {
      setValue('embeddingModel', '');
      return;
    }
    if (embeddingModelSelectList.length === 0) return;

    const current = getValues('embeddingModel');
    // 当前值为空，联动设置为知识库向量模型
    if (!current) {
      setValue('embeddingModel', datasetVectorModel);
      return;
    }
    // 当前值有值时，校验是否在有效选项中；若无效则回退为当前知识库向量模型
    const validIds = new Set(embeddingModelSelectList.map((m) => m.value));
    if (!validIds.has(current)) {
      setValue('embeddingModel', datasetVectorModel);
    }
  }, [datasetVectorModel, embeddingModelSelectList, getValues, setValue]);

  const onSubmit = handleSubmit((data) => {
    onSuccess(data);
    onClose();
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      w={['90vw', '550px']}
      iconSrc="core/workflow/template/datasetSearch"
      title={t('app:retrieval_mode_multiple')}
    >
      <ModalBody>
        {!hideAiModel && (
          <HStack justifyContent={'space-between'}>
            <FormLabel>
              {t('app:smart_customer_service_ai_model')}
              <QuestionTip ml={0.5} label={t('app:retrieval_multiple_ai_model_tip')} />
            </FormLabel>
            <Box flex={'0 0 340px'}>
              <SelectAiModel
                width="100%"
                value={agenticSearchLLMModel}
                list={llmModelList.map((item) => ({
                  value: item.model,
                  label: item.name
                }))}
                onChange={(val: string) => setValue('agenticSearchLLMModel', val)}
              />
            </Box>
          </HStack>
        )}

        <HStack mt={hideAiModel ? 0 : 4} justifyContent={'space-between'}>
          <FormLabel>
            {t('common:core.ai.model.Vector Model')}
            <QuestionTip ml={0.5} label={t('common:core.dataset.embedding model tip')} />
          </FormLabel>
          <Box flex={'0 0 340px'}>
            <SelectAiModel
              width="100%"
              value={embeddingModel}
              list={embeddingModelSelectList}
              onChange={(val: string) => setValue('embeddingModel', val)}
            />
          </Box>
        </HStack>

        <HStack mt={4} justifyContent={'space-between'}>
          <FormLabel>{t('app:smart_customer_service_rerank_model')}</FormLabel>
          <Box flex={'0 0 340px'}>
            <SelectAiModel
              width="100%"
              value={agenticSearchRerankModel}
              list={reRankModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(val: string) => setValue('agenticSearchRerankModel', val)}
            />
          </Box>
        </HStack>

        <HStack mt={4} justifyContent={'space-between'}>
          <FormLabel>
            {t('app:retrieval_output_thinking')}
            <QuestionTip ml={0.5} label={t('app:retrieval_output_thinking_tooltip')} />
          </FormLabel>
          <Switch
            isChecked={agenticSearchReasoning}
            onChange={(e) => setValue('agenticSearchReasoning', e.target.checked)}
          />
        </HStack>
      </ModalBody>

      <ModalFooter>
        <Button variant="whiteBase" mr={3} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button onClick={onSubmit}>{t('common:Confirm')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default MultipleRetrievalModal;
