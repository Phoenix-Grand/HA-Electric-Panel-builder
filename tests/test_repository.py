"""Exercise validation and persistence without needing a running HA instance."""
import asyncio
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load_module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "custom_components" / "panel_builder" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


model = load_module("model")
repository = load_module("repository")


def panel():
    return json.loads((ROOT / "tests" / "fixtures" / "panel.json").read_text())


class MemoryStore:
    def __init__(self):
        self.data = None
        self.fail = False

    async def async_load(self):
        return deepcopy(self.data)

    async def async_save(self, data):
        await asyncio.sleep(0)
        if self.fail:
            raise OSError("Disk unavailable")
        self.data = deepcopy(data)


class ValidationTests(unittest.TestCase):
    def test_tandem_and_large_breaker(self):
        result = model.validate_panel(panel())
        self.assertEqual(result["breakers"][0]["circuits"][0]["amps"], 60)
        self.assertEqual(len(result["breakers"][1]["circuits"]), 2)

    def test_collision_overflow_and_dates(self):
        p = panel()
        p["breakers"][1]["start"] = 3
        with self.assertRaisesRegex(ValueError, "occupied"):
            model.validate_panel(p)
        p = panel()
        p["spaces"] = 2
        with self.assertRaisesRegex(ValueError, "past"):
            model.validate_panel(p)
        p = panel()
        p["breakers"][0]["circuits"][0]["notes"][0]["date"] = "2026-02-30"
        with self.assertRaisesRegex(ValueError, "date"):
            model.validate_panel(p)

    def test_reject_boolean_version_and_duplicate_primary(self):
        p = panel()
        p["version"] = True
        with self.assertRaises(ValueError):
            model.validate_panel(p)
        p = panel()
        a = deepcopy(p["breakers"][0]["circuits"][0]["assignments"][0])
        a.update(id="second", entityId="sensor.second_energy")
        p["breakers"][0]["circuits"][0]["assignments"].append(a)
        with self.assertRaisesRegex(ValueError, "primary"):
            model.validate_panel(p)

    def test_validation_does_not_mutate_import(self):
        p = panel()
        result = model.validate_panel(p)
        result["breakers"][0]["circuits"][0]["name"] = "Changed"
        self.assertEqual(p["breakers"][0]["circuits"][0]["name"], "Heat pump")


class RepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = MemoryStore()
        self.repo = repository.PanelRepository(self.store, model.validate_panel)
        await self.repo.load()

    async def test_save_reload_and_copy_isolation(self):
        saved = await self.repo.save(panel())
        self.assertEqual(saved["revision"], 1)
        self.assertTrue(saved["updatedAt"])
        second = repository.PanelRepository(self.store, model.validate_panel)
        await second.load()
        self.assertEqual(second.list()[0]["breakers"][0]["circuits"][0]["notes"][0]["text"], "Verified circuit labeling.")
        saved["name"] = "Mutated outside repository"
        self.assertEqual(self.repo.list()[0]["name"], "Test panel")

    async def test_concurrent_writers_cannot_overwrite(self):
        saved = await self.repo.save(panel())
        a, b = deepcopy(saved), deepcopy(saved)
        a["name"], b["name"] = "A", "B"
        results = await asyncio.gather(self.repo.save(a), self.repo.save(b), return_exceptions=True)
        self.assertEqual(sum(isinstance(r, repository.ConflictError) for r in results), 1)
        self.assertEqual(self.repo.list()[0]["revision"], 2)

    async def test_failed_save_keeps_old_memory_and_disk(self):
        saved = await self.repo.save(panel())
        old = deepcopy(self.store.data)
        saved["name"] = "Should not be saved"
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.repo.save(saved)
        self.assertEqual(self.repo.list()[0]["name"], "Test panel")
        self.assertEqual(self.store.data, old)

    async def test_stale_delete_and_failed_delete_keep_panel(self):
        saved = await self.repo.save(panel())
        with self.assertRaises(repository.ConflictError):
            await self.repo.delete(saved["id"], 99)
        self.store.fail = True
        with self.assertRaises(OSError):
            await self.repo.delete(saved["id"], 1)
        self.assertEqual(len(self.repo.list()), 1)
        self.store.fail = False
        await self.repo.delete(saved["id"], 1)
        self.assertEqual(self.repo.list(), [])

    async def test_deleted_document_cannot_be_recreated_by_a_stale_editor(self):
        saved = await self.repo.save(panel())
        await self.repo.delete(saved["id"], saved["revision"])
        with self.assertRaises(repository.ConflictError):
            await self.repo.save(saved)


if __name__ == "__main__":
    unittest.main()
