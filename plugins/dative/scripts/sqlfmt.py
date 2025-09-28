# -*- coding: utf-8 -*-
import argparse
import sys
from pathlib import Path

from sqlglot import transpile
from sqlglot.dialects.dialect import DIALECT_MODULE_NAMES
from sqlglot.errors import ParseError


def transpile_sql_file(file: Path, dialect: str) -> None:
    if dialect not in DIALECT_MODULE_NAMES:
        raise ValueError(f"Dialect {dialect} not supported")

    if not file.is_file() or not file.suffix == ".sql":
        print("Please specify a sql file")
        return

    sql_txt = file.read_text(encoding="utf-8")
    try:
        sqls = transpile(sql_txt, read=dialect, write=dialect, pretty=True, indent=4, pad=4)
        file.write_text(";\n\n".join(sqls) + "\n", encoding="utf-8")
    except ParseError as e:
        print(str(e))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="")
    parser.add_argument("files_or_dirs", nargs='+', type=str, default=None, help="files or directories")
    parser.add_argument('-d', '--dialect', type=str, help='输出文件')
    args = parser.parse_args()

    if args.files_or_dirs:
        for file_or_dir in args.files_or_dirs:
            fd = Path(file_or_dir)
            if fd.is_file():
                dialect = args.dialect or fd.stem.split(".")[-1]
                transpile_sql_file(fd, dialect)
            elif fd.is_dir():
                for sql_file in fd.glob("*.sql"):
                    dialect = args.dialect or sql_file.stem.split(".")[-1]
                    transpile_sql_file(sql_file, dialect)
            else:
                print(f"{file_or_dir} is not a sql file or a directory")
                sys.exit(3)
    else:
        print("Please specify a file or a directory")
        sys.exit(3)
