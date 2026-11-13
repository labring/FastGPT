"""准备中文、英文、日文迁移验收语料；仅缓存公开数据，不连接业务数据库。

依赖：Python >= 3.9；Parquet 转换需要 pyarrow==21.0.0。
来源、原文件哈希和规范化文件哈希均由同目录 quality.datasets.json 固定。
"""

import argparse
import csv
import hashlib
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path


def file_sha256(path):
    """流式计算原文件或规范化语料的指纹，不将大文件完整复制进内存。"""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inputs_match(directory, dataset):
    """只有三份完整输入全部匹配固定哈希时才复用已转换缓存。"""
    return all(
        (directory / name).is_file()
        and file_sha256(directory / name) == expected
        for name, expected in dataset["inputs"].items()
    )


def download_file(source, path):
    """下载到临时文件并在发布缓存前校验；失败不得留下看似完整的缓存文件。"""
    if path.is_file() and file_sha256(path) == source["sha256"]:
        return
    temporary = path.with_suffix(".download")
    try:
        request = urllib.request.Request(
            source["url"], headers={"User-Agent": "FastGPT-migration-quality-test"}
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            with temporary.open("wb") as output:
                shutil.copyfileobj(response, output)
        if file_sha256(temporary) != source["sha256"]:
            raise ValueError("Downloaded file hash differs: " + source["url"])
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def convert_parquet(dataset, sources, destination):
    """将固定版本的 C-MTEB/NanoMIRACL 转为相同检索输入，保留全部发布记录。"""
    try:
        import pyarrow.parquet as parquet
    except ModuleNotFoundError as error:
        raise RuntimeError("Install pyarrow==21.0.0 to prepare Parquet datasets") from error

    nano = dataset["id"].startswith("nano-")
    id_field = "_id" if nano else "id"
    for part in ["corpus", "queries"]:
        with (destination / (part + ".jsonl")).open("w", encoding="utf-8", newline="\n") as output:
            for batch in parquet.ParquetFile(sources[part]).iter_batches(batch_size=1000):
                for row in batch.to_pylist():
                    record = {"_id": str(row[id_field]), "title": "", "text": row["text"]}
                    output.write(json.dumps(record, ensure_ascii=False) + "\n")

    with (destination / "qrels/test.tsv").open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output, delimiter="\t", lineterminator="\n")
        writer.writerow(["query-id", "corpus-id", "score"])
        for batch in parquet.ParquetFile(sources["qrels"]).iter_batches(batch_size=1000):
            for row in batch.to_pylist():
                writer.writerow(
                    [row["query-id"], row["corpus-id"], 1]
                    if nano else [row["qid"], row["pid"], row["score"]]
                )


def prepare_dataset(dataset, cache):
    """只读取固定来源并生成指定数据集目录，任一输入不匹配时拒绝验收。"""
    destination = cache / "datasets" / dataset["id"]
    if inputs_match(destination, dataset):
        print(dataset["id"] + ": verified cached inputs", flush=True)
        return
    (destination / "qrels").mkdir(parents=True, exist_ok=True)
    sources = {}
    for source in dataset["downloads"]:
        extension = ".zip" if source["part"] == "archive" else ".parquet"
        path = cache / "downloads" / (dataset["id"] + "-" + source["part"] + extension)
        download_file(source, path)
        sources[source["part"]] = path

    if dataset["format"] == "beir-zip":
        # 仅复制清单中的三个成员，不解压其他路径或数据集。
        with zipfile.ZipFile(sources["archive"]) as archive:
            for name in dataset["inputs"]:
                with archive.open(dataset["id"] + "/" + name) as source:
                    with (destination / name).open("wb") as output:
                        shutil.copyfileobj(source, output)
    else:
        convert_parquet(dataset, sources, destination)

    if not inputs_match(destination, dataset):
        raise ValueError("Normalized inputs differ from fixed dataset: " + dataset["id"])
    print(dataset["id"] + ": prepared and verified", flush=True)


def main():
    """显式准备全部六组验收数据；不会启动数据库或执行测试。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", required=True, type=Path)
    args = parser.parse_args()
    cache = args.cache_dir.expanduser().resolve()
    (cache / "downloads").mkdir(parents=True, exist_ok=True)
    datasets = json.loads(Path(__file__).with_name("quality.datasets.json").read_text(encoding="utf-8"))
    for dataset in datasets:
        prepare_dataset(dataset, cache)
    print("Verified 6 datasets for zh/en/ja: " + str(cache / "datasets"), flush=True)


if __name__ == "__main__":
    main()
