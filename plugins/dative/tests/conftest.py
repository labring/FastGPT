# -*- coding: utf-8 -*-
import os
import sys
import time
from typing import Callable

import pytest

# 将 src 目录添加到 sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../src")))

# 注： pytest.fixture 与 unittest.TestCase 类 混合使用不兼容
if os.name != "nt":

    @pytest.fixture(scope="session", autouse=True)
    def setup_and_teardown():
        # Setup logic

        yield  # 运行测试

        # Teardown logic


def wait_until(condition_function: Callable, timeout=10):
    start_time = time.time()
    while not condition_function():
        if timeout is not None and time.time() - start_time > timeout:
            raise TimeoutError("Condition not met within the specified timeout")
        time.sleep(0.01)  # 短暂休眠以减少 CPU 使用
