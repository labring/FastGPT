SELECT
    t.table_schema,
    JSON_AGG(
        JSON_BUILD_OBJECT(
            'name',
            t.table_name,
            'schema',
            t.table_schema,
            'columns',
            t.columns,
            'primary_keys',
            COALESCE(t.primary_keys, CAST('[]' AS JSON)),
            'foreign_keys',
            COALESCE(t.foreign_keys, CAST('[]' AS JSON)),
            'comment',
            t.comment
        )
    ) AS tables
FROM (
    SELECT
        t1.table_schema,
        t1.table_name,
        t1.comment,
        t2.columns,
        t3.primary_keys,
        t4.foreign_keys
    FROM (
        SELECT
            n.nspname AS table_schema,
            c.relname AS table_name,
            COALESCE(OBJ_DESCRIPTION(c.oid), '') AS comment
        FROM pg_class AS c
        JOIN pg_namespace AS n
            ON n.oid = c.relnamespace AND c.relkind = 'r' AND n.nspname = '{schema}'
    ) AS t1
    JOIN (
        SELECT
            t.table_schema,
            t.table_name,
            JSON_OBJECT_AGG(
                t.column_name,
                JSON_BUILD_OBJECT(
                    'name',
                    t.column_name,
                    'default',
                    t.column_default,
                    'nullable',
                    CASE WHEN t.is_nullable = 'YES' THEN TRUE ELSE FALSE END,
                    'type',
                    UPPER(t.data_type),
                    'auto_increment',
                    t.auto_increment,
                    'comment',
                    COALESCE(t.comment, '')
                )
            ) AS columns
        FROM (
            SELECT
                c.table_schema,
                c.table_name,
                c.column_name,
                c.data_type,
                c.column_default,
                c.is_nullable,
                COALESCE(coldesc.comment, '') AS comment,
                CASE
                    WHEN c.is_identity = 'YES'
                    OR c.column_default LIKE 'nextval%'
                    OR c.column_default LIKE 'nextval(%'
                    THEN TRUE
                    ELSE FALSE
                END AS auto_increment
            FROM information_schema.columns AS c
            JOIN (
                SELECT
                    n.nspname AS table_schema,
                    c.relname AS table_name,
                    a.attname AS column_name,
                    COL_DESCRIPTION(c.oid, a.attnum) AS comment
                FROM pg_class AS c
                JOIN pg_namespace AS n
                    ON n.oid = c.relnamespace
                JOIN pg_attribute AS a
                    ON a.attrelid = c.oid
                WHERE
                    a.attnum > 0 AND NOT a.attisdropped AND n.nspname = '{schema}'
            ) AS coldesc
                ON c.table_schema = '{schema}'
                AND c.table_schema = coldesc.table_schema
                AND c.table_name = coldesc.table_name
                AND c.column_name = coldesc.column_name
        ) AS t
        GROUP BY
            t.table_schema,
            t.table_name
    ) AS t2
        ON t1.table_schema = t2.table_schema AND t1.table_name = t2.table_name
    LEFT JOIN (
        SELECT
            CAST(CAST(connamespace AS REGNAMESPACE) AS TEXT) AS table_schema,
            CASE
                WHEN POSITION('.' IN CAST(CAST(conrelid AS REGCLASS) AS TEXT)) > 0
                THEN SPLIT_PART(CAST(CAST(conrelid AS REGCLASS) AS TEXT), '.', 2)
                ELSE CAST(CAST(conrelid AS REGCLASS) AS TEXT)
            END AS table_name,
            TO_JSON(STRING_TO_ARRAY(SUBSTRING(PG_GET_CONSTRAINTDEF(oid) FROM '\((.*?)\)'), ',')) AS primary_keys
        FROM pg_constraint
        WHERE
            contype = 'p' AND CAST(CAST(connamespace AS REGNAMESPACE) AS TEXT) = '{schema}'
    ) AS t3
        ON t1.table_schema = t3.table_schema AND t1.table_name = t3.table_name
    LEFT JOIN (
        SELECT
            t.table_schema,
            t.table_name,
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'name',
                    t.name,
                    'column',
                    t.column_name,
                    'referenced_schema',
                    t.referenced_table_schema,
                    'referenced_table',
                    t.referenced_table_name,
                    'referenced_column',
                    t.referenced_column_name
                )
            ) AS foreign_keys
        FROM (
            SELECT
                c.conname AS name,
                n.nspname AS table_schema,
                CASE
                    WHEN POSITION('.' IN CAST(CAST(conrelid AS REGCLASS) AS TEXT)) > 0
                    THEN SPLIT_PART(CAST(CAST(conrelid AS REGCLASS) AS TEXT), '.', 2)
                    ELSE CAST(CAST(conrelid AS REGCLASS) AS TEXT)
                END AS TABLE_NAME,
                A.attname AS COLUMN_NAME,
                nr.nspname AS referenced_table_schema,
                CASE
                    WHEN POSITION('.' IN CAST(CAST(confrelid AS REGCLASS) AS TEXT)) > 0
                    THEN SPLIT_PART(CAST(CAST(confrelid AS REGCLASS) AS TEXT), '.', 2)
                    ELSE CAST(CAST(confrelid AS REGCLASS) AS TEXT)
                END AS referenced_table_name,
                af.attname AS referenced_column_name
            FROM pg_constraint AS c
            JOIN pg_attribute AS a
                ON a.attnum = ANY(
                    c.conkey
                ) AND a.attrelid = c.conrelid
            JOIN pg_class AS cl
                ON cl.oid = c.conrelid
            JOIN pg_namespace AS n
                ON n.oid = cl.relnamespace
            JOIN pg_attribute AS af
                ON af.attnum = ANY(
                    c.confkey
                ) AND af.attrelid = c.confrelid
            JOIN pg_class AS clf
                ON clf.oid = c.confrelid
            JOIN pg_namespace AS nr
                ON nr.oid = clf.relnamespace
            WHERE
                c.contype = 'f' AND CAST(CAST(connamespace AS REGNAMESPACE) AS TEXT) = '{schema}'
        ) AS t
        GROUP BY
            t.table_schema,
            t.table_name
    ) AS t4
        ON t1.table_schema = t4.table_schema AND t1.table_name = t4.table_name
) AS t
GROUP BY
    t.table_schema
