import { useState } from 'react';
import { Box, Button, Table, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { postReplaceInvalidModelReferences } from '@/web/core/ai/model/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ReplaceInvalidModelReferencesBody,
  ReplaceInvalidModelReferencesResponse
} from '@fastgpt/global/openapi/core/ai/model/invalidReferences';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

type Replacement = ReplaceInvalidModelReferencesBody['replacement'];
type ResourceType = keyof ReplaceInvalidModelReferencesResponse['counts'];

const modelFields = [
  { key: 'llmModelId', type: ModelTypeEnum.llm },
  { key: 'ttsModelId', type: ModelTypeEnum.tts },
  { key: 'rerankModelId', type: ModelTypeEnum.rerank }
] as const;
const resourceTypes: ResourceType[] = ['dataset', 'app', 'version'];

/** 一次请求完成替换；执行前确认团队资源和历史版本会被修改。 */
const ReplaceInvalidModelsModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useSafeTranslation();
  const modelLabels = {
    [ModelTypeEnum.llm]: t('common:model.type.chat'),
    [ModelTypeEnum.tts]: t('common:model.type.tts'),
    [ModelTypeEnum.rerank]: t('common:model.type.reRank')
  };
  const resourceLabels = {
    dataset: t('config_model:replace_invalid_dataset'),
    app: t('config_model:replace_invalid_app'),
    version: t('config_model:replace_invalid_version')
  };
  const [replacement, setReplacement] = useState<Replacement>({
    llmModelId: '',
    ttsModelId: '',
    rerankModelId: ''
  });
  const [step, setStep] = useState<'select' | 'result'>('select');
  const [result, setResult] = useState<ReplaceInvalidModelReferencesResponse>();
  const { openConfirm, ConfirmModal } = useConfirm();
  const { runAsync, loading } = useRequest(postReplaceInvalidModelReferences, {
    onSuccess: (response) => {
      setResult(response);
      setStep('result');
    },
    errorToast: t('config_model:replace_invalid_request_failed')
  });
  const close = () => {
    if (!loading) onClose();
  };
  const canConfirm = modelFields.every(({ key }) => Boolean(replacement[key]));
  const hasFailures = Boolean(result?.failedSamples.length);
  const confirmReplacement = () => {
    openConfirm({
      title: t('config_model:replace_invalid_review'),
      customContent: t('config_model:replace_invalid_confirm_warning'),
      confirmText: t('config_model:replace_invalid_execute'),
      onConfirm: () => runAsync({ replacement })
    })();
  };

  return (
    <MyModal
      isOpen
      onClose={close}
      closeOnOverlayClick={!loading}
      showCloseButton={!loading}
      size={step === 'result' ? 'lg' : 'sm'}
      title={t('config_model:replace_invalid_title')}
      footer={
        step === 'select' ? (
          <>
            <Button variant="whiteBase" onClick={close}>
              {t('common:Cancel')}
            </Button>
            <Button isDisabled={!canConfirm || loading} onClick={confirmReplacement}>
              {t('config_model:replace_invalid_review')}
            </Button>
          </>
        ) : (
          <>
            {(result?.completed === false || hasFailures) && (
              <Button variant="whiteBase" onClick={confirmReplacement}>
                {t('config_model:replace_invalid_retry')}
              </Button>
            )}
            <Button onClick={close}>{t('common:Close')}</Button>
          </>
        )
      }
    >
      {step === 'select' && (
        <Box>
          {modelFields.map(({ key, type }) => (
            <Box key={key} mb={4}>
              <Text mb={1} fontWeight="medium">
                {modelLabels[type]}
              </Text>
              <AIModelSelector
                modelType={type}
                requireTtsVoice={type === ModelTypeEnum.tts}
                value={replacement[key]}
                onChange={(modelId) =>
                  setReplacement((current) => ({ ...current, [key]: modelId }))
                }
              />
            </Box>
          ))}
        </Box>
      )}

      {step === 'result' && result && (
        <Box>
          <Text mb={3} fontWeight="medium">
            {result.completed
              ? hasFailures
                ? t('config_model:replace_invalid_done_with_failures')
                : t('config_model:replace_invalid_done')
              : t('config_model:replace_invalid_stopped')}
          </Text>
          {result.stoppedReason && (
            <Text mb={3}>
              {result.stoppedReason === 'conditions_changed'
                ? t('config_model:replace_invalid_conditions_changed')
                : t('config_model:replace_invalid_scan_interrupted')}
            </Text>
          )}
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>{t('config_model:replace_invalid_resource')}</Th>
                  <Th>{t('config_model:model')}</Th>
                  <Th isNumeric>{t('config_model:replace_invalid_scanned')}</Th>
                  <Th isNumeric>{t('config_model:replace_invalid_replaced')}</Th>
                  <Th isNumeric>{t('config_model:replace_invalid_skipped')}</Th>
                  <Th isNumeric>{t('config_model:replace_invalid_conflicts')}</Th>
                  <Th isNumeric>{t('config_model:replace_invalid_failed')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {resourceTypes.flatMap((resource) =>
                  modelFields.map(({ key, type }) => {
                    const count = result.counts[resource][type];
                    return (
                      <Tr key={`${resource}-${key}`}>
                        <Td>{resourceLabels[resource]}</Td>
                        <Td>{modelLabels[type]}</Td>
                        <Td isNumeric>{count.scannedRecords}</Td>
                        <Td isNumeric>{count.replacedReferences}</Td>
                        <Td isNumeric>{count.skippedReferences}</Td>
                        <Td isNumeric>{count.conflicts}</Td>
                        <Td isNumeric>{count.failedRecords}</Td>
                      </Tr>
                    );
                  })
                )}
              </Tbody>
            </Table>
          </Box>
          {result.failedSamples.length > 0 && (
            <Box mt={4}>
              <Text fontWeight="medium">{t('config_model:replace_invalid_failed_samples')}</Text>
              {result.failedSamples.map((item, index) => (
                <Text key={`${item.resourceType}-${item.resourceId}-${index}`} mt={1}>
                  {item.resourceType} · {item.resourceId}: {item.reason}
                </Text>
              ))}
            </Box>
          )}
          {(result.completed === false || hasFailures) && (
            <Text mt={4} color="myGray.600" fontSize="sm">
              {t('config_model:replace_invalid_retry_note')}
            </Text>
          )}
        </Box>
      )}
      <ConfirmModal isLoading={loading} />
    </MyModal>
  );
};

export default ReplaceInvalidModelsModal;
