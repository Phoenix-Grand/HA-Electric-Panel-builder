"""Home Assistant Panel Builder: shared inventory plus native dashboard card."""
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.helpers.storage import Store

from .api import async_register_api
from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION
from .model import validate_panel
from .repository import PanelRepository


async def async_setup(hass, config):
    repository = PanelRepository(Store(hass, STORAGE_VERSION, STORAGE_KEY), validate_panel)
    await repository.load()
    hass.data[DOMAIN] = {"repository": repository, "active": False}
    await hass.http.async_register_static_paths([
        StaticPathConfig("/panel_builder", str(Path(__file__).parent / "frontend"), False)
    ])
    async_register_api(hass)
    return True


async def async_setup_entry(hass, entry):
    hass.data[DOMAIN]["active"] = True
    return True


async def async_unload_entry(hass, entry):
    hass.data[DOMAIN]["active"] = False
    return True
