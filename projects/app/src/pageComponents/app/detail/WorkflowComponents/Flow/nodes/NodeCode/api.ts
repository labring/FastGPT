import { GET } from '@/web/common/api/request';
import type { SanndboxPackagesResponse } from '@fastgpt/service/thirdProvider/codeSandbox';

export const getSandboxPackages = async () =>
  GET<SanndboxPackagesResponse>('/core/workflow/getSandboxPackages');
