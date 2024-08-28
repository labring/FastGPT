import type { NextApiRequest, NextApiResponse } from 'next';
//@ts-ignore
import type { HttpBodyType } from '@fastgpt/global/core/module/api.d';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { authRequestFromLocal } from '@fastgpt/service/support/permission/auth/common';

type Props = HttpBodyType<{
  text: string;
  [key: string]: any;
}>;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const {
      text,
      DYNAMIC_INPUT_KEY: { ...obj }
    } = req.body as Props;

    await authRequestFromLocal({ req });

    // string all value
    Object.keys(obj).forEach((key) => {
      let val = obj[key];

      if (typeof val === 'object') {
        val = JSON.stringify(val);
      } else if (typeof val === 'number') {
        val = String(val);
      } else if (typeof val === 'boolean') {
        val = val ? 'true' : 'false';
      }

      obj[key] = val;
    });

    const textResult = replaceVariable(text, obj);
    res.json({
      text: textResult
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}
