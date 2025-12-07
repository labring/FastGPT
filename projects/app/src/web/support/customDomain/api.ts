import type {
  CreateCustomDomainBody,
  CustomDomainType
} from '@fastgpt/global/support/customDomain/type';
import { DELETE, GET, POST } from '@/web/common/api/request';

export const listCustomDomain = () => GET<CustomDomainType[]>('/proApi/support/customDomain/list');

export const checkCustomDomainDNSResolve = (props: { domain: string; cnameDomain: string }) =>
  POST<{ success: boolean; message: string }>(
    '/proApi/support/customDomain/checkDNSResolve',
    props
  );

export const deleteCustomDomain = (domain: string) =>
  DELETE<{ success: boolean; message: string }>('/proApi/support/customDomain/delete', {
    domain
  });

export const createCustomDomain = (props: CreateCustomDomainBody) =>
  POST<{ success: boolean; message: string }>('/proApi/support/customDomain/create', props);

export const activeCustomDomain = (domain: string) =>
  POST<{ success: boolean; message: string }>('/proApi/support/customDomain/active', {
    domain
  });

// TODO: verify files

export const updateCustomDomainVerifyFile = (props: {
  domain: string;
  path: string;
  content: string;
}) =>
  POST<{ success: boolean; message: string }>(
    '/proApi/support/customDomain/updateVerifyFile',
    props
  );
