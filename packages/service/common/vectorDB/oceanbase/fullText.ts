import {
  SQL_FULL_TEXT_ANALYZER_VERSION,
  SQL_FULL_TEXT_SCHEMA_VERSION
} from '@fastgpt/global/core/dataset/fullText/constants';
import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import {
  SqlFullTextMetadataSchema,
  type SqlFullTextMetadata
} from '@fastgpt/global/core/dataset/fullText/schema';
import { DatasetVectorTableName } from '../constants';
import { ObClass } from './controller';
import type { FullTextSearchProps } from '../type';
import type { SqlFullTextAdapter, SqlFullTextRow, SqlFullTextHit } from '../fullText/type';
import {
  splitSqlFullTextRows,
  assertSqlFullTextVectorId,
  normalizeSqlFullTextScope,
  SQL_FULL_TEXT_COLUMN,
  SQL_FULL_TEXT_INDEX
} from '../fullText/utils';
import { toSqlFullTextQueryTerms, tokenizeSqlFullTextRows } from '../fullText/analyzer';

const metadataTable = 'fastgpt_fulltext_metadata';
const indexName = SQL_FULL_TEXT_INDEX;
const column = SQL_FULL_TEXT_COLUMN;
/**
 * SPACE 解析器默认 min_token_size 为 3，若按字符计会丢掉中文两字词，因此显式设为 1。
 * 该属性写法依据官方文档推断，尚未在真实 OceanBase/SeekDB 上验证；不被支持时建索引会直接失败。
 */
const parserClause = 'WITH PARSER SPACE PARSER_PROPERTIES=(min_token_size=1)';

/** 读取产品版本而非 MySQL 协议版本；未知版本拒绝准备，不能静默降级分词器。 */
export const assertOceanBaseFullTextVersion = (
  provider: 'oceanbase' | 'seekdb',
  version: string
) => {
  const match =
    provider === 'seekdb'
      ? version.match(/seekdb[-\s]+v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/i)
      : version.match(/OceanBase(?:_CE|_EE)?[-\s]+v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/i);
  if (!match) throw new Error(`Cannot identify the ${provider} product version`);
  const parts = match.slice(1).map((value) => Number(value ?? 0));
  const minimum = provider === 'seekdb' ? [1, 0, 1, 0] : [4, 3, 5, 1];
  const first = parts.findIndex((value, index) => value !== minimum[index]);
  if (first >= 0 && parts[first] < minimum[first]) {
    throw new Error(`${provider} full text requires ${minimum.join('.')} or later`);
  }
};

/**
 * OceanBase 与 SeekDB 共用 MySQL FULLTEXT 语法；保留独立 provider 与产品版本检查。
 * 词串由外置分析器生成，FULLTEXT 索引只用 SPACE 解析器按空格切词，写入与查询两侧词项一致。
 * DDL 会隐式提交，因此准备按实际结构幂等续跑，全部能力校验通过后写入目标身份元数据。
 */
export class OceanBaseFullTextAdapter implements SqlFullTextAdapter {
  private readonly client: ObClass;
  constructor(readonly provider: 'oceanbase' | 'seekdb') {
    this.client = new ObClass({ type: provider });
  }

  /** 读取物理目标身份并核对共用的外置分词规则版本。 */
  getMetadata = async (): Promise<SqlFullTextMetadata> => {
    const [rows] = await this.client.query<RowDataPacket[]>(
      `SELECT target_id AS targetId,schema_version AS schemaVersion,analyzer_version AS analyzerVersion
       FROM ${metadataTable} WHERE singleton=1`
    );
    return SqlFullTextMetadataSchema.parse(rows[0]);
  };

