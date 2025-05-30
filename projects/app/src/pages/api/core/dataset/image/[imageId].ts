import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { getDatasetImage } from '@fastgpt/service/core/dataset/image/controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import jwt from 'jsonwebtoken';
import { getDownloadStream, getFileById } from '@fastgpt/service/common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

const previewableExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

interface VerifyImageTokenParams {
  token: string;
  imageId: string;
  req: NextApiRequest;
}

// Verify dataset image access token
const verifyImageToken = async ({ token, imageId, req }: VerifyImageTokenParams) => {
  try {
    if (!process.env.FILE_TOKEN_KEY) {
      throw new Error('FILE_TOKEN_KEY not configured');
    }

    // Parse token
    const decoded = jwt.verify(token, process.env.FILE_TOKEN_KEY) as any;

    // Check if token fileId matches requested imageId
    if (decoded.fileId !== imageId) {
      throw new Error('Token fileId does not match imageId');
    }

    // Get image info for permission verification
    const imageInfo = await getDatasetImage(imageId);
    if (!imageInfo) {
      return Promise.reject(new Error('Image not found'));
    }

    // Verify dataset permissions
    await authDataset({
      datasetId: imageInfo.datasetId,
      per: ReadPermissionVal,
      req,
      authToken: true,
      authApiKey: true
    });

    return imageInfo;
  } catch (error) {
    throw error;
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { imageId, token } = req.query as { imageId: string; token: string };

    if (!imageId) {
      return jsonRes(res, {
        code: 401,
        error: 'imageId is required'
      });
    }

    if (!token) {
      return jsonRes(res, {
        code: 401,
        error: 'token is required'
      });
    }

    // Verify token and permissions
    const imageInfo = await verifyImageToken({
      token,
      imageId,
      req
    });

    const bucketName = BucketNameEnum.dataset;
    const [file, fileStream] = await Promise.all([
      getFileById({ bucketName, fileId: imageId }),
      getDownloadStream({ bucketName, fileId: imageId })
    ]);

    if (!file) {
      return Promise.reject(CommonErrEnum.fileNotFound);
    }

    // Get file extension
    const extension = (imageInfo.name.split('.').pop() || '').toLowerCase();
    const disposition = previewableExtensions.includes(extension) ? 'inline' : 'attachment';

    // Set response headers
    res.setHeader('Content-Type', file.contentType || imageInfo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(imageInfo.name)}"`
    );
    res.setHeader('Content-Length', file.length);

    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    fileStream.on('end', () => {
      res.end();
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
