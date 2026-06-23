import { describe, expect, it } from 'vitest';

const baseUrl = process.env.CODE_SANDBOX_URL?.replace(/\/$/, '');
const token = process.env.SANDBOX_TOKEN || '';
const shouldRun = Boolean(baseUrl);

type SandboxResponse = {
  success: boolean;
  data?: {
    codeReturn?: any;
    log?: string;
  };
  message?: string;
};

async function runPython(code: string, variables: Record<string, any> = {}) {
  if (!baseUrl) throw new Error('CODE_SANDBOX_URL is required');

  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}/sandbox/python`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      code,
      variables,
      timeoutMs: 30000
    })
  });

  const json = (await res.json()) as SandboxResponse;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (!json.success) {
    throw new Error(json.message || JSON.stringify(json));
  }
  return json;
}

describe.skipIf(!shouldRun)('Docker Python 预装包集成测试', () => {
  it('health ready', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('数学和数值计算标准库均可 import 并运行', async () => {
    const result = await runPython(`
import math
import cmath
import decimal
import fractions
import random
import statistics

def main():
    random.seed(1)
    return {
        "math": math.isclose(math.sqrt(9), 3),
        "cmath": cmath.sqrt(-1) == 1j,
        "decimal": str(decimal.Decimal("0.1") + decimal.Decimal("0.2")),
        "fractions": str(fractions.Fraction(1, 3) + fractions.Fraction(1, 6)),
        "random": random.randint(1, 10),
        "statistics": statistics.mean([1, 2, 3, 4])
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toMatchObject({
      math: true,
      cmath: true,
      decimal: '0.3',
      fractions: '1/2',
      random: 3,
      statistics: 2.5
    });
  });

  it('数据结构和算法标准库均可 import 并运行', async () => {
    const result = await runPython(`
import collections
import array
import heapq
import bisect
import queue
import copy

def main():
    counter = collections.Counter(["a", "b", "a"])
    arr = array.array("i", [1, 2, 3])
    heap = [3, 1, 2]
    heapq.heapify(heap)
    q = queue.Queue()
    q.put("ok")
    original = {"a": [1]}
    cloned = copy.deepcopy(original)
    cloned["a"].append(2)
    return {
        "collections": counter["a"],
        "array": arr.tolist(),
        "heapq": heapq.heappop(heap),
        "bisect": bisect.bisect_left([1, 3, 5], 3),
        "queue": q.get(),
        "copy": original["a"]
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      collections: 2,
      array: [1, 2, 3],
      heapq: 1,
      bisect: 1,
      queue: 'ok',
      copy: [1]
    });
  });

  it('函数式编程标准库均可 import 并运行', async () => {
    const result = await runPython(`
import itertools
import functools
import operator

def main():
    pairs = list(itertools.combinations([1, 2, 3], 2))
    total = functools.reduce(operator.add, [1, 2, 3], 0)
    picked = operator.itemgetter("name")({"name": "FastGPT"})
    return {"itertools": pairs, "functools": total, "operator": picked}
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      itertools: [
        [1, 2],
        [1, 3],
        [2, 3]
      ],
      functools: 6,
      operator: 'FastGPT'
    });
  });

  it('字符串和文本处理标准库均可 import 并运行', async () => {
    const result = await runPython(`
import string
import re
import difflib
import textwrap
import unicodedata
import codecs

def main():
    return {
        "string": string.ascii_lowercase[:3],
        "re": re.search(r"\\d+", "a123").group(0),
        "difflib": list(difflib.ndiff(["a"], ["b"]))[0][0],
        "textwrap": textwrap.shorten("hello world", width=8, placeholder="..."),
        "unicodedata": unicodedata.name("A"),
        "codecs": codecs.decode(b"Zm9v", "base64").decode()
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      string: 'abc',
      re: '123',
      difflib: '-',
      textwrap: 'hello...',
      unicodedata: 'LATIN CAPITAL LETTER A',
      codecs: 'foo'
    });
  });

  it('日期和时间标准库均可 import 并运行', async () => {
    const result = await runPython(`
import datetime
import time
import calendar

def main():
    dt = datetime.datetime(2024, 1, 15, 12, 0, 0)
    return {
        "datetime": dt.isoformat(),
        "time": isinstance(time.time(), float),
        "calendar": calendar.monthrange(2024, 2)[1]
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      datetime: '2024-01-15T12:00:00',
      time: true,
      calendar: 29
    });
  });

  it('数据序列化标准库均可 import 并运行', async () => {
    const result = await runPython(`
import json
import csv
import base64
import binascii
import struct
import io

def main():
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["a", "b"])
    return {
        "json": json.loads('{"a": 1}')["a"],
        "csv": out.getvalue().strip(),
        "base64": base64.b64encode(b"ok").decode(),
        "binascii": binascii.hexlify(b"ok").decode(),
        "struct": struct.unpack(">I", bytes([0, 0, 0, 42]))[0]
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn).toEqual({
      json: 1,
      csv: 'a,b',
      base64: 'b2s=',
      binascii: '6f6b',
      struct: 42
    });
  });

  it('加密和哈希标准库均可 import 并运行', async () => {
    const result = await runPython(`
import hashlib
import hmac
import secrets
import uuid

def main():
    token = secrets.token_hex(4)
    return {
        "hashlib": hashlib.sha256(b"fastgpt").hexdigest(),
        "hmac": hmac.new(b"k", b"v", hashlib.sha256).hexdigest(),
        "secrets_len": len(token),
        "uuid": str(uuid.uuid5(uuid.NAMESPACE_DNS, "fastgpt"))
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.hashlib).toBe(
      '046ca27ed8a95d7aaec3fd577ba8d9eabd7f7915de4e7c0e120d06d758bff75a'
    );
    expect(result.data?.codeReturn.hmac).toBeTruthy();
    expect(result.data?.codeReturn.secrets_len).toBe(8);
    expect(result.data?.codeReturn.uuid).toBe('8df8855a-2990-5a63-831d-be4be1d105bb');
  });

  it('类型和抽象标准库均可 import 并运行', async () => {
    const result = await runPython(`
import typing
import abc
import enum
import dataclasses
import contextlib

class Color(enum.Enum):
    RED = 1

@dataclasses.dataclass
class Item:
    name: str

class Base(metaclass=abc.ABCMeta):
    pass

def main():
    with contextlib.suppress(ValueError):
        int("x")
    hint = typing.List[int]
    return {
        "typing": str(hint),
        "abc": isinstance(Base, abc.ABCMeta),
        "enum": Color.RED.name,
        "dataclasses": dataclasses.asdict(Item("ok")),
        "contextlib": True
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.abc).toBe(true);
    expect(result.data?.codeReturn.enum).toBe('RED');
    expect(result.data?.codeReturn.dataclasses).toEqual({ name: 'ok' });
    expect(result.data?.codeReturn.contextlib).toBe(true);
  });

  it('其他实用工具标准库均可 import 并运行', async () => {
    const result = await runPython(`
import pprint
import weakref

class Box:
    pass

def main():
    box = Box()
    ref = weakref.ref(box)
    return {
        "pprint": pprint.pformat({"b": 2, "a": 1}),
        "weakref": ref() is box
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.pprint).toContain("'a': 1");
    expect(result.data?.codeReturn.weakref).toBe(true);
  });

  it('numpy 可 import 并执行基础矩阵运算', async () => {
    const result = await runPython(`
import numpy as np

def main():
    arr = np.array([[1, 2, 3], [4, 5, 6]])
    return {
        "version": np.__version__,
        "shape": list(arr.shape),
        "mean": float(arr.mean()),
        "dot": int(np.dot(np.array([1, 2, 3]), np.array([4, 5, 6])))
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.shape).toEqual([2, 3]);
    expect(result.data?.codeReturn.mean).toBe(3.5);
    expect(result.data?.codeReturn.dot).toBe(32);
    expect(result.data?.codeReturn.version).toBeTruthy();
  });

  it('pandas 可 import 并执行 DataFrame 基础操作', async () => {
    const result = await runPython(`
import pandas as pd

def main():
    df = pd.DataFrame([
        {"team": "a", "score": 1},
        {"team": "a", "score": 3},
        {"team": "b", "score": 2}
    ])
    grouped = df.groupby("team")["score"].sum().to_dict()
    return {
        "version": pd.__version__,
        "rows": int(len(df)),
        "a": int(grouped["a"]),
        "b": int(grouped["b"])
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.rows).toBe(3);
    expect(result.data?.codeReturn.a).toBe(4);
    expect(result.data?.codeReturn.b).toBe(2);
    expect(result.data?.codeReturn.version).toBeTruthy();
  });

  it('matplotlib 可使用 Agg 后端生成 PNG', async () => {
    const result = await runPython(`
import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

def main():
    fig, ax = plt.subplots(figsize=(2, 1))
    ax.plot([1, 2, 3], [2, 4, 6])
    ax.set_title("ok")
    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    data = buf.getvalue()
    return {
        "backend": matplotlib.get_backend(),
        "size": len(data),
        "png": data[:8].hex()
    }
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.backend.toLowerCase()).toContain('agg');
    expect(result.data?.codeReturn.size).toBeGreaterThan(1000);
    expect(result.data?.codeReturn.png).toBe('89504e470d0a1a0a');
  });

  it('预装包间接暴露 os 时仍不能执行系统命令', async () => {
    const result = await runPython(`
import platform

def main():
    os_ref = getattr(platform, "os")
    try:
        rc = os_ref.system("id")
        return {"blocked": rc != 0, "rc": rc}
    except Exception as e:
        return {"blocked": True, "error": str(e)}
`);

    expect(result.success).toBe(true);
    expect(result.data?.codeReturn.blocked).toBe(true);
  });
});
