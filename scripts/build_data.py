#!/usr/bin/env python3
"""Generate site/data.json for the CDL pre-trip trainer from the user's Notion page.

The canonical content lives in the Notion page "Pre trip inspection" (the user's own
ordered, personalized NY CDL Class-A pre-trip script). This script fetches that page via
the Notion API and flattens it into a static JSON the web app reads at load time.

Re-run whenever the Notion page changes:

    NOTION_API_KEY=ntn_... python scripts/build_data.py

Notion structure -> our model:
  * Top-level "parts" are detected by heading text: the In-Cab block, then
    Part A (front of tractor), Part B (back of tractor), Part C (trailer).
  * Every other heading is a "group" within the current part.
  * Each `to_do` is an inspection item; text of the form "Name (cond1, cond2, ...)"
    splits into a name + a conditions[] list. Nested to_dos become subchecks[].
  * The In-Cab block is split into three sections (in-cab / air-brake / coupling) by
    group name so the gamified "3 parts" (Cab / Tractor / Trailer) line up with the
    official NY exam structure.
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error

PAGE_ID = "276ac3c2-2f05-8094-8674-f97d1688e421"
OUT = os.path.join(os.path.dirname(__file__), "..", "site", "data.js")
NOTION_VERSION = "2022-06-28"

KEY = os.environ.get("NOTION_API_KEY")
if not KEY:
    sys.exit("Set NOTION_API_KEY (the Notion integration token) in the environment.")
HEADERS = {
    "Authorization": "Bearer " + KEY,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
}

# --- section definitions (order = nav order) -------------------------------------------
SECTIONS = [
    {"id": "in-cab",    "title": "In-Cab Inspection",      "part": "Cab",     "type": "component"},
    {"id": "air-brake", "title": "Air Brake & Tug Tests",  "part": "Cab",     "type": "procedure"},
    {"id": "coupling",  "title": "Coupling System",        "part": "Cab",     "type": "component"},
    {"id": "part-a",    "title": "Part A — Front of Tractor", "part": "Tractor", "type": "component"},
    {"id": "part-b",    "title": "Part B — Back of Tractor",  "part": "Tractor", "type": "component"},
    {"id": "part-c",    "title": "Part C — Trailer",          "part": "Trailer", "type": "component"},
]

# Fix OCR/typo artifacts in the source without mutating Notion. Applied as plain
# substring replacements on each block's text before parsing.
TYPO_FIXES = [
    ("Vaults gauge", "Volts gauge"),
    ("brake drom", "brake drum"),
    ("Brake drom", "Brake drum"),
    ("log nuts", "lug nuts"),
    ("controller arm", "control arm"),
    ("Wiper armes", "Wiper arms"),
    ("mix and max", "min and max"),
    ("Thread depth", "Tread depth"),
    ("thread depth", "tread depth"),
    ("Air break chamber", "Air brake chamber"),
    ("Abs wire", "ABS wire"),
]

# Items matching these (in name or group) are "critical" -> insta-fail in Examiner mode.
CRITICAL_RE = re.compile(
    r"\b(brake|air\s*brake|tire|tread|psi|pressure|fifth\s*wheel|king\s*pin|kingpin|"
    r"locking|jaws|coupling|glad\s*hand|service\s*line|emergency\s*line|air\s*line|"
    r"steering|pitman|drag\s*link|tie\s*rod|slack|push\s*rod|chamber|drum|shoe|lining|"
    r"signal|headlight|clearance\s*light|marker\s*light|brake\s*light|low\s*air|"
    r"spring\s*brake|governor|parking\s*brake|landing\s*gear)\b",
    re.I,
)

PART_HEADINGS = {
    "in cab inspection": "INCAB",
    "part a (front of tractor)": "A",
    "part b (back of tractor)": "B",
    "part c (trailer)": "C",
}


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def rich(arr):
    return "".join(t.get("plain_text", "") for t in arr).strip()


def fix(text):
    for a, b in TYPO_FIXES:
        text = text.replace(a, b)
    return text


def parse_item(text):
    """'Name (cond1, cond2)' -> ('Name', ['cond1', 'cond2'], note).

    Also handles a leading qualifier group, e.g. the gladhand lines
    'Service line (blue) (no abrasions, no bumps, ...)' -> the '(blue)' becomes the
    note, not a mangled first condition.
    """
    text = fix(text).strip()
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", text, re.S)
    if m:
        name = m.group(1).strip()
        body = m.group(2)
        note = ""
        q = re.match(r"^\s*([^()]*?)\)\s*\((.*)$", body, re.S)  # "qualifier) (conditions"
        if q:
            note = q.group(1).strip()
            body = q.group(2)
        conds = [c.strip() for c in re.split(r",|;", body) if c.strip()]
        return name, conds, note
    # a few source lines have a dangling trailing ")" with no opening paren
    if text.endswith(")") and "(" not in text:
        text = text[:-1].strip()
    return text, [], ""


def children(block_id):
    out = []
    url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
    while url:
        d = get(url)
        out.extend(d["results"])
        url = None
        if d.get("has_more"):
            url = (f"https://api.notion.com/v1/blocks/{block_id}/children"
                   f"?page_size=100&start_cursor={d['next_cursor']}")
    return out


def collect_subchecks(block):
    subs = []
    if block.get("has_children"):
        for c in children(block["id"]):
            if c["type"] == "to_do":
                name, conds = parse_item(rich(c["to_do"]["rich_text"]))
                if name:
                    subs.append({"name": name, "conditions": conds})
                    subs.extend(collect_subchecks(c))  # flatten deeper nesting
    return subs


def section_for(part, group):
    g = group.lower()
    if part == "A":
        return "part-a"
    if part == "B":
        return "part-b"
    if part == "C":
        return "part-c"
    # In-cab block splits three ways
    if "air brake" in g or "tug test" in g:
        return "air-brake"
    if "coupling" in g:
        return "coupling"
    return "in-cab"


def main():
    try:
        blocks = children(PAGE_ID)
    except urllib.error.HTTPError as e:
        print("Notion API error:", e.code, e.read().decode()[:300], file=sys.stderr)
        sys.exit(1)

    items = []
    part = "INCAB"
    group = "Start-up"
    order = 0
    counters = {}

    for b in blocks:
        t = b["type"]
        if t.startswith("heading"):
            htext = rich(b[t]["rich_text"])
            key = htext.lower().strip()
            if key in PART_HEADINGS:
                part = PART_HEADINGS[key]
                # Part A's first items live under the "Outside" sub-heading; until then
                # use the part name as the group.
                group = htext
            else:
                group = htext
            continue
        if t == "to_do":
            text = rich(b["to_do"]["rich_text"])
            if not text:
                continue
            name, conds, note = parse_item(text)
            if not name:
                continue
            sec = section_for(part, group)
            counters[sec] = counters.get(sec, 0) + 1
            order += 1
            blob = f"{group} {name}"
            items.append({
                "id": f"{sec}-{counters[sec]:02d}",
                "section": sec,
                "group": group,
                "order": order,
                "name": name,
                "conditions": conds,
                "subchecks": collect_subchecks(b),
                "critical": bool(CRITICAL_RE.search(blob)),
                "note": note,
            })

    data = {"sections": SECTIONS, "items": items}
    with open(OUT, "w") as f:
        # Emit as a JS assignment (no fetch needed -> works under nginx AND file://).
        f.write("// AUTO-GENERATED by scripts/build_data.py from the Notion source. Do not edit by hand.\n")
        f.write("window.PRETRIP_DATA = ")
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    # --- summary --------------------------------------------------------------------
    by_sec = {}
    crit = 0
    for it in items:
        by_sec.setdefault(it["section"], 0)
        by_sec[it["section"]] += 1
        crit += it["critical"]
    print(f"Wrote {len(items)} items ({crit} critical) -> {os.path.normpath(OUT)}")
    for s in SECTIONS:
        print(f"  {s['id']:10s} {by_sec.get(s['id'], 0):3d}  {s['title']}")


if __name__ == "__main__":
    main()
