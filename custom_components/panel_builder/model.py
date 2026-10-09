"""Panel document validation, independent of Home Assistant."""
from copy import deepcopy
from datetime import date
import json
import re

SHAPES = {"single": (1, 1), "double": (2, 1), "triple": (3, 1), "tandem": (1, 2), "quad": (2, 2)}
ID_RE = re.compile(r"[a-zA-Z0-9_-]{1,64}\Z")
ENTITY_RE = re.compile(r"sensor\.[a-z0-9_]+\Z")


def validate_panel(value):
    """Validate imports and API writes; never trust frontend-only validation."""
    if not isinstance(value, dict) or type(value.get("version")) is not int or value.get("version") != 1:
        raise ValueError("Unsupported panel document version")
    if len(json.dumps(value, allow_nan=False)) > 2_000_000:
        raise ValueError("Panel document exceeds 2 MB")
    panel = deepcopy(value)
    identifiers = set()

    def identifier(item, label):
        if not isinstance(item, str) or not ID_RE.fullmatch(item) or item in identifiers:
            raise ValueError(f"{label} must have a unique valid ID")
        identifiers.add(item)

    def text(item, maximum, label, required=False):
        if not isinstance(item, str) or len(item) > maximum or (required and not item.strip()):
            raise ValueError(f"Invalid {label}")

    def integer(item, minimum, maximum, label):
        if type(item) is not int or not minimum <= item <= maximum:
            raise ValueError(f"{label} must be an integer from {minimum} to {maximum}")

    def dated(item, label, required=False):
        text(item, 10, label, required)
        if item:
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", item) or date.fromisoformat(item).isoformat() != item:
                    raise ValueError
            except ValueError as error:
                raise ValueError(f"Invalid {label}") from error

    identifier(panel.get("id"), "Panel")
    text(panel.get("name"), 80, "panel name", True)
    text(panel.get("location"), 120, "location")
    text(panel.get("manufacturer"), 120, "manufacturer")
    integer(panel.get("spaces"), 1, 120, "Panel spaces")
    integer(panel.get("mainAmps"), 1, 1000, "Main amp rating")
    integer(panel.get("revision"), 0, 9007199254740991, "Revision")
    text(panel.get("updatedAt"), 40, "updated timestamp")
    breakers = panel.get("breakers")
    if not isinstance(breakers, list) or len(breakers) > 120:
        raise ValueError("Invalid breaker list")
    occupied = set()
    for breaker in breakers:
        if not isinstance(breaker, dict):
            raise ValueError("Invalid breaker")
        identifier(breaker.get("id"), "Breaker")
        integer(breaker.get("start"), 1, panel["spaces"], "Starting space")
        integer(breaker.get("spaces"), 1, 6, "Breaker footprint")
        kind = breaker.get("kind")
        if not isinstance(kind, str) or kind not in {*SHAPES, "custom"}:
            raise ValueError("Unknown breaker type")
        circuits = breaker.get("circuits")
        if not isinstance(circuits, list) or not 1 <= len(circuits) <= 6:
            raise ValueError("Invalid circuit list")
        if kind != "custom" and (breaker["spaces"], len(circuits)) != SHAPES[kind]:
            raise ValueError("Breaker type and footprint do not match")
        for slot in range(breaker["start"], breaker["start"] + breaker["spaces"] * 2, 2):
            if slot > panel["spaces"]:
                raise ValueError(f"Breaker at space {breaker['start']} extends past the panel")
            if slot in occupied:
                raise ValueError(f"Space {slot} is already occupied")
            occupied.add(slot)
        for circuit in circuits:
            if not isinstance(circuit, dict):
                raise ValueError("Invalid circuit")
            identifier(circuit.get("id"), "Circuit")
            text(circuit.get("name"), 100, "circuit name", True)
            integer(circuit.get("amps"), 1, 1000, "Circuit amp rating")
            dated(circuit.get("verifiedOn"), "verification date")
            notes = circuit.get("notes")
            if not isinstance(notes, list) or len(notes) > 100:
                raise ValueError("Invalid notes list")
            for note in notes:
                if not isinstance(note, dict):
                    raise ValueError("Invalid note")
                identifier(note.get("id"), "Note")
                text(note.get("text"), 4000, "note", True)
                dated(note.get("date"), "note date", True)
            assignments = circuit.get("assignments")
            if not isinstance(assignments, list) or len(assignments) > 30:
                raise ValueError("Invalid assignments list")
            entities, primary = set(), set()
            for assignment in assignments:
                if not isinstance(assignment, dict):
                    raise ValueError("Invalid monitor assignment")
                identifier(assignment.get("id"), "Assignment")
                entity_id = assignment.get("entityId")
                if not isinstance(entity_id, str) or not ENTITY_RE.fullmatch(entity_id):
                    raise ValueError("Invalid sensor entity ID")
                if entity_id in entities:
                    raise ValueError("Entity is already assigned to this circuit")
                entities.add(entity_id)
                if assignment.get("role") not in ("circuit", "comparison", "device"):
                    raise ValueError("Unknown monitor role")
                measurement = assignment.get("measurement")
                if measurement not in ("energy", "power", "current"):
                    raise ValueError("Unknown measurement")
                if assignment["role"] == "circuit":
                    if measurement in primary:
                        raise ValueError("Only one primary whole-circuit sensor per measurement is allowed")
                    primary.add(measurement)
                text(assignment.get("label"), 120, "monitor label")
                text(assignment.get("deviceId"), 64, "device ID")
    return panel