  /** 同时核对索引类型、词串列、可见状态、分词器和属性，不只检查同名索引存在。 */
  assertCapability = async () => {
    const [indexes] = await this.client.query<RowDataPacket[]>(
      `SHOW INDEX FROM ${DatasetVectorTableName}`
    );
    const rows = indexes
      .map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]))
      )
      .filter((row) => row.key_name === indexName);
    if (
      rows.length !== 1 ||
      String(rows[0].index_type).toUpperCase() !== 'FULLTEXT' ||
      rows[0].column_name !== column ||
      String(rows[0].visible ?? 'YES').toUpperCase() === 'NO' ||
      (rows[0].comment && String(rows[0].comment).toLowerCase() !== 'available')
    ) {
      throw new Error(`${this.provider} FULLTEXT index is absent, invalid or invisible`);
    }
    const [definitions] = await this.client.query<RowDataPacket[]>(
      `SHOW CREATE TABLE ${DatasetVectorTableName}`
    );
    const definition = String(definitions[0]?.['Create Table'] ?? '')
      .replace(/\/\*!\d*([\s\S]*?)\*\//g, ' $1 ')
      .replace(/[`'"]/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    // SHOW CREATE 的版本条件注释、引号、BLOCK_SIZE 及属性顺序会随产品版本变化：
    // 保留词边界后截取目标索引自身的定义子句，核对必须是 SPACE 解析器；
    // 若数据库回显了 parser_properties，则其中必须显式包含 min_token_size=1（完全不回显该子句的产品待真机实测确认）。
    const clause = definition.match(
      new RegExp(
        `\\bfulltext (?:key|index) ${indexName}\\s*\\(\\s*${column}\\s*\\)((?:[^(),]|\\([^)]*\\))*)`
      )
    )?.[1];
    const parser = clause?.match(/\bwith parser ([a-z0-9_]+)\b/)?.[1];
    const parserProps = clause
      ?.match(/\bparser_properties\s*=\s*\(([^)]*)\)/)?.[1]
      .replace(/\s+/g, '');
    const minTokenSize = parserProps?.split(',').find((item) => item.startsWith('min_token_size='));
    if (parser !== 'space' || (parserProps !== undefined && minTokenSize !== 'min_token_size=1')) {
      throw new Error(`${this.provider} FULLTEXT parser must be SPACE with min_token_size=1`);
    }
  };

  /** 仅追加词串列与同步全文索引；原有向量、时间、归属和业务数据保持原样。 */
  prepare = async () => {
    const [version] = await this.client.query<
      ({ version: string; serverVersion: string } & RowDataPacket)[]
    >('SELECT @@version_comment AS version,VERSION() AS serverVersion');
    assertOceanBaseFullTextVersion(
      this.provider,
      `${version[0].serverVersion}\n${version[0].version}`
    );
    const [existingMetaTables] = await this.client.query<RowDataPacket[]>(
      'SELECT 1 FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
      [metadataTable]
    );
    if (existingMetaTables.length) {
      const [versionColumns] = await this.client.query<RowDataPacket[]>(
        `SELECT 1 FROM information_schema.columns
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='schema_version'`,
        [metadataTable]
      );
      if (!versionColumns.length) {
        try {
          await this.client.query(
            `ALTER TABLE ${metadataTable} ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`
          );
        } catch (error) {
          // 多节点并发准备时，其他节点已追加同一字段可以继续核验实际版本。
          if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error) ||
            error.code !== 'ER_DUP_FIELDNAME'
          )
            throw error;
        }
      }
      const [existingMetaRows] = await this.client.query<RowDataPacket[]>(
        `SELECT target_id AS targetId,schema_version AS schemaVersion,analyzer_version AS analyzerVersion
         FROM ${metadataTable} WHERE singleton=1`
      );
      if (existingMetaRows[0]) {
        SqlFullTextMetadataSchema.parse(existingMetaRows[0]);
      }
    }
    const [columns] = await this.client.query<RowDataPacket[]>(
      `SELECT DATA_TYPE AS dataType,IS_NULLABLE AS nullable,CHARACTER_SET_NAME AS charset FROM information_schema.columns
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
      [DatasetVectorTableName, column]
    );
    if (!columns.length)
      await this.client.query(
        `ALTER TABLE ${DatasetVectorTableName} ADD COLUMN ${column} LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL`
      );
    else if (
      !['mediumtext', 'longtext'].includes(String(columns[0].dataType).toLowerCase()) ||
      columns[0].nullable !== 'YES' ||
      columns[0].charset !== 'utf8mb4'
    ) {
      throw new Error(
        `${this.provider} full-text column must be nullable TEXT with utf8mb4 and MEDIUMTEXT/LONGTEXT capacity`
      );
    }
    const [indexes] = await this.client.query<RowDataPacket[]>(
      `SHOW INDEX FROM ${DatasetVectorTableName}`
    );
    if (!indexes.some((row) => row.Key_name === indexName || row.key_name === indexName)) {
      await this.client.query(
        `CREATE FULLTEXT INDEX ${indexName} ON ${DatasetVectorTableName}(${column}) ${parserClause}`
      );
    }
    await this.assertCapability();
    await this.client.query(`CREATE TABLE IF NOT EXISTS ${metadataTable} (
      singleton TINYINT PRIMARY KEY,target_id VARCHAR(36) NOT NULL,
      schema_version INTEGER NOT NULL, analyzer_version VARCHAR(96) NOT NULL)`);
    await this.client.query(
      `INSERT INTO ${metadataTable} (singleton, target_id, schema_version, analyzer_version) VALUES(1,?,?,?)
      ON DUPLICATE KEY UPDATE singleton=singleton`,
      [randomUUID(), SQL_FULL_TEXT_SCHEMA_VERSION, SQL_FULL_TEXT_ANALYZER_VERSION]
    );
    return this.getMetadata();
  };

  /**
   * 回填与验收共用归属及二进制比较；源文本与 ID 校验后只补 NULL，不覆盖已有词串。
   */
  private executeRows = async (rows: SqlFullTextRow[], mode: 'fill' | 'validate') => {
    const invalidIds: string[] = [];
    for (const chunk of splitSqlFullTextRows(await tokenizeSqlFullTextRows(rows))) {
      const values = chunk.flatMap((row) => [
        row.vectorId,
        row.teamId,
        row.datasetId,
        row.collectionId,
        row.tokens
      ]);
      const source = chunk
        .map(
          () =>
            'SELECT CAST(? AS SIGNED) AS id,? AS team_id,? AS dataset_id,? AS collection_id,? AS tokens'
        )
        .join(' UNION ALL ');
      const join =
        'm.id=v.id AND m.team_id=v.team_id AND m.dataset_id=v.dataset_id AND m.collection_id=v.collection_id';
      if (mode === 'fill')
        await this.client.query(
          `UPDATE ${DatasetVectorTableName} m JOIN (${source}) v ON ${join} SET m.${column}=v.tokens WHERE m.${column} IS NULL`,
          values
        );
      const [invalid] = await this.client.query<({ id: string } & RowDataPacket)[]>(
        `SELECT CAST(v.id AS CHAR) AS id FROM (${source}) v LEFT JOIN ${DatasetVectorTableName} m ON ${join}
         WHERE m.id IS NULL OR NOT (BINARY m.${column} <=> BINARY v.tokens)`,
        values
      );
      invalidIds.push(...invalid.map((row) => row.id));
    }
    return invalidIds;
  };

  /** 只补同归属的 NULL；验收模式要求词串已完整且逐字节一致。 */
  fill = (rows: SqlFullTextRow[], validateOnly = false) =>
    this.executeRows(rows, validateOnly ? 'validate' : 'fill');

  /** 按全局 ID 判断物理缺失，错误归属的已有行始终不进入自动补建。 */
  findMissingVectorIds = async (ids: string[]): Promise<string[]> => {
    ids.forEach(assertSqlFullTextVectorId);
    const existing = new Set<string>();
    for (let start = 0; start < ids.length; start += 50) {
      const chunk = ids.slice(start, start + 50);
      const [rows] = await this.client.query<({ id: string } & RowDataPacket)[]>(
        `SELECT CAST(id AS CHAR) AS id FROM ${DatasetVectorTableName} WHERE id IN (${chunk.map(() => '?').join(',')})`,
        chunk
      );
      rows.forEach(({ id }) => existing.add(id));
    }
    return ids.filter((id) => !existing.has(id));
  };

  /**
   * 查询先经外置分析器切成去重词，以空格连接后做自然语言全文匹配；只含停用词/标点时直接返回空结果。
   * 租户/知识库/集合范围在相关性 Top-K 前过滤。
   */
  search = async (input: FullTextSearchProps): Promise<SqlFullTextHit[]> => {
    const props = normalizeSqlFullTextScope(input);
    const allowed = props.filterCollectionIdList?.filter(
      (id) => !props.forbidCollectionIdList.includes(id)
    );
    if (
      !props.query.trim() ||
      props.limit <= 0 ||
      !props.datasetIds.length ||
      allowed?.length === 0
    )
      return [];
    const terms = await toSqlFullTextQueryTerms(props.query);
    if (!terms.length) return [];
    const matchText = terms.join(' ');
    const where = [
      `MATCH(${column}) AGAINST (? IN NATURAL LANGUAGE MODE)>0`,
      'team_id=?',
      `dataset_id IN (${props.datasetIds.map(() => '?').join(',')})`
    ];
    const values: unknown[] = [matchText, matchText, String(props.teamId), ...props.datasetIds];
    if (allowed) {
      where.push(`collection_id IN (${allowed.map(() => '?').join(',')})`);
      values.push(...allowed);
    }
    if (props.forbidCollectionIdList.length) {
      where.push(`collection_id NOT IN (${props.forbidCollectionIdList.map(() => '?').join(',')})`);
      values.push(...props.forbidCollectionIdList);
    }
    values.push(props.limit);
    const [rows] = await this.client.query<
      ({ vectorId: string; collectionId: string; score: number | string } & RowDataPacket)[]
    >(
      `SELECT CAST(id AS CHAR) AS vectorId,collection_id AS collectionId,
       MATCH(${column}) AGAINST (? IN NATURAL LANGUAGE MODE) AS score FROM ${DatasetVectorTableName}
       WHERE ${where.join(' AND ')} ORDER BY score DESC,id ASC LIMIT ?`,
      values
    );
    return rows.map((row) => ({
      vectorId: row.vectorId,
      collectionId: row.collectionId,
      score: Number(row.score)
    }));
  };
}
