import duckdb

extensions = [
    "excel",
    "httpfs"
]
for ext in extensions:
    duckdb.install_extension(ext)
