import { isDeepStrictEqual } from 'node:util';
import {
  SYSTEM_INSTANCE_CONFIG_DOMAINS,
  type SystemInstanceConfigDomainKey
} from '@fastgpt/global/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import {
  decryptDomainSecrets,
  encryptDomainSecrets
} from '@fastgpt/service/common/system/systemInstanceConfig/secrets';

/** 兼容早期以域名作为 _id、未设置 domain 字段的文档。 */
const getDocumentDomain = (doc: { _id: unknown; domain?: unknown }) => {
  const domain = doc.domain ?? doc._id;
  if (domain === 'modelStatusProbe') return domain;
  return typeof domain === 'string' &&
    SYSTEM_INSTANCE_CONFIG_DOMAINS.includes(domain as SystemInstanceConfigDomainKey)
    ? (domain as SystemInstanceConfigDomainKey)
    : undefined;
};

/**
 * 全量重跑时加密既有业务域及模型状态探测 scope 的明文密钥，保留空值、其他字段和既有密文。
 * scope 数量固定且很少，无需 checkpoint；revision CAS 失败后重读管理员的最新值，
 * 仅有明文或实际变化才写入，已加密文档重跑不会增加 revision。
 */
export const encryptStoredConfigSecrets = async ({
  assertActive
}: {
  assertActive: () => Promise<void>;
}) => {
  const collection = MongoSystemInstanceConfig.collection;
  const documents = await collection.find({}, { readPreference: 'primary' }).toArray();

  for (const document of documents) {
    const domain = getDocumentDomain(document);
    if (!domain) continue;

    let current = document;
    let completed = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      // 先解密以验证已有密文，再复用相同密文，避免重放更改随机 nonce。
      const plain = decryptDomainSecrets(domain, current.overrides);
      const encrypted = encryptDomainSecrets({
        domain,
        data: plain,
        previousStored: current.overrides
      });
      if (isDeepStrictEqual(encrypted, current.overrides)) {
        completed = true;
        break;
      }

      await assertActive();
      const result = await collection.updateOne(
        { _id: current._id, revision: current.revision },
        {
          $set: { overrides: encrypted, updatedAt: new Date(), updatedBy: { actor: 'migration' } },
          $inc: { revision: 1 }
        }
      );
      if (result.modifiedCount === 1) {
        completed = true;
        break;
      }

      const latest = await collection.findOne({ _id: current._id }, { readPreference: 'primary' });
      if (!latest) {
        // 后续全局终验会检查域是否缺失，无需覆盖并发删除。
        completed = true;
        break;
      }
      if (getDocumentDomain(latest) !== domain) {
        throw new Error(`System configuration secret migration conflicted: ${domain}`);
      }
      current = latest;
    }
    if (!completed) {
      throw new Error(`System configuration secret migration repeatedly conflicted: ${domain}`);
    }
  }
};

/** 终验逐域复验密文可解密，并拒绝仍可转换的非空明文密钥。 */
export const verifyStoredConfigSecrets = async () => {
  const documents = await MongoSystemInstanceConfig.collection
    .find({}, { readPreference: 'primary' })
    .toArray();
  for (const document of documents) {
    const domain = getDocumentDomain(document);
    if (!domain) continue;
    const plain = decryptDomainSecrets(domain, document.overrides);
    const encrypted = encryptDomainSecrets({
      domain,
      data: plain,
      previousStored: document.overrides
    });
    if (!isDeepStrictEqual(encrypted, document.overrides)) {
      throw new Error(`System configuration secret migration incomplete: ${domain}`);
    }
  }
};
