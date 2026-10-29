"""Build the synthetic runner's routes (garmin_sync/demo_routes.json) from OpenStreetMap.

Run once by hand; the demo generator only reads the JSON it writes, so `garmin-sync demo-data` makes
no network calls. Each route follows real streets and park paths in Ho Chi Minh City, routed with
Dijkstra over the OSM network between a few waypoints, so a run on the map stays on the paths.

    python3 scripts/demo_routes.py            # fetches OSM data (Overpass, cached in .cache/osm/)

Map data © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).

Elevation: the city is flat (2-8 m), so each point gets a gentle 4 m ± 1.3 m swell, plus a hump on
bridges (8 m over a river or road bridge, 1.5 m over a footbridge).
"""
from __future__ import annotations

import heapq
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "osm"
OUT = ROOT / "garmin_sync" / "demo_routes.json"
BBOX = (10.755, 106.655, 10.805, 106.735)
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
RUNNABLE = ("primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian|footway|path|"
            "cycleway|track|primary_link|secondary_link|tertiary_link")
# cost per metre: runners prefer paths and quiet streets
COST = {"footway": 0.6, "pedestrian": 0.6, "path": 0.6, "cycleway": 0.7, "track": 0.8, "living_street": 0.8,
        "residential": 1.0, "unclassified": 1.0, "tertiary": 1.1, "secondary": 1.2, "primary": 1.3,
        "tertiary_link": 1.5, "secondary_link": 1.5, "primary_link": 1.6, "service": 1.4}
ROADS = {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "pedestrian"}

# name, place (the run's name in the app), district (Garmin's location name), kind, how it is built
ROUTES = [
    {"id": "riverside_park", "place": "Riverside Park", "district": "Bình Thạnh", "kind": "loop",
     "around": 504571792, "inset": 15, "step": 220},
    {"id": "canal_path", "place": "Canal Path", "district": "Quận 1", "kind": "out_back",
     "via": [(10.79035, 106.70330), (10.79150, 106.69600), (10.79300, 106.68900), (10.79240, 106.68100),
             (10.79010, 106.67450)],
     "prefer": ["Hoàng Sa"]},
    {"id": "tao_dan", "place": "Tao Dan Park", "district": "Quận 1", "kind": "loop",
     "around": 500888743, "outset": 12, "step": 150, "roads_only": True},
    {"id": "stadium_track", "place": "Stadium Track", "district": "Tân Bình", "kind": "loop",
     "oval_in": 750361871},
    {"id": "le_van_tam", "place": "Le Van Tam Park", "district": "Quận 1", "kind": "loop",
     "around": 32735082, "inset": 10, "step": 120},
    # long runs and races: the river from Vinhomes Central Park to Bach Dang wharf, and back
    {"id": "riverside_long", "place": "Riverside", "district": "Bình Thạnh", "kind": "out_back",
     "via": [(10.79060, 106.72240), (10.78800, 106.71600), (10.78600, 106.71000), (10.78350, 106.70640),
             (10.77800, 106.70560), (10.77250, 106.70620)],
     "prefer": ["Nguyễn Hữu Cảnh", "Tôn Đức Thắng", "Bạch Đằng"]},
]


def overpass(name: str, query: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{name}.json"
    if f.exists():
        return json.loads(f.read_text())
    data = urllib.parse.urlencode({"data": query}).encode()
    for url in OVERPASS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "ran-demo-routes/1.0"})
            body = urllib.request.urlopen(req, timeout=180).read()
            out = json.loads(body)
            f.write_bytes(body)
            return out
        except Exception as e:  # noqa: BLE001 — try the next mirror
            print(f"{url}: {e}")
            time.sleep(5)
    raise SystemExit("Overpass unavailable")


def metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    dy = (b[0] - a[0]) * 111_320
    dx = (b[1] - a[1]) * 111_320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dx, dy)


