import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { importSkill } from '@fastgpt/service/core/agentSkill/controller';
import { parseSkillPackage } from '@fastgpt/service/core/agentSkill/utils';
import type { ImportSkillResponse } from '@fastgpt/global/core/agentSkill/api';
import AdmZip from 'adm-zip';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        error: 'Method not allowed'
      });
    }

    // Authenticate user
    const { teamId, tmbId, userId } = await authUserPer({
      req,
      authToken: true,
      authApiKey: true
    });

    // Get the file from request
    const { file, data: formData } = await parseFormData(req);

    if (!file) {
      return jsonRes(res, {
        code: 400,
        error: 'No file uploaded'
      });
    }

    // Validate file type
    if (!file.originalFilename?.endsWith('.zip')) {
      return jsonRes(res, {
        code: 400,
        error: 'Only ZIP files are allowed'
      });
    }

    // Extract and validate ZIP content
    let skillPackage;
    try {
      skillPackage = await extractSkillPackage(file.filepath);
    } catch (error: any) {
      return jsonRes(res, {
        code: 400,
        error: error.message || 'Failed to extract skill package'
      });
    }

    // Import skill with transaction
    const skillId = await mongoSessionRun(async (session) => {
      return importSkill(skillPackage, teamId, tmbId, userId, session);
    });

    jsonRes<ImportSkillResponse>(res, {
      data: skillId
    });
  } catch (err: any) {
    // Handle specific errors
    if (err.message?.includes('already exists')) {
      return jsonRes(res, {
        code: 409,
        error: err.message
      });
    }

    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

/**
 * Parse multipart form data
 */
async function parseFormData(
  req: NextApiRequest
): Promise<{ file?: any; data?: Record<string, any> }> {
  const formidable = (await import('formidable')).default;

  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFiles: 1,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true
    });

    form.parse(req, (err: any, fields: any, files: any) => {
      if (err) {
        reject(err);
        return;
      }

      const file = files.file?.[0] || files.file;
      const data = fields.data?.[0] ? JSON.parse(fields.data[0]) : {};

      resolve({ file, data });
    });
  });
}

/**
 * Extract and validate skill package from ZIP
 */
async function extractSkillPackage(filePath: string) {
  const zip = new AdmZip(filePath);
  const zipEntries = zip.getEntries();

  // Find required files
  const skillJsonEntry = zipEntries.find((entry) => entry.entryName === 'skill.json');
  const skillMarkdownEntry = zipEntries.find(
    (entry) => entry.entryName === 'SKILL.md' || entry.entryName.toLowerCase() === 'skill.md'
  );

  if (!skillJsonEntry) {
    throw new Error('skill.json not found in ZIP archive');
  }

  if (!skillMarkdownEntry) {
    throw new Error('SKILL.md not found in ZIP archive');
  }

  // Parse skill.json
  let skillData;
  try {
    const skillJsonContent = skillJsonEntry.getData().toString('utf8');
    skillData = JSON.parse(skillJsonContent);
  } catch (error) {
    throw new Error('Invalid skill.json format');
  }

  // Get markdown content
  const markdown = skillMarkdownEntry.getData().toString('utf8');

  // Build package
  const packageData = {
    skill: skillData,
    markdown
  };

  // Validate package
  const { parseSkillPackage: validatePackage } = await import(
    '@fastgpt/service/core/agentSkill/utils'
  );
  const result = parseSkillPackage(packageData);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.package!;
}
