"""Atomic persistence and optimistic concurrency for shared panel documents."""
import asyncio
from copy import deepcopy
from datetime import datetime, timezone


class ConflictError(Exception):
    """A stale editor must not overwrite a newer document."""


class PanelRepository:
    def __init__(self, store, validator):
        self.store = store
        self.validator = validator
        self.panels = {}
        self.lock = asyncio.Lock()

    async def load(self):
        data = await self.store.async_load()
        if data is not None:
            self.panels = {p["id"]: self.validator(p) for p in data["panels"]}

    def list(self):
        return deepcopy(sorted(self.panels.values(), key=lambda p: p["name"].casefold()))

    async def save(self, document):
        panel = self.validator(document)
        async with self.lock:
            old = self.panels.get(panel["id"])
            if panel["revision"] != (old["revision"] if old else 0):
                raise ConflictError("Another session changed this panel; export your edits and reload")
            if old is None and len(self.panels) >= 50:
                raise ValueError("At most 50 panels are supported")
            panel["revision"] += 1
            panel["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            candidate = {**self.panels, panel["id"]: panel}
            await self.store.async_save({"panels": list(candidate.values())})
            self.panels = candidate
            return deepcopy(panel)

    async def delete(self, panel_id, revision):
        async with self.lock:
            old = self.panels.get(panel_id)
            if old is None or old["revision"] != revision:
                raise ConflictError("The panel was changed or deleted by another session")
            candidate = {k: v for k, v in self.panels.items() if k != panel_id}
            await self.store.async_save({"panels": list(candidate.values())})
            self.panels = candidate
