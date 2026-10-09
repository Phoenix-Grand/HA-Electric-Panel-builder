"""Authenticated inventory API; only administrators can mutate panels."""
from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.helpers import device_registry as dr, entity_registry as er

from .const import DOMAIN
from .repository import ConflictError

ENERGY_UNITS = {"Wh", "kWh", "MWh", "GWh", "J", "kJ", "MJ", "GJ"}


def repository(hass):
    data = hass.data.get(DOMAIN)
    if not data or not data["active"]:
        raise ValueError("Panel Builder is not enabled. Add it under Settings > Devices & services")
    return data["repository"]


@websocket_api.websocket_command({"type": "panel_builder/list"})
@callback
def websocket_list(hass, connection, msg):
    try:
        connection.send_result(msg["id"], {"panels": repository(hass).list()})
    except ValueError as error:
        connection.send_error(msg["id"], "not_enabled", str(error))


@websocket_api.websocket_command({"type": "panel_builder/monitors"})
@callback
def websocket_monitors(hass, connection, msg):
    try:
        repository(hass)
    except ValueError as error:
        connection.send_error(msg["id"], "not_enabled", str(error))
        return
    registry = er.async_get(hass)
    devices = dr.async_get(hass)
    entities = []
    for state in hass.states.async_all("sensor"):
        if not connection.user.permissions.check_entity(state.entity_id, "read"):
            continue
        attributes = state.attributes
        measurement = attributes.get("device_class")
        unit = attributes.get("unit_of_measurement")
        if measurement not in ("energy", "power", "current"):
            measurement = "energy" if unit in ENERGY_UNITS else "power" if unit in ("W", "kW", "MW") else "current" if unit in ("A", "mA") else None
        if measurement is None:
            continue
        entry = registry.async_get(state.entity_id)
        device = devices.async_get(entry.device_id) if entry and entry.device_id else None
        entities.append({
            "entityId": state.entity_id,
            "name": attributes.get("friendly_name", state.entity_id),
            "measurement": measurement,
            "deviceId": entry.device_id or "" if entry else "",
            "deviceName": (device.name_by_user or device.name or "") if device else "",
        })
    entities.sort(key=lambda e: (e["deviceName"].casefold(), e["name"].casefold()))
    connection.send_result(msg["id"], {"entities": entities})


@websocket_api.websocket_command({"type": "panel_builder/save", "panel": dict})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save(hass, connection, msg):
    try:
        saved = await repository(hass).save(msg.get("panel"))
        connection.send_result(msg["id"], saved)
    except ConflictError as error:
        connection.send_error(msg["id"], "conflict", str(error))
    except (ValueError, TypeError) as error:
        connection.send_error(msg["id"], "invalid_panel", str(error))
    except OSError:
        connection.send_error(msg["id"], "save_failed", "Panel could not be written to Home Assistant storage")


@websocket_api.websocket_command({"type": "panel_builder/delete", "panel_id": str, "revision": int})
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_delete(hass, connection, msg):
    try:
        if not isinstance(msg.get("panel_id"), str) or type(msg.get("revision")) is not int or msg["revision"] < 1:
            raise ValueError("Panel ID and a positive integer revision are required")
        await repository(hass).delete(msg["panel_id"], msg["revision"])
        connection.send_result(msg["id"], {})
    except ConflictError as error:
        connection.send_error(msg["id"], "conflict", str(error))
    except ValueError as error:
        connection.send_error(msg["id"], "not_enabled", str(error))
    except OSError:
        connection.send_error(msg["id"], "save_failed", "Panel could not be deleted from storage")


@callback
def async_register_api(hass):
    for command in (websocket_list, websocket_monitors, websocket_save, websocket_delete):
        websocket_api.async_register_command(hass, command)
