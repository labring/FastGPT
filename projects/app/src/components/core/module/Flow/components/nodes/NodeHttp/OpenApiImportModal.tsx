import React from 'react';
import MyModal from '@/components/MyModal';
import { ModalBody, Button, ModalFooter, useDisclosure, Textarea, Box } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { onChangeNode } from '../../../FlowProvider';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import yaml from 'js-yaml';
import { useForm } from 'react-hook-form';

type RequestMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
const methodMap: { [K in RequestMethod]: string } = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH'
};

const OpenApiImportModal = ({
  children,
  moduleId,
  inputs
}: {
  children: React.ReactElement;
  moduleId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      openapiContent: ''
    }
  });

  const { toast } = useToast();

  const handleFileProcessing = async (content: string) => {
    try {
      let data;
      try {
        data = JSON.parse(content);
      } catch (jsonError) {
        try {
          data = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA });
        } catch (yamlError) {
          console.error(yamlError);
          throw new Error();
        }
      }

      const firstPathName = Object.keys(data.paths)[0];
      const firstPathData = data.paths[firstPathName];
      const firstRequestMethod = Object.keys(firstPathData)[0];
      const firstRequestMethodData = firstPathData[firstRequestMethod];
      const firstRequestParameters = firstRequestMethodData.parameters || [];

      const pathParams = [];
      const headerParams = [];
      for (const parameter of firstRequestParameters) {
        if (parameter.in === 'path') {
          pathParams.push({
            key: parameter.name,
            type: parameter.schema.type
          });
        } else {
          headerParams.push({
            key: parameter.name,
            type: parameter.schema.type
          });
        }
      }

      const requestBodySchema =
        firstRequestMethodData.requestBody?.content?.['application/json']?.schema;
      let requestBodyValue = '';
      if (requestBodySchema) {
        requestBodyValue = JSON.stringify(requestBodySchema, null, 2);
      }

      const requestUrl = inputs.find((item) => item.key === ModuleInputKeyEnum.httpReqUrl);
      const requestMethod = inputs.find((item) => item.key === ModuleInputKeyEnum.httpMethod);
      const params = inputs.find((item) => item.key === ModuleInputKeyEnum.httpParams);
      const headers = inputs.find((item) => item.key === ModuleInputKeyEnum.httpHeaders);
      const jsonBody = inputs.find((item) => item.key === ModuleInputKeyEnum.httpJsonBody);

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpReqUrl,
        value: {
          ...requestUrl,
          value: firstPathName
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpMethod,
        value: {
          ...requestMethod,
          value: methodMap[firstRequestMethod.toLowerCase() as RequestMethod] || 'GET'
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpParams,
        value: {
          ...params,
          value: pathParams
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpHeaders,
        value: {
          ...headers,
          value: headerParams
        }
      });

      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: ModuleInputKeyEnum.httpJsonBody,
        value: {
          ...jsonBody,
          value: requestBodyValue
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
    <>
      {children && <Box onClick={onOpen}>{children}</Box>}
      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        iconSrc="modal/edit"
        title={t('common.Import')}
        m={'auto'}
        w={500}
      >
        <ModalBody>
          <Textarea
            height={400}
            maxH={500}
            mt={2}
            {...register('openapiContent')}
            placeholder={t('core.module.http.OpenAPI import placeholder')}
          />
        </ModalBody>
        <ModalFooter>
          <Button onClick={handleSubmit((data) => handleFileProcessing(data.openapiContent))}>
            {t('common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(OpenApiImportModal);
