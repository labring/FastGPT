import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { importSkill } from '@fastgpt/service/core/agentSkill/controller';
import { repackFileMapAsZip } from '@fastgpt/service/core/agentSkill/zipBuilder';
import {
  getSupportedArchiveFormat,
  extractToFileMap
} from '@fastgpt/service/core/agentSkill/archiveUtils';
import type { ImportSkillBody, ImportSkillResponse } from '@fastgpt/global/core/agentSkill/api';
import type { SkillPackageType } from '@fastgpt/global/core/agentSkill/type';
import { multer } from '@fastgpt/service/common/file/multer';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filepaths: string[] = [];

  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    const result = await multer.resolveFormData<ImportSkillBody>({
      request: req,
      maxFileSize: 10 // 10MB
    });

    filepaths.push(result.fileMetadata.path);

    const file = result.fileMetadata;
    // Support both JSON-wrapped body ({"data": "..."}) and plain multipart form fields
    const body: ImportSkillBody = {
      name: result.data.name ?? (req.body?.name as string | undefined),
      description: result.data.description ?? (req.body?.description as string | undefined)
    };

    const format = getSupportedArchiveFormat(file.originalname ?? '');
    if (!format) {
      return jsonRes(res, {
        code: 400,
        error: 'Only ZIP, TAR, and TAR.GZ files are supported'
      });
    }

    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Check archive size
    const maxSizeEnv = process.env.MAX_SKILL_ZIP_SIZE;
    const maxArchiveSize = maxSizeEnv ? parseInt(maxSizeEnv, 10) : 50 * 1024 * 1024;
    const stats = await fs.stat(file.path);
    if (stats.size > maxArchiveSize) {
      return jsonRes(res, {
        code: 400,
        error: `Archive file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum (${(maxArchiveSize / 1024 / 1024).toFixed(2)}MB)`
      });
    }

    // Extract archive to file map
    let fileMap: Record<string, Buffer>;
    try {
      fileMap = await extractToFileMap(file.path);
    } catch (err: any) {
      return jsonRes(res, {
        code: 400,
        error: `Failed to extract archive: ${err.message || 'Unknown error'}`
      });
    }
    if (Object.keys(fileMap).length === 0) {
      return jsonRes(res, { code: 400, error: 'Archive is empty' });
    }

    // Derive package-level name from caller-supplied value or archive filename
    const pkgName =
      body.name ||
      (file.originalname ?? 'package').replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').trim() ||
      'package';
    const pkgDescription = body.description ?? '';

    // Repack the entire fileMap as a single ZIP (converts TAR/TAR.GZ to ZIP)
    const zipBuffer = await repackFileMapAsZip(fileMap);

    // Build skill package using package-level metadata only
    const skillPackage: SkillPackageType = {
      skill: {
        name: pkgName,
        description: pkgDescription,
        category: ['other'],
        config: {}
      }
    };

    // Create ONE DB record
    const skillId = await mongoSessionRun(async (session) =>
      importSkill(skillPackage, teamId, tmbId, userId || '', zipBuffer, session)
    );

    jsonRes<ImportSkillResponse>(res, { data: skillId });
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      return jsonRes(res, { code: 409, error: err.message });
    }
    jsonRes(res, { code: 500, error: err });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}
