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
  agenticSearchLLMModelId: string;
  embeddingModelId: string;
  agenticSearchRerankModelId: string;
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
      agenticSearchLLMModelId: defaultValues.agenticSearchLLMModelId || defaultModels.llm?.id || '',
      embeddingModelId: defaultValues.embeddingModelId || '',
      agenticSearchRerankModelId:
        defaultValues.agenticSearchRerankModelId || defaultModels.rerank?.id || '',
      agenticSearchReasoning: defaultValues.agenticSearchReasoning ?? true
    }
  });

  const agenticSearchLLMModelId = watch('agenticSearchLLMModelId');
  const embeddingModelId = watch('embeddingModelId');
  const agenticSearchRerankModelId = watch('agenticSearchRerankModelId');
  const agenticSearchReasoning = watch('agenticSearchReasoning');

  const embeddingModelSelectList = useMemo(
    () => getEmbeddingModelSelectList(embeddingModelList, datasetVectorModel),
    [embeddingModelList, datasetVectorModel]
  );

  useEffect(() => {
    if (!datasetVectorModel) {
      setValue('embeddingModelId', '');
      return;
    }
    if (embeddingModelSelectList.length === 0) return;

    const current = getValues('embeddingModelId');
    // 当前值为空，联动设置为知识库向量模型
    if (!current) {
      setValue('embeddingModelId', datasetVectorModel);
      return;
    }
    // 当前值有值时，校验是否在有效选项中；若无效则回退为当前知识库向量模型
    const validIds = new Set(embeddingModelSelectList.map((m) => m.value));
    if (!validIds.has(current)) {
      setValue('embeddingModelId', datasetVectorModel);
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
                value={agenticSearchLLMModelId}
                list={llmModelList.map((item) => ({
                  value: item.id,
                  label: item.name
                }))}
                onChange={(val: string) => setValue('agenticSearchLLMModelId', val)}
              />
            </Box>
          </HStack>
        )}

        <HStack mt={hideAiModel ? 0 : 4} justifyContent={'space-between'}>
          <FormLabel>
            {t('common:core.ai.model.Vector Model')}
            <QuestionTip ml={0.5} label={t('app:smart_customer_service_embedding_model_tip')} />
          </FormLabel>
          <Box flex={'0 0 340px'}>
            <SelectAiModel
              width="100%"
              value={embeddingModelId}
              list={embeddingModelSelectList}
              placeholder={
                !datasetVectorModel
                  ? t('app:smart_customer_service_embedding_model_placeholder')
                  : undefined
              }
              onChange={(val: string) => setValue('embeddingModelId', val)}
            />
          </Box>
        </HStack>

        <HStack mt={4} justifyContent={'space-between'}>
          <FormLabel>{t('app:smart_customer_service_rerank_model')}</FormLabel>
          <Box flex={'0 0 340px'}>
            <SelectAiModel
              width="100%"
              value={agenticSearchRerankModelId}
              list={reRankModelList.map((item) => ({
                value: item.id,
                label: item.name
              }))}
              onChange={(val: string) => setValue('agenticSearchRerankModelId', val)}
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