class Graph:
    def __init__(self, ways: list[dict]):
        self.adj: dict[tuple, list[tuple]] = {}
        self.node_info: dict[tuple, dict] = {}
        for w in ways:
            t = w["tags"]
            hw = t.get("highway")
            if hw not in COST or t.get("tunnel") or t.get("access") in ("private", "no") or t.get("foot") == "no":
                continue
            if hw == "service" and not t.get("name"):
                continue   # driveways and parking aisles
            pts = [(round(p["lat"], 7), round(p["lon"], 7)) for p in w["geometry"]]
            bridge = bool(t.get("bridge"))
            for a, b in zip(pts, pts[1:]):
                d = metres(a, b)
                info = {"hw": hw, "name": t.get("name", ""), "bridge": bridge, "d": d}
                self.adj.setdefault(a, []).append((b, info))
                self.adj.setdefault(b, []).append((a, info))
            for p in pts:
                self.node_info.setdefault(p, {"names": set(), "hws": set()})
                self.node_info[p]["names"].add(t.get("name", ""))
                self.node_info[p]["hws"].add(hw)

        # the largest connected piece: a snapped waypoint off it (a path OSM leaves unconnected) has no route
        seen: set = set()
        self.main: set = set()
        for start in self.adj:
            if start in seen:
                continue
            comp, stack = set(), [start]
            while stack:
                n = stack.pop()
                if n in comp:
                    continue
                comp.add(n)
                stack.extend(m for m, _ in self.adj[n] if m not in comp)
            seen |= comp
            if len(comp) > len(self.main):
                self.main = comp

    def snap(self, p: tuple[float, float], ok=lambda n: True) -> tuple:
        return min((n for n in self.main if ok(n)), key=lambda n: metres(p, n))

    def route(self, a: tuple, b: tuple, prefer: list[str], roads_only: bool) -> list[tuple[tuple, dict | None]]:
        dist = {a: 0.0}
        prev: dict[tuple, tuple] = {}
        q = [(0.0, a)]
        while q:
            c, n = heapq.heappop(q)
            if n == b:
                break
            if c > dist.get(n, math.inf):
                continue
            for m, info in self.adj[n]:
                if roads_only and info["hw"] not in ROADS:
                    continue
                k = COST[info["hw"]] * (0.35 if any(x in info["name"] for x in prefer) else 1.0)
                nc = c + info["d"] * k
                if nc < dist.get(m, math.inf):
                    dist[m] = nc
                    prev[m] = (n, info)
                    heapq.heappush(q, (nc, m))
        if b not in prev and a != b:
            raise SystemExit(f"no path {a} -> {b}")
        path = [(b, None)]
        while path[-1][0] != a:
            n, info = prev[path[-1][0]]
            path[-1] = (path[-1][0], info)
            path.append((n, None))
        return path[::-1]


def inside(p: tuple[float, float], poly: list[tuple[float, float]]) -> bool:
    c = False
    for (y1, x1), (y2, x2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > p[0]) != (y2 > p[0]) and p[1] < x1 + (x2 - x1) * (p[0] - y1) / (y2 - y1):
            c = not c
    return c


def despike(path: list[tuple[tuple, dict | None]]) -> list[tuple[tuple, dict | None]]:
    """Drop out-and-back spurs (A, B, A -> A) left where a waypoint snapped onto a dead end."""
    changed = True
    while changed:
        changed = False
        for i in range(1, len(path) - 1):
            if path[i - 1][0] == path[i + 1][0]:
                del path[i:i + 2]
                changed = True
                break
    return path


def ring(geom: list[dict], offset: float, step: float) -> list[tuple[float, float]]:
    """Points every `step` m along a closed outline, moved `offset` m outward (negative: inward)."""
    pts = [(p["lat"], p["lon"]) for p in geom]
    cy = sum(p[0] for p in pts) / len(pts)
    cx = sum(p[1] for p in pts) / len(pts)
    out, acc = [], step
    for a, b in zip(pts, pts[1:]):
        d = metres(a, b)
        s = 0.0
        while acc + (d - s) >= step:
            s += step - acc
            acc = 0.0
            f = s / d if d else 0
            p = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
            r = metres((cy, cx), p) or 1
            k = (r + offset) / r
            out.append((cy + (p[0] - cy) * k, cx + (p[1] - cx) * k))
        acc += d - s
    return out


