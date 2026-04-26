SELECT
    '{db_name}' AS db_name,
    JSON_GROUP_ARRAY(JSON_OBJECT('name', t.table_name, 'columns', t.columns)) AS tables
FROM (
    SELECT
        t.table_name,
        JSON_GROUP_OBJECT(
            t.column_name,
            JSON_OBJECT(
                'name', t.column_name,
                'default', t.column_default,
                'nullable', CASE WHEN t.is_nullable = 'YES' THEN TRUE ELSE FALSE END,
                'type', UPPER(t.data_type)
            )
        ) AS columns
    FROM information_schema.columns AS t
    GROUP BY
        t.table_name
) AS t
