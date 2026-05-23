import { Button, Box, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { putUpdateDefaultModels } from '@/web/core/ai/config';
import AIModelSelector from '@/components/Select/AIModelSelector';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyModal from '@fastgpt/web/components/common/MyModal';

const labelStyles = {
  fontSize: 'sm',
  color: 'myGray.900',
  mb: 0.5
};

const DefaultModelModal = ({
  onSuccess,
  onClose
}: {
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const {
    defaultModels,
    llmModelList,
    embeddingModelList,
    ttsModelList,
    sttModelList,
    reRankModelList,
    getVlmModelList,
    feConfigs
  } = useSystemStore();
  const vlmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);

  const [defaultData, setDefaultData] = useState(defaultModels);

  const { runAsync, loading } = useRequest(putUpdateDefaultModels, {
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    successToast: t('common:update_success')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account:default_model_config')}
      iconSrc="modal/edit"
    >
      <ModalBody>
        <Box>
          <Box {...labelStyles}>{t('common:model.type.chat')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.llm?.model}
              list={llmModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  llm: llmModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.embedding')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.embedding?.model}
              list={embeddingModelList
                .filter((item) => !item.isTuned)
                .map((item) => ({
                  value: item.model,
                  label: item.name
                }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  embedding: embeddingModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.tts')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.tts?.model}
              list={ttsModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  tts: ttsModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.stt')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.stt?.model}
              list={sttModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  stt: sttModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box mt={4}>
          <Box {...labelStyles}>{t('common:model.type.reRank')}</Box>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.rerank?.model}
              list={reRankModelList
                .filter((item) => !item.isTuned)
                .map((item) => ({
                  value: item.model,
                  label: item.name
                }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  rerank: reRankModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <MyDivider />
        <Box>
          <Flex {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('common:core.ai.model.Dataset Agent Model')}</Box>
            <QuestionTip label={t('common:dataset_text_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.datasetTextLLM?.model}
              list={llmModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  datasetTextLLM: llmModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        <Box>
          <Flex mt={4} {...labelStyles} alignItems={'center'}>
            <Box mr={0.5}>{t('account_model:vlm_model')}</Box>
            <QuestionTip label={t('account_model:vlm_model_tip')} />
          </Flex>
          <Box flex={1}>
            <AIModelSelector
              bg="myGray.50"
              value={defaultData.datasetImageLLM?.model}
              list={vlmModelList.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onChange={(e) => {
                setDefaultData((state) => ({
                  ...state,
                  datasetImageLLM: vlmModelList.find((item) => item.model === e)
                }));
              }}
            />
          </Box>
        </Box>
        {feConfigs?.show_evaluation && (
          <Box mt={4}>
            <Flex {...labelStyles} alignItems={'center'}>
              <Box mr={0.5}>{t('account_model:evaluation_model')}</Box>
              <QuestionTip label={t('account_model:evaluation_model_tip')} />
            </Flex>
            <Box flex={1}>
              <AIModelSelector
                bg="myGray.50"
                value={defaultData.evaluation?.model}
                list={llmModelList
                  .filter((item) => item.useInEvaluation)
                  .map((item) => ({
                    value: item.model,
                    label: item.name
                  }))}
                onChange={(e) => {
                  setDefaultData((state) => ({
                    ...state,
                    evaluation: llmModelList.find((item) => item.model === e)
                  }));
                }}
              />
            </Box>
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          isLoading={loading}
          onClick={() =>
            runAsync({
              [ModelTypeEnum.llm]: defaultData.llm?.model,
              [ModelTypeEnum.embedding]: defaultData.embedding?.model,
              [ModelTypeEnum.tts]: defaultData.tts?.model,
              [ModelTypeEnum.stt]: defaultData.stt?.model,
              [ModelTypeEnum.rerank]: defaultData.rerank?.model,
              datasetTextLLM: defaultData.datasetTextLLM?.model,
              datasetImageLLM: defaultData.datasetImageLLM?.model,
              evaluation: defaultData.evaluation?.model
            })
          }
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default DefaultModelModal;
