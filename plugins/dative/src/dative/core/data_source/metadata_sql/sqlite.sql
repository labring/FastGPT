SELECT
    JSON_GROUP_ARRAY(
        JSON_OBJECT(
            'name', m.name,
            'schema', 'main',
            'columns', JSON(t1.columns),
            'primary_keys', JSON(t2.primary_keys),
            'foreign_keys', COALESCE(JSON(t3.foreign_keys), JSON_ARRAY())
        )
    ) AS tables
FROM sqlite_master AS m
JOIN (
    SELECT
        m.name,
        JSON_GROUP_OBJECT(
            p.name,
            JSON_OBJECT(
                'name', p.name,
                'type', CASE
                    WHEN INSTR(UPPER(p.type), '(') > 0
                    THEN SUBSTRING(UPPER(p.type), 1, INSTR(UPPER(p.type), '(') - 1)
                    ELSE UPPER(p.type)
                END,
                'nullable', (
                    CASE WHEN p."notnull" = 0 THEN TRUE ELSE FALSE END
                ),
                'default', p.dflt_value
            )
        ) AS columns
    FROM sqlite_master AS m
    JOIN PRAGMA_TABLE_INFO(m.name) AS p
        ON m.type = 'table'
    GROUP BY
        m.name
) AS t1
    ON m.name = t1.name
LEFT JOIN (
    SELECT
        m.name,
        JSON_GROUP_ARRAY(p.name) AS primary_keys
    FROM sqlite_master AS m
    JOIN PRAGMA_TABLE_INFO(m.name) AS p
        ON m.type = 'table' AND p.pk > 0
    GROUP BY
        m.name
) AS t2
    ON m.name = t2.name
LEFT JOIN (
    SELECT
        m.name,
        JSON_GROUP_ARRAY(
            JSON_OBJECT(
                'name', 'fk_' || m.tbl_name || '_' || fk."from" || '_' || fk."table" || '_' || fk."to",
                'column', fk."from",
                'referenced_schema', '',
                'referenced_table', fk."table",
                'referenced_column', fk."to"
            )
        ) AS foreign_keys
    FROM sqlite_master AS m
    JOIN PRAGMA_FOREIGN_KEY_LIST(m.name) AS fk
        ON m.type = 'table'
    GROUP BY
        m.tbl_name
) AS t3
    ON m.name = t3.name
