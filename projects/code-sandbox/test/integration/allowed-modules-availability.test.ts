import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/env';
import { ProcessPool } from '../../src/pool/process-pool';
import { PythonIsolatedRunner } from '../../src/isolated/python-isolated-runner';

type ModuleCase = {
  code: string;
  timeoutMs?: number;
};

const jsModuleCases: Record<string, ModuleCase> = {
  lodash: {
    code: `async function main() {
      const _ = require('lodash');
      return { ok: _.sum([1, 2, 3]) === 6 };
    }`
  },
  dayjs: {
    code: `async function main() {
      const dayjs = require('dayjs');
      return { ok: dayjs('2024-01-01').add(1, 'day').format('YYYY-MM-DD') === '2024-01-02' };
    }`
  },
  moment: {
    code: `async function main() {
      const moment = require('moment');
      return { ok: moment.utc('2024-01-01').add(1, 'day').format('YYYY-MM-DD') === '2024-01-02' };
    }`
  },
  uuid: {
    code: `async function main() {
      const { v5, validate } = require('uuid');
      return { ok: validate(v5('fastgpt', v5.URL)) };
    }`
  },
  'crypto-js': {
    code: `async function main() {
      const CryptoJS = require('crypto-js');
      return { ok: CryptoJS.SHA256('fastgpt').toString().length === 64 };
    }`
  },
  qs: {
    code: `async function main() {
      const qs = require('qs');
      return { ok: qs.parse('a%5Bb%5D=1').a.b === '1' };
    }`
  },
  url: {
    code: `async function main() {
      const url = require('url');
      const parsed = url.parse('https://example.com/a?b=1', true);
      return { ok: parsed.hostname === 'example.com' && parsed.query.b === '1' };
    }`
  },
  querystring: {
    code: `async function main() {
      const querystring = require('querystring');
      return { ok: querystring.parse('a=1').a === '1' };
    }`
  }
};

