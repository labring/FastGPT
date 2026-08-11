import { GET } from '@/web/common/api/request';
import type { GetSandboxPackagesResponse } from '@fastgpt/global/openapi/core/workflow/api';

export const getSandboxPackages = async () =>
  GET<GetSandboxPackagesResponse>('/core/workflow/getSandboxPackages', {}, { deduplicate: true });
