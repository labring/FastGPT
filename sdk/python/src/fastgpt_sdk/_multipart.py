"""multipart/form-data 上传形态归一化与协议构造工具。"""

from __future__ import annotations

import json
import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .errors import FastGPTBadRequestError
from .options import MultipartMode, is_readable_binary_stream

MultipartFileTuple = (
    tuple[str, bytes] | tuple[str, bytes, str] | tuple[str, Any] | tuple[str, Any, str]
)


def _coerce_file_content(
    content: Any,
    fallback_filename: str,
) -> tuple[str, bytes | Any]:
    if isinstance(content, bytes):
        return fallback_filename, content
    if isinstance(content, bytearray):
        return fallback_filename, bytes(content)
    if isinstance(content, Path):
        if not content.is_file():
            raise FastGPTBadRequestError(f"Upload file path does not exist: {content}")
        return content.name or fallback_filename, content.read_bytes()
    if is_readable_binary_stream(content):
        raw_name = getattr(content, "name", None)
        filename = (
            os.path.basename(raw_name)
            if isinstance(raw_name, str) and len(raw_name) > 0
            else fallback_filename
        )
        return filename, content
    raise FastGPTBadRequestError(
        "Invalid file upload input: expected bytes, bytearray, Path, readable binary stream, "
        "or (filename, content[, content_type]) tuple"
    )


def normalize_uploadable(
    value: Any,
    *,
    fallback_filename: str = "upload.bin",
) -> MultipartFileTuple:
    """将 bytes / Path / IO[bytes] / (filename, content[, content_type]) 统一为 httpx file
    tuple。"""
    if isinstance(value, tuple):
        if len(value) not in (2, 3) or not isinstance(value[0], str) or len(value[0]) == 0:
            raise FastGPTBadRequestError(
                "Invalid file tuple upload input: expected (filename, content) or "
                "(filename, content, content_type)"
            )
        filename = value[0]
        _, content_obj = _coerce_file_content(value[1], filename)
        if len(value) == 3:
            if not isinstance(value[2], str) or len(value[2]) == 0:
                raise FastGPTBadRequestError("File tuple content_type must be a non-empty string")
            return (filename, content_obj, value[2])
        return (filename, content_obj)

    filename, content_obj = _coerce_file_content(value, fallback_filename)
    return (filename, content_obj)


def _append_upload_field(
    files: list[tuple[str, MultipartFileTuple]],
    field_name: str,
    value: Any,
) -> None:
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray, str, tuple)):
        items = list(value)
    else:
        items = [value]
    for item in items:
        files.append((field_name, normalize_uploadable(item)))


def build_multipart_payload(
    *,
    payload: dict[str, Any],
    mode: MultipartMode,
) -> tuple[list[tuple[str, MultipartFileTuple]], dict[str, str]]:
    """根据契约 multipart_mode 构造 httpx 兼容的 ``files`` 与 ``data`` 字段集合。"""
    files: list[tuple[str, MultipartFileTuple]] = []
    data: dict[str, str] = {}

    if mode == "fileAndJsonData":
        file_val = payload.get("file")
        if file_val is None:
            raise FastGPTBadRequestError('Multipart upload requires a non-None "file" field')
        _append_upload_field(files, "file", file_val)

        json_data = {k: v for k, v in payload.items() if k != "file"}
        data["data"] = json.dumps(json_data, ensure_ascii=False, separators=(",", ":"))
        return files, data

    for key, val in payload.items():
        if val is None:
            continue
        if key == "file":
            _append_upload_field(files, "file", val)
        elif isinstance(val, bool):
            data[key] = "true" if val else "false"
        elif isinstance(val, (str, int, float)):
            data[key] = str(val)
        else:
            data[key] = json.dumps(val, ensure_ascii=False, separators=(",", ":"))

    return files, data
