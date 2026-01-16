SELECT
    t.table_schema,
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'name', t.table_name,
            'columns', t.columns,
            'primary_keys', COALESCE(t.primary_keys, JSON_ARRAY()),
            'foreign_keys', COALESCE(t.foreign_keys, JSON_ARRAY()),
            'comment', t.table_comment
        )
    ) AS tables
FROM (
    SELECT
        t1.table_schema,
        t1.table_name,
        t1.table_comment,
        t2.columns,
        t3.primary_keys,
        t4.foreign_keys
    FROM information_schema.tables AS t1
    JOIN (
        SELECT
            t.table_schema,
            t.table_name,
            JSON_OBJECTAGG(
                t.column_name, JSON_OBJECT(
                    'name', t.column_name,
                    'default', t.column_default,
                    'nullable', CASE WHEN t.is_nullable = 'YES' THEN CAST(TRUE AS JSON) ELSE CAST(FALSE AS JSON) END,
                    'type', UPPER(t.data_type),
                    'auto_increment', CASE
                        WHEN t.extra = 'auto_increment'
                        THEN CAST(TRUE AS JSON)
                        ELSE CAST(FALSE AS JSON)
                    END,
                    'comment', t.column_comment
                )
            ) AS columns
        FROM information_schema.columns AS t
        WHERE
            table_schema = '{db_name}'
        GROUP BY
            t.table_schema,
            t.table_name
    ) AS t2
        ON t1.table_schema = t2.table_schema AND t1.table_name = t2.table_name
    LEFT JOIN (
        SELECT
            kcu.table_schema,
            kcu.table_name,
            JSON_ARRAYAGG(kcu.column_name) AS primary_keys
        FROM information_schema.key_column_usage AS kcu
        JOIN information_schema.table_constraints AS tc
            ON kcu.table_schema = '{db_name}'
            AND kcu.constraint_name = tc.constraint_name
            AND kcu.constraint_schema = tc.constraint_schema
            AND kcu.table_name = tc.table_name
            AND tc.constraint_type = 'PRIMARY KEY'
        GROUP BY
            kcu.table_schema,
            kcu.table_name
    ) AS t3
        ON t1.table_schema = t3.table_schema AND t1.table_name = t3.table_name
    LEFT JOIN (
        SELECT
            kcu.table_schema,
            kcu.table_name,
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'name', kcu.constraint_name,
                    'column', kcu.column_name,
                    'referenced_schema', kcu.referenced_table_schema,
                    'referenced_table', kcu.referenced_table_name,
                    'referenced_column', kcu.referenced_column_name
                )
            ) AS foreign_keys
        FROM information_schema.key_column_usage AS kcu
        JOIN information_schema.table_constraints AS tc
            ON kcu.table_schema = '{db_name}'
            AND kcu.constraint_name = tc.constraint_name
            AND kcu.constraint_schema = tc.constraint_schema
            AND kcu.table_name = tc.table_name
            AND tc.constraint_type = 'FOREIGN KEY'
        GROUP BY
            kcu.table_schema,
            kcu.table_name
    ) AS t4
        ON t1.table_schema = t4.table_schema AND t1.table_name = t4.table_name
) AS t
GROUP BY
    t.table_schema
