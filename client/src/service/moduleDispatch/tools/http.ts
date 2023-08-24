import { ChatModuleEnum, TaskResponseKeyEnum } from '@/constants/chat';
import { HttpPropsEnum } from '@/constants/flow/flowField';
import { ChatHistoryItemResType } from '@/types/chat';
import type { NextApiResponse } from 'next';

export type HttpRequestProps = {
  res: NextApiResponse;
  stream: boolean;
  userOpenaiAccount: any;
  [HttpPropsEnum.url]: string;
  [key: string]: any;
};
export type HttpResponse = {
  [HttpPropsEnum.finish]: boolean;
  [HttpPropsEnum.failed]?: boolean;
  [TaskResponseKeyEnum.responseData]: ChatHistoryItemResType;
  [key: string]: any;
};

export const dispatchHttpRequest = async (props: Record<string, any>): Promise<HttpResponse> => {
  const { res, stream, userOpenaiAccount, url, ...body } = props as HttpRequestProps;

  try {
    const response = await fetchData({ url, body });

    return {
      [HttpPropsEnum.finish]: true,
      [TaskResponseKeyEnum.responseData]: {
        moduleName: ChatModuleEnum.Http,
        price: 0,
        httpResult: response
      },
      ...response
    };
  } catch (error) {
    return {
      [HttpPropsEnum.finish]: true,
      [HttpPropsEnum.failed]: true,
      [TaskResponseKeyEnum.responseData]: {
        moduleName: ChatModuleEnum.Http,
        price: 0,
        httpResult: {}
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
