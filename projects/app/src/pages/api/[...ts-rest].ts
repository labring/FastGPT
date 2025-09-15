import { createServerRouter, generateOpenApiDocument } from '@fastgpt/global/common/tsRest/server';
import router from '@/apiRouter';
import { contract } from '@fastgpt/global/common/tsRest/contract';

export default createServerRouter(router);
