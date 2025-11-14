import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { ModalBody, Button, ModalFooter, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { parseCurl } from '@fastgpt/global/common/string/http';
import { WorkflowActionsContext } from '../../../context/workflowActionsContext';

const CurlImportModal = ({
  nodeId,
  inputs,
  onClose
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const { register, handleSubmit } = useForm({
    defaultValues: {
      curlContent: ''
    }
  });

  const { toast } = useToast();

  const handleFileProcessing = async (content: string) => {
    try {
      const requestUrl = inputs.find((item) => item.key === NodeInputKeyEnum.httpReqUrl);
      const requestMethod = inputs.find((item) => item.key === NodeInputKeyEnum.httpMethod);
      const params = inputs.find((item) => item.key === NodeInputKeyEnum.httpParams);
      const headers = inputs.find((item) => item.key === NodeInputKeyEnum.httpHeaders);
      const jsonBody = inputs.find((item) => item.key === NodeInputKeyEnum.httpJsonBody);

      if (!requestUrl || !requestMethod || !params || !headers || !jsonBody) return;

      const parsed = parseCurl(content);

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpReqUrl,
        value: {
          ...requestUrl,
          value: parsed.url
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpMethod,
        value: {
          ...requestMethod,
          value: parsed.method
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpParams,
        value: {
          ...params,
          value: parsed.params
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpHeaders,
        value: {
          ...headers,
          value: parsed.headers
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpJsonBody,
        value: {
          ...jsonBody,
          value: parsed.body
        }
      });

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
