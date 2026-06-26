# CDL Pretrip

A gamified study trainer for the **New York CDL Class A pre-trip vehicle inspection**
skills test, built for an International Prostar tractor + trailer. Live at
**https://cdl.kardol.us**.

The NY skills test has three parts — pre-trip inspection, basic vehicle control, and the
road test. This app drills **part 1, the inspection**: a verbal, memory-heavy exam where
you must point to each component, name it, and state **at least two conditions** you're
checking. The content is the user's own ordered inspection script, organized into the six
official sections (In-Cab, Air Brake & Tug Tests, Coupling, Part A front, Part B back,
Part C trailer) grouped under the three exam "parts" (Cab / Tractor / Trailer).

## What's in it

- **Learn** — every item in walk-around order; expand to see the conditions. Mark items
  *mastered* (hidden) or *parked*; filter by Due / Weak / Critical. A spaced-repetition
  (Leitner) engine schedules reviews behind the scenes. Sections show inline thumbnails of
  the relevant diagrams.
- **Diagrams** — a picture dictionary of 12 labeled walk-around plates from the
  International Prostar manual (engine compartments, both wheel ends, under-vehicle, rear,
  fifth-wheel/coupling, dash). Tap a plate for its numbered legend, or take the **Picture
  quiz**: shown a diagram, name the part at callout #N. Great for visual learners.
- **Quiz** — recall mode: you're shown an item, you say/type two conditions, reveal, and
  self-grade. Smart queues (Due / Weak / Critical) feed the spaced-repetition schedule.
- **Walk-Around** — ordered speed-run of the full clockwise route (or one section),
  scored on completeness + time, with a per-section scorecard.
- **Examiner** — the pressure sim: timed, no hints, **critical-item insta-fail**, ending
  in a PASS-READY / ALMOST / NEEDS-WORK verdict.
- **Progress** — mastery by section, streak, best run, weak-spot radar, and JSON
  export/import (all state is client-side localStorage).

Pure static site — HTML/CSS/vanilla JS + a generated `data.js`. No backend, no login.

## Content: regenerate from Notion

The inspection content is generated from the Notion page "Pre trip inspection":

```bash
NOTION_API_KEY=ntn_... python3 scripts/build_data.py   # writes site/data.js
```

Edit the Notion page, re-run, rebuild the image. The generator splits the page into the
six sections, parses each `Name (cond1, cond2, …)` line into conditions, nests sub-checks,
flags critical items, and applies a small typo-override map (it never mutates Notion).

## Diagrams (picture dictionary)

The 12 plates in `site/img/diagrams/*.webp` were extracted from Section 3 (Inspection
Guide) of the International Prostar Operation & Maintenance Manual with `pdfimages`,
flattened onto white, trimmed, and converted to WebP. The titles, section mapping, and
numbered legends live hand-authored in `site/diagrams.js` (`window.PRETRIP_DIAGRAMS`). To
add or refresh plates, extract the embedded image from the relevant PDF page
(`pdfimages -png -f N -l N manual.pdf out`), process it the same way, and add an entry.

## Build & deploy (forge k8s)

```bash
# on forge (builds + pushes to GHCR; forge has no passwordless sudo for ctr-import)
docker build -t ghcr.io/kardolus/cdl-web:vN .
docker push  ghcr.io/kardolus/cdl-web:vN

# from the Mac
kubectl --context forge -n cdl set image deploy/cdl-web cdl-web=ghcr.io/kardolus/cdl-web:vN
kubectl --context forge -n cdl rollout status deploy/cdl-web
```

First-time setup (namespace, `ghcr-pull` secret, manifests, Cloudflare tunnel hostname +
CNAME `cdl`) is documented at the top of `deploy/k8s/cdl-pretrip.yaml`.

Monitoring (blackbox probe + Grafana health box) lives in the `kardolus/monitoring` repo.
