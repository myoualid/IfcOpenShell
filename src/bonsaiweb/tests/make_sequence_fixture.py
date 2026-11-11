# This file was generated with the assistance of an AI coding tool.
#
# Writes sequence_4d.ifc and sequence_4d.json next to this file. The IFC is
# built with ifcopenshell.api; the JSON holds what ifcopenshell.util.sequence
# returns for it, so tests/sequence.test.mjs checks the JavaScript port of
# those helpers against Python.
#
#   python tests/make_sequence_fixture.py

import json
from pathlib import Path

import ifcopenshell
import ifcopenshell.api.context
import ifcopenshell.api.root
import ifcopenshell.api.sequence
import ifcopenshell.api.unit
import ifcopenshell.util.date
import ifcopenshell.util.sequence

HERE = Path(__file__).parent

f = ifcopenshell.file(schema="IFC4")
project = ifcopenshell.api.root.create_entity(f, ifc_class="IfcProject", name="Planning fixture")
ifcopenshell.api.unit.assign_unit(f)
ifcopenshell.api.context.add_context(f, context_type="Model")


def wall(name):
    return ifcopenshell.api.root.create_entity(f, ifc_class="IfcWall", name=name)


def task(name, identification, schedule=None, parent=None, start=None, finish=None, duration=None, critical=None):
    t = ifcopenshell.api.sequence.add_task(
        f, work_schedule=schedule, parent_task=parent, name=name, identification=identification
    )
    if start or finish or duration:
        tt = ifcopenshell.api.sequence.add_task_time(f, task=t)
        tt.ScheduleStart = start
        tt.ScheduleFinish = finish
        tt.ScheduleDuration = duration
        if critical is not None:
            tt.IsCritical = critical
    return t


walls = [wall(f"Wall {i}") for i in range(1, 5)]

schedule = ifcopenshell.api.sequence.add_work_schedule(f, name="Construction", predefined_type="PLANNED")
root = task("Construction", "C", schedule=schedule)
shell = task("Shell", "C.1", parent=root)
excavate = task(
    "Excavation",
    "C.1.1",
    parent=shell,
    start="2024-01-08T08:00:00",
    finish="2024-01-12T17:00:00",
    duration="P5D",
    critical=True,
)
walls_task = task(
    "Walls",
    "C.1.2",
    parent=shell,
    start="2024-01-15T08:00:00",
    finish="2024-01-26T17:00:00",
    duration="P10D",
)
roof = task(
    "Roof",
    "C.2",
    parent=root,
    start="2024-01-29T08:00:00",
    finish="2024-02-09T17:00:00",
    duration="P2W",
    critical=True,
)
handover = task("Handover", "C.3", parent=root, start="2024-02-12T09:00:00", finish="2024-02-12T09:00:00")
handover.IsMilestone = True
task("Snagging", "C.4", parent=root)

# Outputs: the task builds the product. Inputs: the task consumes it.
ifcopenshell.api.sequence.assign_product(f, relating_product=walls[0], related_object=walls_task)
ifcopenshell.api.sequence.assign_product(f, relating_product=walls[1], related_object=walls_task)
ifcopenshell.api.sequence.assign_product(f, relating_product=walls[2], related_object=roof)
ifcopenshell.api.sequence.assign_process(f, relating_process=roof, related_object=walls[0])

# A second, empty schedule.
ifcopenshell.api.sequence.add_work_schedule(f, name="Fit-out", predefined_type="PLANNED")

f.write(str(HERE / "sequence_4d.ifc"))


def iso(value):
    return value.isoformat() if value else None


def guids(entities):
    return sorted(e.GlobalId for e in entities)


expected = {"schedules": [], "products": {}}
for ws in f.by_type("IfcWorkSchedule"):
    tasks = []
    for t in ifcopenshell.util.sequence.get_work_schedule_tasks(ws):
        tasks.append(
            {
                "id": t.id(),
                "name": t.Name,
                "identification": t.Identification,
                "nested": [n.id() for n in ifcopenshell.util.sequence.get_nested_tasks(t)],
                "start": iso(ifcopenshell.util.sequence.derive_date(t, "ScheduleStart", is_earliest=True)),
                "finish": iso(ifcopenshell.util.sequence.derive_date(t, "ScheduleFinish", is_latest=True)),
                "outputs": guids(ifcopenshell.util.sequence.get_task_outputs(t)),
                "inputs": guids(ifcopenshell.util.sequence.get_task_inputs(t)),
                "deepOutputs": guids(ifcopenshell.util.sequence.get_task_outputs(t, is_recursive=True)),
            }
        )
    expected["schedules"].append(
        {
            "id": ws.id(),
            "name": ws.Name,
            "roots": [t.id() for t in ifcopenshell.util.sequence.get_root_tasks(ws)],
            "tasks": tasks,
        }
    )
for w in walls:
    inputs, outputs = ifcopenshell.util.sequence.get_tasks_for_product(w)
    expected["products"][w.GlobalId] = {
        "inputs": sorted(t.id() for t in inputs),
        "outputs": sorted(t.id() for t in outputs),
    }

(HERE / "sequence_4d.json").write_text(json.dumps(expected, indent="\t") + "\n")
