import { TaskResponseKeyEnum } from '@/constants/chat';
import { HttpPropsEnum } from '@/constants/flow/flowField';
import { moduleDispatchResType } from '@/types/chat';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
export type HttpRequestProps = ModuleDispatchProps<{
  [HttpPropsEnum.url]: string;
  [key: string]: any;
}>;
export type HttpResponse = {
  [HttpPropsEnum.failed]?: boolean;
  [TaskResponseKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

export const dispatchHttpRequest = async (props: Record<string, any>): Promise<HttpResponse> => {
  const {
    variables,
    inputs: { url, ...body }
  } = props as HttpRequestProps;

  const requestBody = {
    variables,
    ...body
  };

  try {
    const response = await fetchData({
      url,
      body: requestBody
    });

    return {
      [TaskResponseKeyEnum.responseData]: {
        price: 0,
        body: requestBody,
        httpResult: response
      },
      ...response
    };
  } catch (error) {
    return {
      [HttpPropsEnum.failed]: true,
      [TaskResponseKeyEnum.responseData]: {
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
