import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

export type HttpRequestProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.httpUrl]: string;
  [key: string]: any;
}>;
export type HttpResponse = {
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

export const dispatchHttpRequest = async (props: Record<string, any>): Promise<HttpResponse> => {
  const {
    chatId,
    variables,
    inputs: { url, ...body }
  } = props as HttpRequestProps;

  const requestBody = {
    ...body,
    chatId,
    variables
  };

  try {
    const response = await fetchData({
      url,
      body: requestBody
    });

    return {
      responseData: {
        price: 0,
        body: requestBody,
        httpResult: response
      },
      ...response
    };
  } catch (error) {
    return {
      [ModuleOutputKeyEnum.failed]: true,
      responseData: {
        price: 0,
        body: requestBody,
        httpResult: { error }
      }
    };
  }
};

async function fetchData({
  url,
  body
}: {
  url: string;
  body: Record<string, any>;
}): Promise<Record<string, any>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }).then((res) => res.json());

  return response;
}
