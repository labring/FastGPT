#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.callbacks.stdout import get_name, StdOutCallbackHandler


async def root_func(root_arg: str, callbacks: Callbacks) -> str:
    cm, grp_cb = await new_group("root", {"root_inputs": root_arg}, callbacks)
    outputs = await parent_func(root_arg, grp_cb)
    await cm.on_chain_end(outputs={"root_outputs": outputs})
    return outputs


async def parent_func(parent_arg: str, callbacks: Callbacks) -> str:
    cm, grp_cb = await new_group("parent", {"parent_inputs": parent_arg}, callbacks)
    output1 = await child1_func(parent_arg, grp_cb)
    output2 = await child2_func(parent_arg, grp_cb)
    outputs = f"child1:{output1}, child2:{output2}"
    await cm.on_chain_end(outputs={"parent_outputs": outputs})
    return outputs


async def child1_func(child1_arg: str, callbacks: Callbacks) -> str:
    cm, _ = await new_group("child1", {"child1_inputs": child1_arg}, callbacks)
    try:
        assert child1_arg != "child1 error", "mock child1_func run error"
        outputs = "child1_outputs"
        await cm.on_chain_end(outputs={"child1_outputs": outputs})
        return outputs
    except Exception as e:
        await cm.on_chain_error(e)
        raise e


async def child2_func(child2_arg: str, callbacks: Callbacks) -> str:
    cm, _ = await new_group("child2", {"child2_inputs": child2_arg}, callbacks)
    outputs = "child2_outputs"
    try:
        assert child2_arg != "child2 error", "mock child2_func run error"

    except Exception as e:
        await cm.on_chain_error(e)
    await cm.on_chain_end(outputs={"child2_outputs": outputs})
    return outputs


class TestGetName(unittest.TestCase):
    def test_kwargs_name(self):
        name = get_name({}, name="test")
        self.assertEqual(name, "test")

    def test_serialized_name(self):
        name = get_name({"id": ["test"]})
        self.assertEqual(name, "test")

    def test_unknown_name(self):
        name = get_name({})
        self.assertEqual(name, "<unknown>")


class TestStdOutCallback(unittest.IsolatedAsyncioTestCase):
    async def test_all_success(self):
        handler = StdOutCallbackHandler()
        await root_func("all pass", [handler])

    async def test_child_error(self):
        handler = StdOutCallbackHandler()
        await root_func("child2 error", [handler])

    async def test_child_error_raise(self):
        handler = StdOutCallbackHandler()
        with self.assertRaises(AssertionError):
            await root_func("child1 error", [handler])
