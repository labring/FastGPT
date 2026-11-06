import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { ModalBody, Button, ModalFooter, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { parseCurl } from '@fastgpt/global/common/string/http';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';

const CurlImportModal = ({ nodeId, onClose }: { nodeId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const nodeActions = useNodeActions(nodeId);

  const { register, handleSubmit } = useForm({
    defaultValues: {
      curlContent: ''
    }
  });

  const { toast } = useToast();

  const handleFileProcessing = async (content: string) => {
    try {
      if (!nodeActions) return;
      const parsed = parseCurl(content);

      // 一次导入覆盖五个字段：同一事务提交，撤销一次回到导入前。
      const parsedValues: Record<string, unknown> = {
        [NodeInputKeyEnum.httpReqUrl]: parsed.url,
        [NodeInputKeyEnum.httpMethod]: parsed.method,
        [NodeInputKeyEnum.httpParams]: parsed.params,
        [NodeInputKeyEnum.httpHeaders]: parsed.headers,
        [NodeInputKeyEnum.httpJsonBody]: parsed.body
      };
      nodeActions.updateNode((current) => ({
        inputs: current.inputs.map((input) =>
          input.key in parsedValues ? { ...input, value: parsedValues[input.key] } : input
        )
      }));

      onClose();

      toast({
        title: t('common:import_success'),
        status: 'success'
      });
    } catch (error: any) {
      toast({
        title: t('common:import_failed'),
        description: error.message,
        status: 'error'
      });
      console.error(error);
    }
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/edit"
      title={t('common:core.module.http.curl import')}
      w={600}
    >
      <ModalBody>
        <Textarea
          rows={20}
          mt={2}
          {...register('curlContent')}
          placeholder={t('common:core.module.http.curl import placeholder')}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={handleSubmit((data) => handleFileProcessing(data.curlContent))}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CurlImportModal);
