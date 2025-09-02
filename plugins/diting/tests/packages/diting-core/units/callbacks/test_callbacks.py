import unittest
from unittest.mock import MagicMock
from uuid import uuid4

from diting_core.callbacks.base import (
    AsyncCallbackHandler,
    BaseCallbackManager,
    BaseCallbackHandler,
)
from diting_core.callbacks.manager import (
    AsyncCallbackManager,
    AsyncCallbackManagerForChainGroup,
    AsyncCallbackManagerForChainRun,
    new_group,
    ahandle_event,
)


class MockAsyncCallbackHandler(AsyncCallbackHandler):
    def __init__(self):
        self.on_chain_error_called = None
        self.on_chain_end_called = None
        self.on_chain_start_called = None

    async def on_chain_start(self, *args, **kwargs):
        self.on_chain_start_called = True

    async def on_chain_end(self, *args, **kwargs):
        self.on_chain_end_called = True

    async def on_chain_error(self, *args, **kwargs):
        self.on_chain_error_called = True


class TestBaseCallbackManager(unittest.TestCase):
    def test_add_remove_handler(self):
        handler = BaseCallbackHandler()
        cm = BaseCallbackManager(
            handlers=[handler],
        )
        self.assertIn(handler, cm.handlers)
        cm.remove_handler(handler)
        self.assertNotIn(handler, cm.handlers)

        cm.add_handler(handler)
        self.assertIn(handler, cm.handlers)

    def test_remove_metadata(self):
        cm = BaseCallbackManager(
            handlers=[],
            metadata={"test1": "meta", "test2": "meta2"},
        )
        self.assertEqual(cm.metadata, {"test1": "meta", "test2": "meta2"})
        cm.remove_metadata(["test1"])
        self.assertEqual(cm.metadata, {"test2": "meta2"})
        cm.remove_metadata(["test2"])
        self.assertEqual(cm.metadata, {})

    def test_remove_tags(self):
        cm = BaseCallbackManager(
            handlers=[],
            tags=["test1", "test2"],
        )
        self.assertEqual(cm.tags, ["test1", "test2"])
        cm.remove_tags(["test1"])
        self.assertEqual(cm.tags, ["test2"])
        cm.add_tags(["test2", "test3"])
        self.assertEqual(cm.tags, ["test2", "test3"])

        cm.remove_tags(["test2", "test3"])
        self.assertEqual(cm.tags, [])

    def test_set_handler(self):
        cm = BaseCallbackManager(handlers=[])
        new_handler = BaseCallbackHandler()
        cm.set_handler(new_handler)
        self.assertEqual(cm.handlers[0], new_handler)

    def test_is_async(self):
        cm = BaseCallbackManager(handlers=[])
        self.assertFalse(cm.is_async)


