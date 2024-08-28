import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { ModalBody, Button, ModalFooter, useDisclosure, Textarea, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import parse from '@bany/curl-to-json';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';

type RequestMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
const methodMap: { [K in RequestMethod]: string } = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH'
};

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
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

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

      const parsed = parse(content);
      if (!parsed.url) {
        throw new Error('url not found');
      }

      const newParams = Object.keys(parsed.params || {}).map((key) => ({
        key,
        value: parsed.params?.[key],
        type: 'string'
      }));
      const newHeaders = Object.keys(parsed.header || {}).map((key) => ({
        key,
        value: parsed.header?.[key],
        type: 'string'
      }));
      const newBody = JSON.stringify(parsed.data, null, 2);

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
          value: methodMap[parsed.method?.toLowerCase() as RequestMethod] || 'GET'
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpParams,
        value: {
          ...params,
          value: newParams
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpHeaders,
        value: {
          ...headers,
          value: newHeaders
        }
      });

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.httpJsonBody,
        value: {
          ...jsonBody,
          value: newBody
        }
      });

      onClose();

      toast({
        title: t('common:common.Import success'),
        status: 'success'
      });
    } catch (error: any) {
      toast({
        title: t('common:common.Import failed'),
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
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CurlImportModal);
