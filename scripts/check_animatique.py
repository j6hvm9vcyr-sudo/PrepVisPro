"""Vérifie les timelines de l'animatique avec les outils de référence (voir check-animatique.sh).

- .otio : relu par la bibliothèque OpenTimelineIO, réécrit à l'identique (hors champs ajoutés par
  défaut par les versions récentes), durées et début de timeline relus.
- .fcpxml : vérifié par xmllint avec la DTD d'Apple, dans le script shell (l'adaptateur FCPXML
  d'OpenTimelineIO ne lit pas les images fixes : il n'en est pas juge).
"""
import glob
import json
import sys

import opentimelineio as otio


def strip(o):
    if isinstance(o, dict):
        return {k: strip(v) for k, v in o.items() if k not in ("color", "available_image_bounds")}
    if isinstance(o, list):
        return [strip(v) for v in o]
    return o


def tc(t):
    return otio.opentime.to_timecode(t, t.rate)


failed = 0
folder = sys.argv[1]
for f in sorted(glob.glob(folder + "/*.otio")):
    tl = otio.adapters.read_from_file(f)
    same = strip(json.loads(otio.adapters.write_to_string(tl, "otio_json"))) == strip(json.load(open(f, encoding="utf-8")))
    clips = list(tl.find_clips())
    print(f"{f.split('/')[-1]} : {len(clips)} plans, {tc(tl.duration())}, début {tc(tl.global_start_time)}, relu à l'identique : {same}")
    failed += not same
sys.exit(1 if failed else 0)
