import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { Button, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { parseCurl } from '@fastgpt/global/common/string/http';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { type HttpMethod, ContentTypes } from '@fastgpt/global/core/workflow/constants';
import type { ParamItemType } from './ManualToolModal';

export type CurlImportResult = {
  method: HttpMethod;
  path: string;
  params?: ParamItemType[];
  headers?: ParamItemType[];
  bodyType: string;
  bodyContent?: string;
  bodyFormData?: ParamItemType[];
};

type CurlImportModalProps = {
  onClose: () => void;
  onImport: (result: CurlImportResult) => void;
};

const CurlImportModal = ({ onClose, onImport }: CurlImportModalProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, handleSubmit } = useForm({
    defaultValues: {
      curlContent: ''
    }
  });

  const handleCurlImport = (data: { curlContent: string }) => {
    try {
      const parsed = parseCurl(data.curlContent);

      const convertToParamItemType = (
        items: Array<{ key: string; value?: string; type?: string }>
      ): ParamItemType[] => {
        return items.map((item) => ({
          key: item.key,
          value: item.value || ''
        }));
      };

      const bodyType = (() => {
        if (!parsed.body || parsed.body === '{}') {
          return ContentTypes.none;
        }
        return ContentTypes.json;
      })();

      const result: CurlImportResult = {
        method: parsed.method as HttpMethod,
        path: parsed.url,
        params: parsed.params.length > 0 ? convertToParamItemType(parsed.params) : undefined,
        headers: parsed.headers.length > 0 ? convertToParamItemType(parsed.headers) : undefined,
        bodyType,
        bodyContent: bodyType === ContentTypes.json ? parsed.body : undefined
      };

      onImport(result);
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
      console.error('Curl import error:', error);
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
          autoFocus
          {...register('curlContent')}
          placeholder={t('common:core.module.http.curl import placeholder')}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button onClick={handleSubmit(handleCurlImport)}>{t('common:Confirm')}</Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CurlImportModal);
