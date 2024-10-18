import { TmpDataEnum } from '@fastgpt/global/support/tmpData/constant';
import { getTmpData, setTmpData } from '../../support/tmpData/controller';
import { ApiRequestProps } from 'type/next';
import requestIp from 'request-ip';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

// unit: times/s
// how to use?
// export default NextAPI(useQPSLimit(10), handler); // limit 10 times per second for a ip
export function useQPSLimit(limit: number) {
  return async (req: ApiRequestProps) => {
    const ip = requestIp.getClientIp(req);
    if (!ip) {
      return;
    }
    const data = await getTmpData({
      type: TmpDataEnum.QPSLimit,
      metadata: {
        ip
      }
    });
    if (!data) {
      await setTmpData({
        type: TmpDataEnum.QPSLimit,
        metadata: {
          ip
        },
        data: {
          requestTimes: 0
        }
      });
    } else {
      if (data.data.requestTimes >= limit) {
        return Promise.reject(ERROR_ENUM.QPSLimitExceed);
      }
      await setTmpData({
        type: TmpDataEnum.QPSLimit,
        metadata: {
          ip
        },
        data: {
          requestTimes: data.data.requestTimes + 1
        }
      });
    }
  };
}
