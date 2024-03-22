import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { ModalBody, Button, ModalFooter, useDisclosure, Textarea, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { onChangeNode } from '../../../FlowProvider';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useForm } from 'react-hook-form';
import parse from '@bany/curl-to-json';

type RequestMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
const methodMap: { [K in RequestMethod]: string } = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH'
};

const CurlImportModal = ({
  moduleId,
  inputs,
  onClose
}: {
  moduleId: string;
  inputs: FlowNodeInputItemType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      curlContent: ''
    }
  });

  const { toast } = useToast();

  const handleFileProcessing = async (content: string) => {
    try {
      const requestUrl = inputs.find((item) => item.key === ModuleInputKeyEnum.httpReqUrl);
      const requestMethod = inputs.find((item) => item.key === ModuleInputKeyEnum.httpMethod);
      const params = inputs.find((item) => item.key === ModuleInputKeyEnum.httpParams);
      const headers = inputs.find((item) => item.key === ModuleInputKeyEnum.httpHeaders);
      const jsonBody = inputs.find((item) => item.key === ModuleInputKeyEnum.httpJsonBody);

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
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpReqUrl,
        value: {
          ...requestUrl,
          value: parsed.url
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpMethod,
        value: {
          ...requestMethod,
          value: methodMap[parsed.method?.toLowerCase() as RequestMethod] || 'GET'
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpParams,
        value: {
          ...params,
          value: newParams
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpHeaders,
        value: {
          ...headers,
          value: newHeaders
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpJsonBody,
        value: {
          ...jsonBody,
          value: newBody
        }
      });

      onClose();

      toast({
        title: t('common.Import success'),
        status: 'success'
      });
    } catch (error: any) {
      toast({
        title: t('common.Import failed'),
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
      title={t('core.module.http.curl import')}
      w={600}
    >
      <ModalBody>
        <Textarea
          rows={20}
          mt={2}
          {...register('curlContent')}
          placeholder={t('core.module.http.curl import placeholder')}
        />
      </ModalBody>
      <ModalFooter>
        <Button onClick={handleSubmit((data) => handleFileProcessing(data.curlContent))}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CurlImportModal);