const pythonModuleCases: Record<string, ModuleCase> = {
  math: { code: `import math\ndef main():\n    return {'ok': math.sqrt(9) == 3}` },
  cmath: { code: `import cmath\ndef main():\n    return {'ok': cmath.sqrt(-1) == 1j}` },
  decimal: {
    code: `import decimal\ndef main():\n    return {'ok': str(decimal.Decimal('0.1') + decimal.Decimal('0.2')) == '0.3'}`
  },
  fractions: {
    code: `import fractions\ndef main():\n    return {'ok': str(fractions.Fraction(1, 3) + fractions.Fraction(1, 6)) == '1/2'}`
  },
  random: {
    code: `import random\ndef main():\n    random.seed(1)\n    return {'ok': random.randint(1, 10) == 3}`
  },
  statistics: {
    code: `import statistics\ndef main():\n    return {'ok': statistics.mean([1, 2, 3]) == 2}`
  },
  collections: {
    code: `import collections\ndef main():\n    return {'ok': collections.Counter(['a', 'a'])['a'] == 2}`
  },
  array: {
    code: `import array\ndef main():\n    return {'ok': array.array('i', [1, 2]).tolist() == [1, 2]}`
  },
  heapq: {
    code: `import heapq\ndef main():\n    h = [3, 1, 2]\n    heapq.heapify(h)\n    return {'ok': heapq.heappop(h) == 1}`
  },
  bisect: {
    code: `import bisect\ndef main():\n    return {'ok': bisect.bisect_left([1, 3, 5], 3) == 1}`
  },
  queue: {
    code: `import queue\ndef main():\n    q = queue.Queue()\n    q.put('ok')\n    return {'ok': q.get() == 'ok'}`
  },
  copy: {
    code: `import copy\ndef main():\n    a = {'x': [1]}\n    b = copy.deepcopy(a)\n    b['x'].append(2)\n    return {'ok': a['x'] == [1]}`
  },
  itertools: {
    code: `import itertools\ndef main():\n    return {'ok': list(itertools.combinations([1, 2, 3], 2))[0] == (1, 2)}`
  },
  functools: {
    code: `import functools\ndef main():\n    return {'ok': functools.reduce(lambda a, b: a + b, [1, 2, 3], 0) == 6}`
  },
  operator: {
    code: `import operator\ndef main():\n    return {'ok': operator.itemgetter('a')({'a': 1}) == 1}`
  },
  string: {
    code: `import string\ndef main():\n    return {'ok': string.ascii_lowercase[:3] == 'abc'}`
  },
  re: {
    code: `import re\ndef main():\n    return {'ok': re.search(r'\\d+', 'a123').group(0) == '123'}`
  },
  difflib: {
    code: `import difflib\ndef main():\n    return {'ok': list(difflib.ndiff(['a'], ['b']))[0][0] == '-'}`
  },
  textwrap: {
    code: `import textwrap\ndef main():\n    return {'ok': textwrap.shorten('hello world', width=8, placeholder='...') == 'hello...'}`
  },
  unicodedata: {
    code: `import unicodedata\ndef main():\n    return {'ok': unicodedata.name('A') == 'LATIN CAPITAL LETTER A'}`
  },
  codecs: {
    code: `import codecs\ndef main():\n    return {'ok': codecs.decode(b'Zm9v', 'base64').decode() == 'foo'}`
  },
  datetime: {
    code: `import datetime\ndef main():\n    return {'ok': datetime.datetime(2024, 1, 1).year == 2024}`
  },
  time: { code: `import time\ndef main():\n    return {'ok': isinstance(time.time(), float)}` },
  calendar: {
    code: `import calendar\ndef main():\n    return {'ok': calendar.monthrange(2024, 2)[1] == 29}`
  },
  _strptime: {
    code: `import _strptime\ndef main():\n    return {'ok': _strptime._strptime_time('2024-01-02', '%Y-%m-%d').tm_year == 2024}`
  },
  json: { code: `import json\ndef main():\n    return {'ok': json.loads('{"a":1}')['a'] == 1}` },
  csv: {
    code: `import csv, io\ndef main():\n    s = io.StringIO()\n    csv.writer(s).writerow(['a', 'b'])\n    return {'ok': s.getvalue().strip() == 'a,b'}`
  },
  base64: {
    code: `import base64\ndef main():\n    return {'ok': base64.b64encode(b'ok').decode() == 'b2s='}`
  },
  binascii: {
    code: `import binascii\ndef main():\n    return {'ok': binascii.hexlify(b'ok').decode() == '6f6b'}`
  },
  struct: {
    code: `import struct\ndef main():\n    return {'ok': struct.unpack('>I', bytes([0, 0, 0, 42]))[0] == 42}`
  },
  hashlib: {
    code: `import hashlib\ndef main():\n    return {'ok': hashlib.sha256(b'fastgpt').hexdigest().startswith('046ca27')}`
  },
  hmac: {
    code: `import hmac, hashlib\ndef main():\n    return {'ok': len(hmac.new(b'k', b'v', hashlib.sha256).hexdigest()) == 64}`
  },
  secrets: {
    code: `import secrets\ndef main():\n    return {'ok': len(secrets.token_hex(4)) == 8}`
  },
  uuid: {
    code: `import uuid\ndef main():\n    return {'ok': str(uuid.uuid5(uuid.NAMESPACE_DNS, 'fastgpt')) == '8df8855a-2990-5a63-831d-be4be1d105bb'}`
  },
  typing: {
    code: `import typing\ndef main():\n    return {'ok': str(typing.List[int]) == 'typing.List[int]'}`
  },
  abc: {
    code: `import abc\nclass Base(metaclass=abc.ABCMeta): pass\ndef main():\n    return {'ok': isinstance(Base, abc.ABCMeta)}`
  },
  enum: {
    code: `import enum\nclass Color(enum.Enum):\n    RED = 1\ndef main():\n    return {'ok': Color.RED.name == 'RED'}`
  },
  dataclasses: {
    code: `import dataclasses\n@dataclasses.dataclass\nclass Item:\n    name: str\ndef main():\n    return {'ok': dataclasses.asdict(Item('ok')) == {'name': 'ok'}}`
  },
  contextlib: {
    code: `import contextlib\ndef main():\n    with contextlib.suppress(ValueError):\n        int('x')\n    return {'ok': True}`
  },
  pprint: {
    code: `import pprint\ndef main():\n    return {'ok': "'a': 1" in pprint.pformat({'b': 2, 'a': 1})}`
  },
  weakref: {
    code: `import weakref\nclass Box: pass\ndef main():\n    b = Box()\n    r = weakref.ref(b)\n    return {'ok': r() is b}`
  },
  numpy: {
    code: `import numpy as np\ndef main():\n    a = np.array([[1, 2, 3], [4, 5, 6]])\n    return {'ok': list(a.shape) == [2, 3] and float(a.mean()) == 3.5 and int(np.dot(np.array([1, 2, 3]), np.array([4, 5, 6]))) == 32}`
  },
  pandas: {
    code: `import pandas as pd\ndef main():\n    df = pd.DataFrame([{'team': 'a', 'score': 1}, {'team': 'a', 'score': 3}, {'team': 'b', 'score': 2}])\n    grouped = df.groupby('team')['score'].sum().to_dict()\n    return {'ok': int(grouped['a']) == 4 and int(grouped['b']) == 2}`
  },
  matplotlib: {
    code: `import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\ndef main():\n    fig, ax = plt.subplots(figsize=(2, 1))\n    ax.plot([1, 2, 3], [1, 4, 9])\n    axes_count = len(fig.axes)\n    plt.close(fig)\n    return {'ok': bool(matplotlib.__version__) and matplotlib.get_backend().lower() == 'agg' and axes_count == 1}`,
    timeoutMs: 30000
  }
};

