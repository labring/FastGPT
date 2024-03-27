import formidable, { File } from 'formidable';
import { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
var Minio = require('minio');
var fs = require('fs');

console.log(Minio);

const client = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'XbG45IN9n0Gzgbp2agYN',
  secretKey: 'X5RxzwUhLlMobJ47YLPLQ9JB4yWvE4cXpYrl90km'
});

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    // 解析请求，获取文件
    const form = new formidable.IncomingForm();
    form.parse(req, async (err, fields, files) => {
      const image: File | File[] = files.image;
      const fileName = `${Date.now()}-${image.originalFilename}`; // 生成文件名
      const fileStream = fs.createReadStream(image.filepath);
      const metaData = {
        'Content-Type': image.mimetype // 设置图片的类型，如jpeg、png等
      };
      // 上传文件到MinIO
      await client.putObject(
        'fastgpt', // 桶名
        fileName, // 文件名
        fileStream,
        image.size,
        metaData
      );
      await client.getObject('fastgpt', fileName);
      jsonRes(res, {
        data: {
          url: `http://localhost:9000/fastgpt/${fileName}`
        }
      });
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error: 'Error uploading file'
    });
  }
}
