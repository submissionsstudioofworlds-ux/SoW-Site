#!/usr/bin/env python3
"""Reachability check for The Death Pit of Shem.

Run from the game directory:   python3 tools/check-reach.py

Reads GRAV / JUMP_V / RUN_SPEED straight out of game.js, derives Bob's actual
jump envelope from them, then walks every map to find standing spots and items
he cannot get to.

This exists because the first pass at the levels was authored by eye, and two
of the four gauntlets turned out to be literally unfinishable: their ink
channels were 8 and 10 tiles wide against a 5.9-tile maximum jump, so the exit
gate could not be reached at all. 187 unreachable spots in total.

Any edit to the maps, or to the three physics constants, should be followed by
a run of this. It should print TOTAL PROBLEMS: 0.
"""
import re, math, collections, sys

_src = open('game.js').read()
def _const(n):
    return float(re.search(r'var %s = ([0-9.]+);' % n, _src).group(1))
G, JV, RUN, TILE = _const('GRAV'), _const('JUMP_V'), _const('RUN_SPEED'), 16
SHROOM_V = 430.0

def max_dx(rise_px, v=JV):
    disc = v*v - 2*G*rise_px
    if disc < 0: return -1
    return RUN*(v + math.sqrt(disc))/G

def load_maps(path='game.js'):
    src = open(path).read()
    maps = {}
    for name in ['GAUNTLETS', 'ARENA']:
        i = src.index('var %s = [' % name)
        depth, j = 0, i + len('var %s = ' % name)
        for k in range(j, len(src)):
            if src[k] == '[': depth += 1
            elif src[k] == ']':
                depth -= 1
                if depth == 0: break
        blob = src[j:k+1]
        grids = re.findall(r'\[\s*((?:\s*\'[^\']*\',?)+)\s*\]', blob)
        for gi, g in enumerate(grids):
            rows = re.findall(r"'([^']*)'", g)
            if len(rows) < 10: continue
            w = max(len(r) for r in rows)
            rows = [r.ljust(w, '.') for r in rows]
            maps['%s%d' % (name, gi+1)] = rows
    return maps

SOLID = '#'
def analyse(rows, label):
    H, W = len(rows), len(rows[0])
    def t(x, y):
        if x < 0 or x >= W: return '#'
        if y < 0: return '#'
        if y >= H: return '~'
        return rows[y][x]
    def blocks(x, y): return t(x, y) == '#'

    # A standing spot: solid/shelf underfoot, two clear tiles of headroom.
    stand = set()
    for y in range(H):
        for x in range(W):
            if t(x, y) in (SOLID, '=') and not blocks(x, y-1) and not blocks(x, y-2):
                stand.add((x, y))

    # Entities of interest, snapped to the surface they sit on.
    goals = {}
    shrooms = set()
    for y in range(H):
        for x in range(W):
            c = t(x, y)
            if c in '*hwdxPE':
                sy = y
                while sy < H and t(x, sy) not in (SOLID, '='): sy += 1
                goals.setdefault(c, []).append((x, y, sy))
            if c == 'm':
                sy = y
                while sy < H and t(x, sy) not in (SOLID, '='): sy += 1
                shrooms.add((x, sy))

    start = None
    for x in range(W):
        for y in range(H):
            if t(x, y) == 'P':
                sy = y
                while sy < H and t(x, sy) not in (SOLID, '='): sy += 1
                start = (x, sy)
    if not start: return None

    def neighbours(p):
        x, y = p
        out = []
        # A bounce shroom within a tile of the launch point doubles the reach.
        v = SHROOM_V if any(abs(sx-x) <= 1 and sy == y for sx, sy in shrooms) else JV
        for (nx, ny) in stand:
            dx, dy = abs(nx-x), y-ny          # dy>0 means climbing
            if dx == 0 and dy == 0: continue
            reach = max_dx(dy*TILE, v) if dy > 0 else max_dx(0, v) + (-dy)*TILE*0.5
            if reach < 0: continue
            if dx*TILE <= reach + TILE*0.5:
                out.append((nx, ny))
        return out

    seen, q = {start}, collections.deque([start])
    while q:
        p = q.popleft()
        for n in neighbours(p):
            if n not in seen:
                seen.add(n); q.append(n)

    unreachable = sorted(stand - seen)
    print('\n=== %s (%dx%d) ===' % (label, W, H))
    print('  standing spots: %d reachable / %d total' % (len(seen), len(stand)))
    if unreachable:
        by_row = collections.defaultdict(list)
        for x, y in unreachable: by_row[y].append(x)
        for y in sorted(by_row):
            xs = by_row[y]
            print('    UNREACHABLE row %-2d cols %s' % (y, '%d-%d' % (min(xs), max(xs))))
    bad_goals = []
    for c, lst in sorted(goals.items()):
        if c == 'P': continue
        for (x, y, sy) in lst:
            if (x, sy) not in seen and not any(abs(gx-x) <= 1 and abs(gy-sy) <= 3 for gx, gy in seen):
                bad_goals.append('%s at col %d row %d' % (c, x, y))
    if bad_goals:
        print('    UNREACHABLE items: ' + '; '.join(bad_goals))
    if not unreachable and not bad_goals:
        print('    all clear')
    return len(unreachable) + len(bad_goals)

maps = load_maps(sys.argv[1] if len(sys.argv) > 1 else 'game.js')
total = 0
for k in sorted(maps):
    r = analyse(maps[k], k)
    if r: total += r
print('\nTOTAL PROBLEMS: %d' % total)