class TestAsyncCallbackManager(unittest.IsolatedAsyncioTestCase):
    async def test_configure(self):
        handler = MockAsyncCallbackHandler()
        cm = AsyncCallbackManager.configure(
            callbacks=[handler],
            tags=["test_tag"],
            metadata={"test": "meta"},
            verbose=False,
        )
        self.assertIn(handler, cm.handlers)
        self.assertIn("test_tag", cm.tags)
        self.assertIn("test", cm.metadata)

    async def test_add_remove_handler(self):
        cm = AsyncCallbackManager(handlers=[])
        handler = MockAsyncCallbackHandler()
        cm.add_handler(handler)
        self.assertIn(handler, cm.handlers)

        cm.remove_handler(handler)
        self.assertNotIn(handler, cm.handlers)

    async def test_set_handlers(self):
        cm = AsyncCallbackManager(handlers=[])
        new_handlers = [MockAsyncCallbackHandler() for _ in range(2)]
        cm.set_handlers(new_handlers)
        self.assertEqual(cm.handlers, new_handlers)

    async def test_add_tags(self):
        cm = AsyncCallbackManager(handlers=[])
        cm.add_tags(["tag1"])
        cm.add_tags(["tag2"])
        self.assertEqual(cm.tags, ["tag1", "tag2"])

    async def test_add_metadata(self):
        cm = AsyncCallbackManager(handlers=[])
        cm.add_metadata({"key1": "value1"})
        cm.add_metadata({"key2": "value2"})
        self.assertEqual(cm.metadata["key1"], "value1")
        self.assertEqual(cm.metadata["key2"], "value2")

    async def test_copy(self):
        handler = MockAsyncCallbackHandler()
        cm = AsyncCallbackManager(handlers=[handler])
        new_cm = cm.copy()
        self.assertTrue(cm.is_async)
        self.assertTrue(new_cm.is_async)
        self.assertTrue(cm.handlers == new_cm.handlers)

    async def test_on_chain_lifespan(self):
        handler = MockAsyncCallbackHandler()
        cm = AsyncCallbackManager(handlers=[handler])
        run_id = uuid4()
        rm = await cm.on_chain_start({}, {"input": "test"}, run_id=run_id)
        await rm.on_chain_end({})
        await rm.on_chain_error(ValueError("test"))
        self.assertTrue(handler.on_chain_start_called)
        self.assertTrue(handler.on_chain_end_called)
        self.assertTrue(handler.on_chain_error_called)

    async def test_get_child(self):
        parent_run_id = uuid4()
        cm = AsyncCallbackManagerForChainRun(
            run_id=uuid4(),
            parent_run_id=parent_run_id,
            handlers=[],
            tags=["parent_tag"],
            metadata={"parent": "meta"},
        )
        child = cm.get_child("child_tag")
        self.assertIsInstance(child, AsyncCallbackManager)
        self.assertEqual(child.parent_run_id, cm.run_id)
        self.assertIn("parent_tag", child.tags)
        self.assertIn("child_tag", child.tags)
        self.assertEqual(child.metadata, cm.metadata)

    async def test_asyc_chain_end(self):
        handler = MockAsyncCallbackHandler()
        cm = AsyncCallbackManagerForChainRun(
            run_id=uuid4(), parent_run_id=None, handlers=[handler], tags=[], metadata={}
        )
        await cm.on_chain_end({"output": "test"})
        self.assertTrue(handler.on_chain_end_called)

    async def test_chain_error(self):
        handler = MockAsyncCallbackHandler()
        cm = AsyncCallbackManagerForChainRun(
            run_id=uuid4(), parent_run_id=None, handlers=[handler], tags=[], metadata={}
        )
        await cm.on_chain_error(ValueError("test error"))
        self.assertTrue(handler.on_chain_error_called)

    async def test_group_cm_end(self):
        handler = MockAsyncCallbackHandler()
        group_cm = AsyncCallbackManagerForChainGroup(
            handlers=[handler],
            parent_run_id=uuid4(),
            parent_run_manager=AsyncCallbackManagerForChainRun(
                run_id=uuid4(),
                parent_run_id=None,
                handlers=[handler],
                tags=[],
                metadata={},
            ),
            tags=[],
            metadata={},
        )
        await group_cm.on_chain_end({"output": "test"})
        self.assertTrue(handler.on_chain_end_called)
        self.assertTrue(group_cm.ended)

    async def test_new_group(self):
        name = "test_group"
        inputs = {"test": "input"}
        handler = MockAsyncCallbackHandler()
        rm, group_cm = await new_group(
            name=name,
            inputs=inputs,
            callbacks=[handler],
            tags=["test_tag"],
            metadata={"test": "meta"},
        )
        self.assertIsInstance(rm, AsyncCallbackManagerForChainRun)
        self.assertIsInstance(group_cm, AsyncCallbackManagerForChainGroup)
        self.assertTrue(handler.on_chain_start_called)

    async def test_ahandle_event_with_errors(self):
        handler = MockAsyncCallbackHandler()
        handler.raise_error = True

        async def error_method(*args, **kwargs):
            raise RuntimeError("Test error")

        handler.on_chain_start = error_method
        with self.assertRaises(RuntimeError):
            await ahandle_event([handler], "on_chain_start", {}, {})

    async def test_not_implemented_error(self):
        class Nohandler(AsyncCallbackHandler):
            async def on_chain_start(self, *args, **kwargs):
                raise NotImplementedError("Not supported")

        handler = Nohandler()
        await ahandle_event([handler], "on_chain_start", {}, {})
        # Verify logger.warning is raised using patch

    async def test_async_group_end(self):
        handler = MagicMock()
        group_cm = AsyncCallbackManagerForChainGroup(
            handlers=[handler],
            parent_run_id=uuid4(),
            parent_run_manager=AsyncCallbackManagerForChainRun(
                run_id=uuid4(),
                parent_run_id=None,
                handlers=[handler],
                tags=[],
                metadata={},
            ),
            tags=[],
            metadata={},
        )
        await group_cm.on_chain_end({"out": "test"})
        self.assertTrue(group_cm.ended)
        handler.on_chain_end.assert_called()


if __name__ == "__main__":
    unittest.main()