function expectSameMembers(actual: readonly string[], expected: Record<string, unknown>) {
  expect([...actual].sort()).toEqual(Object.keys(expected).sort());
}

describe('Sandbox allowed modules availability', () => {
  let jsPool: ProcessPool;
  let pyRunner: PythonIsolatedRunner;

  beforeAll(async () => {
    jsPool = new ProcessPool(1);
    await jsPool.init();
    pyRunner = new PythonIsolatedRunner(1);
    await pyRunner.init();
  });

  afterAll(async () => {
    await jsPool?.shutdown();
    await pyRunner?.shutdown();
  });

  it('JS 白名单中的每个模块都有本地可用性用例', () => {
    expectSameMembers(env.SANDBOX_JS_ALLOWED_MODULES, jsModuleCases);
  });

  it('Python 白名单中的每个模块都有本地可用性用例', () => {
    expectSameMembers(env.SANDBOX_PYTHON_ALLOWED_MODULES, pythonModuleCases);
  });

  it.each(env.SANDBOX_JS_ALLOWED_MODULES)(
    'JS 白名单模块 %s 可 require 并执行',
    async (moduleName) => {
      const result = await jsPool.execute({
        code: jsModuleCases[moduleName].code,
        variables: {},
        timeoutMs: jsModuleCases[moduleName].timeoutMs
      });

      expect(result.success, result.message).toBe(true);
      expect(result.data?.codeReturn?.ok).toBe(true);
    }
  );

  it.each(env.SANDBOX_PYTHON_ALLOWED_MODULES)(
    'Python 白名单模块 %s 可 import 并执行',
    async (moduleName) => {
      const result = await pyRunner.execute({
        code: pythonModuleCases[moduleName].code,
        variables: {},
        timeoutMs: pythonModuleCases[moduleName].timeoutMs
      });

      expect(result.success, result.message).toBe(true);
      expect(result.data?.codeReturn?.ok).toBe(true);
    }
  );
});