def oval(geom: list[dict]) -> list[tuple[tuple[float, float], dict]]:
    """A standard 400 m track (lane 1: 84.39 m straights, 36.80 m radius) centred in the stadium,
    along its long axis."""
    pts = [(p["lat"], p["lon"]) for p in geom]
    cy = sum(p[0] for p in pts) / len(pts)
    cx = sum(p[1] for p in pts) / len(pts)
    ky, kx = 111_320, 111_320 * math.cos(math.radians(cy))
    xy = [((p[1] - cx) * kx, (p[0] - cy) * ky) for p in pts]
    sxx = sum(x * x for x, _ in xy); syy = sum(y * y for _, y in xy); sxy = sum(x * y for x, y in xy)
    th = 0.5 * math.atan2(2 * sxy, sxx - syy)
    L, R = 84.39, 36.80
    local = []
    for i in range(20):
        local.append((-L / 2 + L * i / 20, -R))
    for i in range(30):
        a = -math.pi / 2 + math.pi * i / 30
        local.append((L / 2 + R * math.cos(a), R * math.sin(a)))
    for i in range(20):
        local.append((L / 2 - L * i / 20, R))
    for i in range(30):
        a = math.pi / 2 + math.pi * i / 30
        local.append((-L / 2 + R * math.cos(a), R * math.sin(a)))
    local.append(local[0])
    out = []
    for x, y in local:
        X = x * math.cos(th) - y * math.sin(th)
        Y = x * math.sin(th) + y * math.cos(th)
        out.append(((cy + Y / ky, cx + X / kx), {"bridge": False, "name": "track"}))
    return out


def ground(p: tuple[float, float]) -> float:
    # a 2-3 km swell of about a metre: the city's ground, flat to a watch's barometer
    return 4.0 + 0.8 * math.sin(p[0] * 260 + 1.3) + 0.5 * math.sin(p[1] * 330 + 0.4)


def with_elevation(path: list[tuple[tuple, dict | None]]) -> list[list[float]]:
    pts = [p for p, _ in path]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + metres(a, b))
    elev = [ground(p) for p in pts]
    # bridges: a hump over each run of bridge segments
    i = 0
    while i < len(path) - 1:
        if path[i][1] and path[i][1].get("bridge"):
            j = i
            while j < len(path) - 1 and path[j][1] and path[j][1].get("bridge"):
                j += 1
            span = cum[j] - cum[i]
            h = 8.0 if span > 60 else 1.5
            for k in range(i, j + 1):
                elev[k] += h * math.sin(math.pi * (cum[k] - cum[i]) / span) if span else 0
            i = j
        i += 1
    return [[round(p[0], 6), round(p[1], 6), round(e, 1)] for p, e in zip(pts, elev)]


def main() -> None:
    s, w, n, e = BBOX
    ways = overpass("ways", f'[out:json][timeout:120];way["highway"~"^({RUNNABLE})$"]({s},{w},{n},{e});out geom tags;')
    areas = overpass("areas", "[out:json][timeout:60];way(id:%s);out geom tags;"
                     % ",".join(str(r[k]) for r in ROUTES for k in ("around", "oval_in") if k in r))
    area = {x["id"]: x for x in areas["elements"]}
    g = Graph(ways["elements"])
    out = []
    for r in ROUTES:
        if "oval_in" in r:
            path = oval(area[r["oval_in"]]["geometry"])
        else:
            prefer = r.get("prefer", [])
            roads_only = r.get("roads_only", False)
            if "around" in r:
                via = ring(area[r["around"]]["geometry"], r.get("outset", -r.get("inset", 0)), r["step"])
                via.append(via[0])
            else:
                via = r["via"]
            if prefer:
                ok = lambda nd: any(x in nm for nm in g.node_info[nd]["names"] for x in prefer)  # noqa: E731
            elif "around" in r and r.get("inset"):
                poly = [(p["lat"], p["lon"]) for p in area[r["around"]]["geometry"]]
                ok = lambda nd: inside(nd, poly)  # noqa: E731
            elif roads_only:
                ok = lambda nd: bool(g.node_info[nd]["hws"] & ROADS)  # noqa: E731
            else:
                ok = lambda nd: True  # noqa: E731
            snapped = [g.snap(p, ok) for p in via]
            path: list = [(snapped[0], None)]
            for a, b in zip(snapped, snapped[1:]):
                if a == b:
                    continue
                leg = g.route(a, b, prefer, roads_only)
                path[-1] = (path[-1][0], leg[0][1])
                path.extend(leg[1:])
            path = despike(path)
        pts = with_elevation(path)
        length = sum(metres(tuple(a[:2]), tuple(b[:2])) for a, b in zip(pts, pts[1:]))
        out.append({k: r[k] for k in ("id", "place", "district", "kind")} | {"length_m": round(length), "points": pts})
        print(f"{r['id']:15s} {r['kind']:8s} {length / 1000:5.2f} km  {len(pts)} points")
    OUT.write_text(json.dumps({"source": "© OpenStreetMap contributors, ODbL", "routes": out}, ensure_ascii=False,
                              separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
