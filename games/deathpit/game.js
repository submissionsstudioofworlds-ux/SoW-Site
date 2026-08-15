/* The Death Pit of Shem — a 2D platformer.
 *
 * Bob Goblin is thrown down a hole and lands in a bioluminescent cavern. Each
 * level is a platforming gauntlet that ends at the Plancktopus arena, where
 * the rule is the whole game: sever every tentacle before the first one you
 * cut grows back. Level 1 fights three arms; every level after adds one.
 *
 * Two structural notes worth knowing before reading on:
 *
 *  - Every map is exactly MAP_H tiles tall, so the camera only ever scrolls
 *    horizontally. That removes a whole class of framing problems and lets
 *    the arena be a single fixed screen.
 *
 *  - Tentacles are only DANGEROUS while striking, and only REACHABLE while
 *    extended. Those two facts are the same fact: idle arms wave up near the
 *    body where Bob's cleaver cannot go, so the fight is "bait a slam, dodge
 *    it, then chop the arm before it pulls back". Everything in the tentacle
 *    state machine exists to make that loop legible.
 */
(function (global) {
  'use strict';

  /* ---------- constants --------------------------------------------------- */
  var TILE = 16;
  var MAP_H = 14;                       // every map, always
  var W = 384, H = MAP_H * TILE;        // 384x224

  var GRAV = 900;
  var MAX_FALL = 430;
  var RUN_SPEED = 128;
  var RUN_ACCEL = 1100;
  var GROUND_FRICTION = 1500;
  var AIR_ACCEL = 700;
  var JUMP_V = 352;
  var JUMP_CUT = 0.42;                  // vy multiplier when the button is released early
  var COYOTE = 0.09;
  var JUMP_BUFFER = 0.12;

  var PLAYER_W = 12, PLAYER_H = 20;
  var ATTACK_TIME = 0.30;               // full swing cycle
  var ATTACK_ACTIVE0 = 0.06, ATTACK_ACTIVE1 = 0.20;
  var STAB_BOUNCE = 300;
  var INVULN_TIME = 1.15;
  var MAX_HEARTS = 4;
  var START_LIVES = 3;

  var BOSS_TENTACLE_HP = 3;
  var TENT_SEGMENTS = 24;
  var EXPOSE_TIME = 5.0;                // window to strike the eye once all arms are off

  /* ---------- level data --------------------------------------------------
   * Tile characters:
   *   #  rock          =  fungal shelf (one-way, jump up through it)
   *   ^  crystal spikes (floor)        v  crystal spikes (ceiling)
   *   ~  glowing ink   (hazard, not solid — falling in costs a heart)
   *   .  empty
   * Entity characters are lifted out of the map at load and replaced by empty:
   *   P  Bob's start   E  the gate onward
   *   g  gremlin       c  cave crawler   b  glowbat      s  sporepod
   *   m  bounce shroom *  glimmer        h  heart
   *   w  keen edge     d  shield         x  extra life
   * Rows are right-padded to the widest row, so the floor row (which is
   * always full width) defines each map's true width.
   */
  var GAUNTLETS = [
    // 1 — a gentle introduction to falling over
    [
      '############################################################',
      '#..........................................................#',
      '#..........................................................#',
      '#.....*............*.......................................#',
      '#...........====...........................................#',
      '#.......................................b..................#',
      '#...............w................*.........................#',
      '#.......====............b.........====.....................#',
      '#..........................................................#',
      '#...........*...................................*..........#',
      '#...====......................====............=====........#',
      '#..........................................................#',
      '#..P.....c......m...........g.........s.....m.......c.....E#',
      '######################~~~~########~~~#######################'
    ],
    // 2 — ink channels, bridged by stepping stones
    [
      '############################################################',
      '#..........................................................#',
      '#..........................................................#',
      '#...............*...................................*......#',
      '#.....................====.................................#',
      '#...................................b......................#',
      '#...................d...........................*..........#',
      '#.................====........b...................====.....#',
      '#..........................................................#',
      '#.......................*...................b..............#',
      '#.............====............................====.........#',
      '#............===.............===.............===...........#',
      '#..P..c.............m............s...m............g.......E#',
      '########~~~~############~~~~############~~~~################'
    ],
    // 3 — spikes underfoot and overhead
    [
      '############################################################',
      '#.......vvv...............vvv...............vvv............#',
      '#..........................................................#',
      '#.......*.................................d................#',
      '#.............====b.............................====b......#',
      '#..........................................................#',
      '#...........w.............*...................*............#',
      '#.........====..............====............====...........#',
      '#.................................b........................#',
      '#...............*..........................................#',
      '#.....====..............====............====...............#',
      '#..........................................................#',
      '#..P...c...^^^......m...g....^^^....s.......m...^^^..g....E#',
      '############################################################'
    ],
    // 4 — the long wet drop: four crossings, every one a real jump
    [
      '############################################################',
      '#..........................................................#',
      '#..........................................................#',
      '#.............*...................................*........#',
      '#...............====....................................====',
      '#.........................b...........b....................#',
      '#............d........................................w....#',
      '#...........====....................................====...#',
      '#..........................................................#',
      '#......*...........x...........*...........*...............#',
      '#.....===.........===.........===.........===...====.......#',
      '#..........................................................#',
      '#..P.s.........m...........g...........m.......c.....g....E#',
      '#######~~~~########~~~~########~~~~########~~~~#############'
    ]
  ];

  /* The arena is one fixed screen. The Plancktopus stands in the middle, so
   * the footing is all at the flanks — every shelf is inside the reach of at
   * least one arm, and there is no safe corner to camp in. */
  var ARENA = [
    '########################',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#......................#',
    '#..===............===..#',
    '#......................#',
    '#......................#',
    '#.===................===',
    '#......................#',
    '#.P..................*.#',
    '########################'
  ];

  var LEVEL_NAMES = [
    'THE GLOWING DAMP',
    'MIND THE CREVASSE',
    'FUNGAL MISGIVINGS',
    'THE LONG WET DROP',
    'DEEPER, SOMEHOW',
    'STILL FALLING',
    'THIS IS FINE',
    'BOB REGRETS THE SANDWICH'
  ];

  var LEVEL_FLAVOUR = [
    'IT SMELLS LIKE A POND HAD A BAD IDEA.',
    'THE FLOOR IS MOSTLY A SUGGESTION.',
    'THE MUSHROOMS ARE LOAD-BEARING.',
    'BOB CANNOT SWIM. BOB HAS NEVER NEEDED TO.',
    'THE PIT IS NOT RUNNING OUT OF PIT.',
    'BOB HAS STOPPED COUNTING.',
    'EVERYTHING IS COMPLETELY UNDER CONTROL.',
    'IT WAS A REALLY GOOD SANDWICH.'
  ];

  var DEATH_QUIPS = [
    'BOB IS FINE. BOB IS DEFINITELY FINE.',
    'THAT WAS A LEARNING EXPERIENCE.',
    'THE PIT REMAINS UNDEFEATED.',
    'BOB WOULD LIKE TO FILE A COMPLAINT.',
    'NOT BOB\'S BEST WORK.',
    'THE SANDWICH WAS WORTH IT. PROBABLY.'
  ];

  var SEVER_QUIPS = [
    'ONE DOWN!',
    'THAT ONE WAS RUDE.',
    'ARM? GONE.',
    'NICE CHOP, BOB.',
    'FEWER ARMS NOW.',
    'DE-ARMED!'
  ];

  /* ---------- module state ------------------------------------------------ */
  var canvas, ctx, A;
  var running = false, last = 0;
  var state = 'TITLE';                  // TITLE CARD PLAY BOSSIN BOSS DEAD CLEAR OVER
  var stateTime = 0;
  var level = 1, score = 0, hiScore = 0, lives = START_LIVES;
  var map = null, mapW = 0;
  var camX = 0;
  var player = null;
  var enemies = [], shots = [], pickups = [], parts = [], floats = [];
  var boss = null;
  var shake = 0, flashAmt = 0, flashCol = '#ffffff';
  var banner = '', bannerSub = '', bannerTime = 0;
  var glowSprite = null, backLayers = null;
  var dripTimer = 2;
  var INVULN_FOREVER = false;
  var posterMode = false;   // renders one clean frame: no HUD, no overlays
  var posterURL = null;     // cached so chunked reads all come from one render

  var keys = {};
  var holds = { left: false, right: false, down: false, jump: false, attack: false };
  var jumpEdge = false, attackEdge = false;

  /* ---------- small helpers ----------------------------------------------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function approach(v, target, step) {
    if (v < target) return Math.min(target, v + step);
    return Math.max(target, v - step);
  }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  // Deterministic per-tile noise so rock variants stay put between frames.
  function tileHash(x, y) {
    var n = (x * 73856093) ^ (y * 19349663);
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967296;
  }

  function loadHi() {
    try { return parseInt(global.localStorage.getItem('deathpit.hi'), 10) || 0; }
    catch (e) { return 0; }
  }
  function saveHi(v) {
    try { global.localStorage.setItem('deathpit.hi', String(v)); } catch (e) { /* private mode */ }
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  /* ---------- map ---------------------------------------------------------- */
  var SOLID = '#';
  var SHELF = '=';

  function loadMap(rows, isArena) {
    var w = 0, i;
    for (i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);

    var grid = [];
    var spawnPoints = [];
    var start = { x: 2 * TILE, y: 11 * TILE };
    var gate = null;

    for (var y = 0; y < MAP_H; y++) {
      var src = rows[y] || '';
      var line = [];
      for (var x = 0; x < w; x++) {
        var ch = x < src.length ? src.charAt(x) : '.';
        switch (ch) {
          case 'P':
            start = { x: x * TILE + TILE / 2, y: y * TILE + TILE };
            ch = '.';
            break;
          case 'E':
            gate = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
            ch = '.';
            break;
          case 'g': case 'c': case 'b': case 's': case 'm':
          case '*': case 'h': case 'w': case 'd': case 'x':
            spawnPoints.push({ kind: ch, x: x * TILE + TILE / 2, y: y * TILE + TILE });
            ch = '.';
            break;
          default:
            break;
        }
        line.push(ch);
      }
      grid.push(line);
    }

    return {
      grid: grid, w: w, h: MAP_H,
      pxW: w * TILE, pxH: MAP_H * TILE,
      start: start, gate: gate, spawns: spawnPoints, arena: !!isArena
    };
  }

  function tileAt(tx, ty) {
    if (!map) return SOLID;
    if (tx < 0 || tx >= map.w) return SOLID;
    if (ty < 0) return SOLID;
    if (ty >= MAP_H) return '~';        // below the world is ink, always
    return map.grid[ty][tx];
  }

  function isSolid(ch) { return ch === SOLID; }

  /* AABB against the tile grid, one axis at a time. `dropping` lets the
   * player fall through a shelf by holding down. */
  function moveX(body, dx) {
    body.x += dx;
    var left = body.x - body.w / 2, right = body.x + body.w / 2;
    var top = body.y - body.h, bottom = body.y - 0.01;
    var t0 = Math.floor(top / TILE), t1 = Math.floor(bottom / TILE);
    var i;
    if (dx > 0) {
      var tx = Math.floor(right / TILE);
      for (i = t0; i <= t1; i++) {
        if (isSolid(tileAt(tx, i))) {
          body.x = tx * TILE - body.w / 2 - 0.01;
          body.vx = 0;
          body.hitWall = 1;
          return;
        }
      }
    } else if (dx < 0) {
      var tx2 = Math.floor(left / TILE);
      for (i = t0; i <= t1; i++) {
        if (isSolid(tileAt(tx2, i))) {
          body.x = (tx2 + 1) * TILE + body.w / 2 + 0.01;
          body.vx = 0;
          body.hitWall = -1;
          return;
        }
      }
    }
  }

  function moveY(body, dy, dropping) {
    var prevBottom = body.y;
    body.y += dy;
    var left = body.x - body.w / 2 + 0.5, right = body.x + body.w / 2 - 0.5;
    var x0 = Math.floor(left / TILE), x1 = Math.floor(right / TILE);
    var i;

    if (dy > 0) {
      var ty = Math.floor((body.y - 0.01) / TILE);
      for (i = x0; i <= x1; i++) {
        var ch = tileAt(i, ty);
        var solid = isSolid(ch);
        // Shelves only catch a falling body that was already above them.
        if (!solid && ch === SHELF && !dropping && prevBottom <= ty * TILE + 1) solid = true;
        if (solid) {
          body.y = ty * TILE;
          body.vy = 0;
          body.onGround = true;
          return;
        }
      }
    } else if (dy < 0) {
      var ty2 = Math.floor((body.y - body.h) / TILE);
      for (i = x0; i <= x1; i++) {
        if (isSolid(tileAt(i, ty2))) {
          body.y = (ty2 + 1) * TILE + body.h;
          body.vy = 0;
          return;
        }
      }
    }
  }

  // Scans the tiles a body overlaps for the non-solid hazards.
  function hazardUnder(body) {
    var x0 = Math.floor((body.x - body.w / 2) / TILE);
    var x1 = Math.floor((body.x + body.w / 2) / TILE);
    var y0 = Math.floor((body.y - body.h) / TILE);
    var y1 = Math.floor((body.y - 0.01) / TILE);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var ch = tileAt(x, y);
        if (ch === '~' || ch === '^' || ch === 'v') return ch;
      }
    }
    return null;
  }

  /* ---------- input -------------------------------------------------------- */
  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    KeyZ: 'attack', KeyJ: 'attack', KeyX: 'attack'
  };

  function bindInput() {
    global.addEventListener('keydown', function (e) {
      var act = KEYMAP[e.code];
      if (act) {
        e.preventDefault();
        if (!keys[act]) {
          if (act === 'jump') jumpEdge = true;
          if (act === 'attack') attackEdge = true;
        }
        keys[act] = true;
        PitSound.unlock();
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); }
      else if (e.code === 'KeyM') { e.preventDefault(); toggleSound(); }
      else if (e.code === 'Enter') { e.preventDefault(); confirmPress(); }
    });

    global.addEventListener('keyup', function (e) {
      var act = KEYMAP[e.code];
      if (act) { e.preventDefault(); keys[act] = false; }
    });

    global.addEventListener('blur', function () {
      keys = {};
      holds.left = holds.right = holds.down = holds.jump = holds.attack = false;
    });
  }

  function held(act) { return !!keys[act] || !!holds[act]; }

  // `jumpEdge` / `attackEdge` are consumed once per frame so a held key never
  // re-triggers, whether it came from a keyboard or a touch button.
  function takeJump() { var v = jumpEdge; jumpEdge = false; return v; }
  function takeAttack() { var v = attackEdge; attackEdge = false; return v; }

  function confirmPress() {
    PitSound.unlock();
    if (state === 'TITLE') startRun();
    else if (state === 'OVER') { state = 'TITLE'; stateTime = 0; }
    else if (state === 'DEAD' && stateTime > 0.7) respawn();
  }

  /* ---------- entities ----------------------------------------------------- */
  function makePlayer(x, y) {
    return {
      x: x, y: y, vx: 0, vy: 0,
      w: PLAYER_W, h: PLAYER_H,
      face: 1, onGround: false, hitWall: 0,
      coyote: 0, buffer: 0,
      hearts: MAX_HEARTS,
      invuln: 0, hurtTime: 0,
      attack: -1, attackKind: 'swing', hasHitThisSwing: false,
      keen: false, shield: false, stompGrace: 0,
      animTime: 0, dead: false, stabBounced: false
    };
  }

  function spawnFromMap() {
    enemies.length = 0; pickups.length = 0; shots.length = 0; parts.length = 0; floats.length = 0;
    for (var i = 0; i < map.spawns.length; i++) {
      var s = map.spawns[i];
      switch (s.kind) {
        case 'g': enemies.push(makeGremlin(s.x, s.y)); break;
        case 'c': enemies.push(makeGrub(s.x, s.y)); break;
        case 'b': enemies.push(makeBat(s.x, s.y)); break;
        case 's': enemies.push(makePod(s.x, s.y)); break;
        case 'm': enemies.push(makeShroom(s.x, s.y)); break;
        case '*': pickups.push(makePickup('glimmer', s.x, s.y - 10)); break;
        case 'h': pickups.push(makePickup('heart', s.x, s.y - 10)); break;
        case 'w': pickups.push(makePickup('keen', s.x, s.y - 11)); break;
        case 'd': pickups.push(makePickup('shield', s.x, s.y - 11)); break;
        case 'x': pickups.push(makePickup('life', s.x, s.y - 11)); break;
      }
    }
  }

  function makePickup(kind, x, y) {
    return { kind: kind, x: x, y: y, t: rnd(0, 6), vy: 0, settled: true };
  }

  function speedScale() { return 1 + Math.min(0.5, (level - 1) * 0.07); }

  /* Gremlin: Bob-sized, and the only thing down here that actually comes
   * after him. It patrols until Bob is close and roughly level, then screeches
   * and charges. Being his size matters — it cannot be jumped over casually,
   * so a corridor with two of them is a real problem. */
  function makeGremlin(x, y) {
    return {
      kind: 'gremlin', x: x, y: y,
      vx: 30 * speedScale() * (Math.random() < 0.5 ? -1 : 1), vy: 0,
      w: 18, h: 24, hp: 3, hurt: 0, anim: rnd(0, 3),
      onGround: false, face: 1, alerted: 0, screech: 0, score: 200
    };
  }

  function makeGrub(x, y) {
    return {
      kind: 'grub', x: x, y: y, vx: 26 * speedScale() * (Math.random() < 0.5 ? -1 : 1), vy: 0,
      w: 16, h: 11, hp: 2, hurt: 0, anim: rnd(0, 3), onGround: false, face: 1, score: 100
    };
  }

  function makeBat(x, y) {
    return {
      kind: 'bat', x: x, y: y - 8, homeY: y - 8, vx: 0, vy: 0,
      w: 14, h: 10, hp: 1, hurt: 0, anim: rnd(0, 3), phase: rnd(0, 6.28),
      alerted: false, score: 150
    };
  }

  function makePod(x, y) {
    return {
      kind: 'pod', x: x, y: y, vx: 0, vy: 0,
      w: 16, h: 17, hp: 3, hurt: 0, anim: 0, cool: rnd(0.8, 2.4), open: 0, score: 250
    };
  }

  function makeShroom(x, y) {
    return { kind: 'shroom', x: x, y: y, w: 18, h: 8, squash: 0, invincible: true, hp: 999, hurt: 0 };
  }

  function burst(x, y, n, colours, speed, life, size, gravity) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, Math.PI * 2), s = rnd(speed * 0.35, speed);
      parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(life * 0.5, life), max: life,
        col: pick(colours), size: size || 2,
        g: gravity == null ? 260 : gravity
      });
    }
  }

  function floatText(x, y, text, colour) {
    floats.push({ x: x, y: y, text: text, col: colour || '#ffe89a', life: 1.1 });
  }

  function addScore(n, x, y) {
    score += n;
    if (score > hiScore) { hiScore = score; saveHi(hiScore); }
    if (x != null) floatText(x, y, '+' + n, '#ffe89a');
  }

  function flash(col, amt) { flashCol = col; flashAmt = Math.max(flashAmt, amt); }
  function showBanner(text, sub, time) { banner = text; bannerSub = sub || ''; bannerTime = time || 2; }

  /* ---------- player ------------------------------------------------------- */
  function attackBox() {
    if (player.attack < ATTACK_ACTIVE0 || player.attack > ATTACK_ACTIVE1) return null;
    if (player.attackKind === 'stab') {
      var sw = player.keen ? 22 : 16;
      return { x: player.x - sw / 2, y: player.y - 2, w: sw, h: player.keen ? 26 : 20 };
    }
    var reach = player.keen ? 30 : 22;
    return {
      x: player.face > 0 ? player.x + 2 : player.x - 2 - reach,
      y: player.y - PLAYER_H - 2,
      w: reach, h: 20
    };
  }

  function boxHit(box, cx, cy, r) {
    var nx = clamp(cx, box.x, box.x + box.w);
    var ny = clamp(cy, box.y, box.y + box.h);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  function boxOverlapEntity(box, e) {
    return box.x < e.x + e.w / 2 && box.x + box.w > e.x - e.w / 2 &&
      box.y < e.y && box.y + box.h > e.y - e.h;
  }

  function hurtPlayer(amount, fromX) {
    if (player.dead || player.invuln > 0 || INVULN_FOREVER) return;

    // One use only: the shield absorbs a hit outright, then it is gone.
    if (player.shield) {
      player.shield = false;
      player.invuln = INVULN_TIME;
      player.hurtTime = 0.2;
      var kdir = fromX == null ? -player.face : (player.x < fromX ? -1 : 1);
      player.vx = kdir * 110;
      shake = Math.max(shake, 4);
      flash('#7db4f2', 0.4);
      floatText(player.x, player.y - PLAYER_H - 6, 'SHIELD GONE', '#cfe6ff');
      burst(player.x, player.y - PLAYER_H / 2, 16, ['#cfe6ff', '#4a8ade', '#ffffff'], 150, 0.5, 2, 90);
      PitSound.play('shieldBreak');
      return;
    }

    player.hearts -= amount;
    player.invuln = INVULN_TIME;
    player.hurtTime = 0.35;
    var dir = fromX == null ? -player.face : (player.x < fromX ? -1 : 1);
    player.vx = dir * 150;
    player.vy = -170;
    player.onGround = false;
    shake = Math.max(shake, 5);
    flash('#ff3355', 0.5);
    if (player.hearts <= 0) killPlayer();
    else PitSound.play('hurt');
  }

  function killPlayer() {
    if (player.dead) return;
    player.dead = true;
    player.hearts = 0;
    player.vy = -260;
    player.vx = -player.face * 60;
    state = 'DEAD';
    stateTime = 0;
    lives--;
    shake = 8;
    PitSound.play('death');
    PitSound.setIntensity(0);
    showBanner('', '', 0);
  }

  function updatePlayer(dt) {
    var p = player;
    p.animTime += dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.stompGrace > 0) p.stompGrace -= dt;
    if (p.hurtTime > 0) p.hurtTime -= dt;
    p.hitWall = 0;

    var wasGround = p.onGround;
    p.onGround = false;

    // ---- horizontal ----
    var want = 0;
    if (held('left')) want -= 1;
    if (held('right')) want += 1;
    if (p.hurtTime > 0.2) want = 0;      // brief loss of control on a hit

    var accel = wasGround ? RUN_ACCEL : AIR_ACCEL;
    if (want !== 0) {
      p.vx = approach(p.vx, want * RUN_SPEED, accel * dt);
      p.face = want;
    } else if (wasGround) {
      p.vx = approach(p.vx, 0, GROUND_FRICTION * dt);
    } else {
      p.vx = approach(p.vx, 0, AIR_ACCEL * 0.35 * dt);
    }

    // ---- jump ----
    if (takeJump()) p.buffer = JUMP_BUFFER;
    if (p.buffer > 0) p.buffer -= dt;
    if (wasGround) p.coyote = COYOTE;
    else if (p.coyote > 0) p.coyote -= dt;

    if (p.buffer > 0 && p.coyote > 0 && !p.dead) {
      p.vy = -JUMP_V;
      p.coyote = 0; p.buffer = 0;
      PitSound.play('jump');
      for (var i = 0; i < 4; i++) {
        parts.push({
          x: p.x + rnd(-5, 5), y: p.y, vx: rnd(-40, 40), vy: rnd(-10, 30),
          life: 0.25, max: 0.25, col: '#6fe8ff', size: 1, g: 60
        });
      }
    }
    // Releasing early cuts the arc — the whole reason the jump feels good.
    if (!held('jump') && p.vy < 0) p.vy *= Math.pow(JUMP_CUT, dt * 60);

    // ---- attack ----
    if (takeAttack() && p.attack < 0 && !p.dead) {
      p.attack = 0;
      p.hasHitThisSwing = false;
      p.stabBounced = false;
      p.attackKind = (!wasGround && held('down')) ? 'stab' : 'swing';
      PitSound.play('swing');
    }
    if (p.attack >= 0) {
      p.attack += dt;
      if (p.attack > ATTACK_TIME) p.attack = -1;
    }

    // ---- integrate ----
    p.vy = Math.min(MAX_FALL, p.vy + GRAV * dt);
    moveX(p, p.vx * dt);
    moveY(p, p.vy * dt, held('down') && p.vy > 0);

    if (p.onGround && !wasGround && p.vy === 0) PitSound.play('land');

    if (p.dead) return;

    // ---- hazards ----
    var hz = hazardUnder(p);
    if (hz === '~') {
      // Ink is a heart and a shove back to daylight, never an instant death.
      hurtPlayer(1, null);
      p.vy = -300;
      p.y -= 4;
      burst(p.x, p.y, 12, ['#4de0c0', '#b6ffee', '#2189ad'], 130, 0.5, 2, 200);
      PitSound.play('squish');
    } else if (hz === '^' || hz === 'v') {
      hurtPlayer(1, null);
    }

    // ---- pickups ----
    for (var k = pickups.length - 1; k >= 0; k--) {
      var pk = pickups[k];
      pk.t += dt;
      if (Math.abs(pk.x - p.x) < 12 && Math.abs(pk.y - (p.y - PLAYER_H / 2)) < 16) {
        pickups.splice(k, 1);
        switch (pk.kind) {
          case 'glimmer':
            addScore(50, pk.x, pk.y - 6);
            PitSound.play('glimmer');
            burst(pk.x, pk.y, 8, ['#b6ffee', '#4de0c0', '#ffffff'], 90, 0.4, 1, 40);
            break;
          case 'heart':
            player.hearts = Math.min(MAX_HEARTS, player.hearts + 1);
            floatText(pk.x, pk.y - 6, 'HEART', '#ff8fa6');
            PitSound.play('heal');
            break;
          case 'keen':
            // Stacking a second one would trivialise the boss, so it tops up
            // rather than compounds.
            player.keen = true;
            addScore(250, pk.x, pk.y - 16);
            floatText(pk.x, pk.y - 6, 'KEEN EDGE!', '#ffd23f');
            PitSound.play('keen');
            burst(pk.x, pk.y, 14, ['#ffd23f', '#eef6ff', '#fff4c0'], 130, 0.6, 2, 60);
            flash('#ffd23f', 0.3);
            break;
          case 'shield':
            player.shield = true;
            addScore(250, pk.x, pk.y - 16);
            floatText(pk.x, pk.y - 6, 'SHIELD!', '#7db4f2');
            PitSound.play('shieldUp');
            burst(pk.x, pk.y, 14, ['#4a8ade', '#cfe6ff', '#ffffff'], 130, 0.6, 2, 60);
            flash('#4a8ade', 0.3);
            break;
          case 'life':
            lives++;
            addScore(1000, pk.x, pk.y - 16);
            floatText(pk.x, pk.y - 6, 'EXTRA BOB!', '#ffd23f');
            PitSound.play('extraLife');
            burst(pk.x, pk.y, 24, ['#ffd23f', '#fff4c0', '#ffffff'], 170, 0.9, 2, 60);
            flash('#ffd23f', 0.5);
            break;
        }
      }
    }

    // ---- the gate onward ----
    if (map.gate && state === 'PLAY') {
      if (Math.abs(p.x - map.gate.x) < 16 && Math.abs((p.y - PLAYER_H / 2) - map.gate.y) < 28) {
        enterArena();
      }
    }
  }

  /* ---------- enemies ------------------------------------------------------ */
  function hurtEnemy(e, dmg, fromX) {
    if (e.invincible) { PitSound.play('clang'); return false; }
    e.hp -= dmg;
    e.hurt = 0.14;
    if (e.hp <= 0) {
      killEnemy(e);
      return true;
    }
    PitSound.play('hit');
    if (fromX != null) e.x += (e.x < fromX ? -2 : 2);
    return true;
  }

  function killEnemy(e) {
    var idx = enemies.indexOf(e);
    if (idx >= 0) enemies.splice(idx, 1);
    addScore(e.score || 100, e.x, e.y - e.h);

    /* Rare drops. The extra life is deliberately scarce — at 2.5% a run of
     * three or four levels usually yields one, which is often enough to feel
     * like a reward and rare enough that it never feels expected. */
    var roll = Math.random();
    if (roll < 0.025) pickups.push(makePickup('life', e.x, e.y - 12));
    else if (roll < 0.075 && !player.shield) pickups.push(makePickup('shield', e.x, e.y - 12));
    else if (roll < 0.11 && !player.keen) pickups.push(makePickup('keen', e.x, e.y - 12));
    PitSound.play('squish');
    var cols = e.kind === 'bat' ? ['#a37fe0', '#7dfcff', '#d2b8f5']
      : e.kind === 'pod' ? ['#b6ff4d', '#95ac2f', '#e6ec93']
        : ['#f5a63f', '#e07a24', '#ffd98a'];
    burst(e.x, e.y - e.h / 2, 14, cols, 150, 0.55, 2);
  }

  function updateEnemies(dt) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.hurt > 0) e.hurt -= dt;
      e.anim += dt;

      if (e.kind === 'gremlin') {
        e.vy = Math.min(MAX_FALL, e.vy + GRAV * dt);
        e.hitWall = 0;
        moveX(e, e.vx * dt);
        e.onGround = false;
        moveY(e, e.vy * dt, false);
        if (e.hitWall) e.vx = -e.vx;

        var seesBob = Math.abs(player.x - e.x) < 104 &&
          Math.abs((player.y - PLAYER_H / 2) - (e.y - e.h / 2)) < 40 && !player.dead;
        if (seesBob && e.alerted <= 0) {
          e.screech = 0.35;
          PitSound.play('spit');
        }
        e.alerted = seesBob ? 1.4 : Math.max(0, e.alerted - dt);
        if (e.screech > 0) e.screech -= dt;

        var speed = 30 * speedScale() * (e.alerted > 0 ? 2.3 : 1);
        if (e.alerted > 0) e.vx = (player.x < e.x ? -1 : 1) * speed;
        else if (Math.abs(e.vx) > 1) e.vx = (e.vx > 0 ? 1 : -1) * speed;

        // Turn at ledges, but only while patrolling — a charging gremlin will
        // happily run straight off a platform after Bob.
        if (e.onGround && e.alerted <= 0) {
          var gx = e.x + (e.vx > 0 ? e.w / 2 + 3 : -e.w / 2 - 3);
          var gt = tileAt(Math.floor(gx / TILE), Math.floor(e.y / TILE));
          if (!isSolid(gt) && gt !== SHELF) e.vx = -e.vx;
        }
        e.face = e.vx > 0 ? 1 : -1;

      } else if (e.kind === 'grub') {
        e.vy = Math.min(MAX_FALL, e.vy + GRAV * dt);
        e.hitWall = 0;
        moveX(e, e.vx * dt);
        e.onGround = false;
        moveY(e, e.vy * dt, false);
        if (e.hitWall) e.vx = -e.vx;
        // Turn at ledges so crawlers stay on their platform.
        if (e.onGround) {
          var aheadX = e.x + (e.vx > 0 ? e.w / 2 + 3 : -e.w / 2 - 3);
          if (!isSolid(tileAt(Math.floor(aheadX / TILE), Math.floor(e.y / TILE))) &&
              tileAt(Math.floor(aheadX / TILE), Math.floor(e.y / TILE)) !== SHELF) {
            e.vx = -e.vx;
          }
        }
        e.face = e.vx > 0 ? 1 : -1;

      } else if (e.kind === 'bat') {
        e.phase += dt * 2.4;
        var dx = player.x - e.x;
        if (!e.alerted && Math.abs(dx) < 110) { e.alerted = true; }
        if (e.alerted) {
          e.vx = approach(e.vx, clamp(dx, -1, 1) * 62 * speedScale(), 110 * dt);
          var wantY = player.y - PLAYER_H / 2 - 6;
          e.vy = approach(e.vy, clamp(wantY - e.y, -40, 40), 130 * dt);
        } else {
          e.vx = approach(e.vx, 0, 60 * dt);
          e.vy = approach(e.vy, (e.homeY - e.y) * 2, 90 * dt);
        }
        e.x += (e.vx + Math.cos(e.phase) * 18) * dt;
        e.y += (e.vy + Math.sin(e.phase * 1.7) * 26) * dt;
        // Bats ignore shelves but must not phase through rock.
        var tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
        if (isSolid(tileAt(tx, ty))) {
          e.y = ty * TILE + (e.vy > 0 ? -1 : TILE + e.h + 1);
          e.vy = -e.vy * 0.5;
        }
        e.face = e.vx > 0 ? 1 : -1;

      } else if (e.kind === 'pod') {
        e.cool -= dt;
        e.open = Math.max(0, e.open - dt);
        if (e.cool <= 0 && Math.abs(player.x - e.x) < 190) {
          e.cool = rnd(1.6, 2.8) / speedScale();
          e.open = 0.45;
          var a = Math.atan2((player.y - PLAYER_H / 2) - (e.y - e.h), player.x - e.x);
          shots.push({
            x: e.x, y: e.y - e.h + 2,
            vx: Math.cos(a) * 105, vy: Math.sin(a) * 105 - 40,
            r: 4, life: 3.2, col: '#b6ff4d', spin: 0, gravity: 130
          });
          PitSound.play('spit');
        }
        e.face = player.x < e.x ? -1 : 1;

      } else if (e.kind === 'shroom') {
        e.squash = Math.max(0, e.squash - dt * 3);
      }

      // ---- contact with Bob ----
      var pb = { x: player.x - PLAYER_W / 2, y: player.y - PLAYER_H, w: PLAYER_W, h: PLAYER_H };
      var overlap = pb.x < e.x + e.w / 2 && pb.x + pb.w > e.x - e.w / 2 &&
        pb.y < e.y && pb.y + pb.h > e.y - e.h;

      if (overlap) {
        if (e.kind === 'shroom') {
          // Only launches on a downward approach, so you cannot walk up it.
          if (player.vy > 40 && player.y <= e.y - e.h + 8) {
            player.vy = -430;
            player.y = e.y - e.h;
            e.squash = 1;
            PitSound.play('bounce');
            burst(e.x, e.y - e.h, 8, ['#ffc2e4', '#e582c0', '#ffffff'], 110, 0.4, 1, 120);
          }
        } else if (player.attack >= 0 && player.attackKind === 'stab' && player.vy > 0) {
          // Pogo: a downward stab kills and bounces in one motion.
          if (hurtEnemy(e, player.keen ? 3 : 2, player.x) && !player.stabBounced) {
            player.vy = -STAB_BOUNCE;
            player.stabBounced = true;
          }
        } else if (player.vy > 40 && player.y <= e.y - e.h + 12) {
          /* Stomp. Landing on something counts, dagger or no dagger — the
           * platformer instinct is to jump on it, and punishing that with a
           * heart taught the wrong lesson. Weaker than the down-stab, so the
           * stab is still worth aiming for. */
          player.y = e.y - e.h;          // snap on top, or the next frame
          player.vy = -STAB_BOUNCE * 0.82;   // re-reads this as a body blow
          player.stabBounced = true;
          player.stompGrace = 0.22;
          hurtEnemy(e, player.keen ? 2 : 1, player.x);
          burst(player.x, e.y - e.h, 8, ['#ffffff', '#b6ffee'], 110, 0.35, 2, 160);
          shake = Math.max(shake, 2);
        } else if (player.stompGrace <= 0) {
          hurtPlayer(1, e.x);
        }
      }

      // ---- Bob's cleaver ----
      var box = attackBox();
      if (box && !player.hasHitThisSwing && e.kind !== 'shroom' && boxOverlapEntity(box, e)) {
        player.hasHitThisSwing = player.attackKind !== 'stab';
        if (hurtEnemy(e, player.keen ? 2 : 1, player.x) && player.attackKind === 'stab' && !player.stabBounced) {
          player.vy = -STAB_BOUNCE;
          player.stabBounced = true;
        }
        shake = Math.max(shake, 2);
      }
    }
  }

  function updateShots(dt) {
    for (var i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.life -= dt;
      if (s.gravity) s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += dt * 6;

      var tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
      if (s.life <= 0 || isSolid(tileAt(tx, ty))) {
        burst(s.x, s.y, 6, [s.col, '#ffffff'], 70, 0.3, 1, 80);
        shots.splice(i, 1);
        continue;
      }
      if (!player.dead && dist(s.x, s.y, player.x, player.y - PLAYER_H / 2) < s.r + 8) {
        hurtPlayer(1, s.x);
        burst(s.x, s.y, 8, [s.col, '#ffffff'], 90, 0.35, 1, 80);
        shots.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (i = floats.length - 1; i >= 0; i--) {
      var f = floats[i];
      f.life -= dt;
      f.y -= 26 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }

  /* ---------- the Plancktopus --------------------------------------------
   * From the boss design: a tall, upright, heavily ridged slate-blue body
   * standing on its own tentacles, coral bristles down one flank, one huge
   * red-irised eye set high and to one side, and an enormous maw of sharp
   * conical teeth underneath it.
   *
   * The fight reads off two things the art already gives us. Tentacles CURL
   * UP against the body when idle — high, tucked, out of a goblin's reach —
   * and only stretch out flat along the floor when they strike. So an
   * extended arm is a spent arm: harmless for about two seconds, and the
   * only time it is low enough to cut. Bait a slam, dodge, chop.
   *
   * The eye is likewise unreachable until every arm is off, at which point
   * the body slumps down onto its stumps and brings the eye into range.
   */
  var BOSS_BODY_W = 86;
  var BOSS_BODY_H = 152;
  var BOSS_SLUMP_H = 92;

  function tentacleCount(lv) { return Math.min(8, 2 + lv); }

  function regrowTime(lv) { return Math.max(6.5, 11 - (lv - 1) * 0.5); }

  /* Body profile: a rounded crown over near-parallel flanks with a slight
   * flare at the base. Returns the half-width at `t` (0 = crown, 1 = floor)
   * as a fraction of BOSS_BODY_W / 2. Every part of the boss — silhouette,
   * ridge bands, bristles, hit test — is derived from this one curve, so the
   * drawn shape and the collision shape cannot drift apart. */
  function bossHalfWidth(t) {
    if (t < 0.28) {
      var u = (0.28 - t) / 0.28;
      return Math.sqrt(Math.max(0, 1 - u * u)) * 0.92;
    }
    var v = (t - 0.28) / 0.72;
    return 0.92 + 0.08 * Math.sin(v * Math.PI);
  }

  function bossTop(b) { return b.baseY - b.h; }

  // The eye sits high and off-centre, exactly as drawn.
  function bossEye(b) {
    return { x: b.x - 24, y: bossTop(b) + b.h * 0.30, r: b.eyeR };
  }

  function bossMouth(b) {
    return {
      x: b.x - 2,
      y: bossTop(b) + b.h * 0.63,
      w: 78,
      h: 12 + b.mouth * 40
    };
  }

  function makeBoss(lv) {
    var n = tentacleCount(lv);
    var b = {
      x: W / 2,
      baseY: H - TILE,            // it stands on the arena floor
      h: BOSS_BODY_H,
      breathe: 0,
      mouth: 0.2, mouthTarget: 0.2,
      eyeR: 27, eyeOpen: 1,
      look: { x: 0, y: 0 },
      tentacles: [],
      attackCool: 2.2,
      spitCool: 4.5,
      phase: 'FIGHT',             // FIGHT | EXPOSED | DYING
      exposeTimer: 0,
      hurtFlash: 0,
      dead: false,
      regrow: regrowTime(lv),
      level: lv
    };

    // Arms alternate sides working outward, so the spread stays symmetric
    // whether the level has three of them or eight.
    for (var i = 0; i < n; i++) {
      b.tentacles.push(makeTentacle(b, (i % 2 === 0) ? -1 : 1, Math.floor(i / 2), i));
    }
    return b;
  }

  function makeTentacle(b, side, rank, idx) {
    var ax = b.x + side * (26 + rank * 13);
    var ay = b.baseY - 20;
    return {
      idx: idx, side: side, rank: rank,
      ax: ax, ay: ay,
      tipX: ax + side * 30, tipY: ay - 40,
      phase: rnd(0, 6.28),
      bow: rnd(20, 34) * side,
      hp: BOSS_TENTACLE_HP, maxHp: BOSS_TENTACLE_HP,
      hurt: 0,
      state: 'idle',              // idle wind strike held retract severed regrow
      timer: rnd(1, 3),
      grow: 1,
      severTimer: 0,
      sweepDir: 1,
      targetX: ax, targetY: ay,
      hitCool: 0
    };
  }

  // Curled up and tucked against the flank: high, and deliberately nowhere
  // near Bob's dagger.
  function tentacleIdleGoal(t, b) {
    var wob = Math.sin(t.phase) * 10;
    return {
      x: t.ax + t.side * (40 + t.rank * 11) + wob,
      y: t.ay - 58 - t.rank * 11 + Math.cos(t.phase * 0.8) * 8
    };
  }

  // Sampled points along the arm, tip last. Drawing AND hit detection both
  // read this, so what you can see really is what you can cut.
  function tentaclePoints(t) {
    var pts = [];
    var dx = t.tipX - t.ax, dy = t.tipY - t.ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -dy / len, py = dx / len;
    var bowAmt = t.state === 'strike' ? t.bow * 0.15 : t.bow;
    var n = TENT_SEGMENTS;
    for (var i = 0; i <= n; i++) {
      var s = i / n;
      var curl = Math.sin(s * Math.PI) * bowAmt + Math.sin(s * 5 + t.phase * 2) * 5 * s;
      pts.push({
        x: t.ax + dx * s * t.grow + px * curl * t.grow,
        y: t.ay + dy * s * t.grow + py * curl * t.grow,
        r: (10 - 6.5 * s) * (0.4 + 0.6 * t.grow),
        s: s
      });
    }
    return pts;
  }

  function tentacleDangerous(t) { return t.state === 'strike'; }
  function tentacleAlive(t) { return t.state !== 'severed'; }

  function orderAttack(b, t) {
    t.state = 'wind';
    t.timer = 0.55;
    b.mouthTarget = 0.95;                      // it gapes before it swings
    t.mode = Math.random() < 0.35 ? 'sweep' : 'slam';
    if (t.mode === 'sweep') {
      t.sweepDir = player.x < b.x ? 1 : -1;
      t.targetX = t.sweepDir > 0 ? 30 : W - 30;
    } else {
      t.targetX = clamp(player.x, 26, W - 26);
    }
    t.targetY = H - 24;
  }

  function severTentacle(b, t) {
    t.state = 'severed';
    t.severTimer = b.regrow;
    t.hp = 0;
    var pts = tentaclePoints(t);
    for (var i = 3; i < pts.length; i++) {
      burst(pts[i].x, pts[i].y, 3, ['#ef4b52', '#ff8a80', '#2f4a72', '#a82c3c'], 150, 0.7, 2, 320);
    }
    addScore(500, t.tipX, t.tipY);
    floatText(b.x, bossTop(b) - 10, pick(SEVER_QUIPS), '#ff8a80');
    shake = Math.max(shake, 6);
    flash('#ff8a80', 0.35);
    PitSound.play('sever');
    b.hurtFlash = 0.25;
    b.mouthTarget = 1;
  }

  function liveTentacles(b) {
    var n = 0;
    for (var i = 0; i < b.tentacles.length; i++) if (tentacleAlive(b.tentacles[i])) n++;
    return n;
  }

  function updateBoss(dt) {
    var b = boss;
    b.breathe += dt;
    if (b.hurtFlash > 0) b.hurtFlash -= dt;

    var eye = bossEye(b);

    // The eye tracks Bob. It is most of the boss's personality.
    var tx = player.x - eye.x, ty = (player.y - PLAYER_H / 2) - eye.y;
    var tl = Math.sqrt(tx * tx + ty * ty) || 1;
    b.look.x = approach(b.look.x, (tx / tl) * 8, 30 * dt);
    b.look.y = approach(b.look.y, (ty / tl) * 7, 30 * dt);

    // The maw drifts back to a resting snarl between attacks.
    b.mouthTarget = approach(b.mouthTarget, b.phase === 'EXPOSED' ? 0.85 : 0.2, 0.7 * dt);
    b.mouth = approach(b.mouth, b.mouthTarget, 3.5 * dt);

    var live = liveTentacles(b);
    PitSound.setIntensity(1 - live / b.tentacles.length);

    if (b.phase === 'FIGHT') {
      b.h = approach(b.h, BOSS_BODY_H + Math.sin(b.breathe * 1.4) * 3, 90 * dt);
      b.eyeOpen = approach(b.eyeOpen, 1, 3 * dt);

      // Fewer arms left means faster, more desperate swings.
      b.attackCool -= dt * (1 + (b.tentacles.length - live) * 0.22);
      if (b.attackCool <= 0) {
        var candidates = [];
        for (var i = 0; i < b.tentacles.length; i++) {
          if (b.tentacles[i].state === 'idle') candidates.push(b.tentacles[i]);
        }
        if (candidates.length) orderAttack(b, pick(candidates));
        b.attackCool = Math.max(0.55, (1.9 - (b.level - 1) * 0.08) * rnd(0.75, 1.25));
      }

      // Ink spat straight out of the maw.
      b.spitCool -= dt;
      if (b.spitCool <= 0) {
        b.spitCool = rnd(3.0, 5.0) / (1 + (b.level - 1) * 0.08);
        b.mouthTarget = 1;
        var m = bossMouth(b);
        var a = Math.atan2((player.y - PLAYER_H / 2) - m.y, player.x - m.x);
        for (var k = -1; k <= 1; k++) {
          shots.push({
            x: m.x, y: m.y,
            vx: Math.cos(a + k * 0.22) * 135, vy: Math.sin(a + k * 0.22) * 135,
            r: 5, life: 3.5, col: '#ef4b52', spin: 0, gravity: 90
          });
        }
        PitSound.play('spit');
      }

      // Every arm off at once — the only way to open the eye.
      if (live === 0) {
        b.phase = 'EXPOSED';
        b.exposeTimer = EXPOSE_TIME;
        showBanner('STRIKE THE EYE!', '', 1.6);
        PitSound.play('expose');
        flash('#ffffff', 0.5);
        shake = 6;
      }

    } else if (b.phase === 'EXPOSED') {
      // It slumps onto its stumps, which is what brings the eye into range.
      b.h = approach(b.h, BOSS_SLUMP_H + Math.sin(b.breathe * 3) * 2, 110 * dt);
      b.eyeOpen = approach(b.eyeOpen, 1.35, 2 * dt);
      b.exposeTimer -= dt;
      if (b.exposeTimer <= 0) {
        b.phase = 'FIGHT';
        for (var r = 0; r < b.tentacles.length; r++) {
          var t2 = b.tentacles[r];
          t2.state = 'regrow';
          t2.grow = 0;
          t2.hp = t2.maxHp;
        }
        showBanner('TOO SLOW!', 'THEY ALL CAME BACK.', 1.8);
        PitSound.play('roar');
        b.mouthTarget = 1;
        shake = 7;
      }
    }

    for (var j = 0; j < b.tentacles.length; j++) updateTentacle(b, b.tentacles[j], dt);

    // ---- the eye as a target ----
    if (b.phase === 'EXPOSED') {
      var box = attackBox();
      if (box && boxHit(box, eye.x, eye.y, eye.r + 4)) {
        b.phase = 'DYING';
        b.dead = true;
        shake = 12;
        flash('#ffffff', 0.9);
        PitSound.play('eyeHit');
        burst(eye.x, eye.y, 44, ['#e8383c', '#ffd8c8', '#ffffff', '#ff8a80'], 220, 1.0, 3, 200);
        addScore(2500 + level * 500, eye.x, eye.y - 20);
        levelClear();
      }
    }

    // The body itself hurts to touch. Tested against the same profile curve
    // that draws it, so the damage zone matches the silhouette.
    if (!player.dead && b.phase !== 'DYING') {
      var py = player.y - PLAYER_H / 2;
      var top = bossTop(b);
      if (py > top && py < b.baseY) {
        var t3 = (py - top) / b.h;
        if (Math.abs(player.x - b.x) < bossHalfWidth(t3) * BOSS_BODY_W / 2 + 6) {
          hurtPlayer(1, b.x);
        }
      }
    }
  }

  function updateTentacle(b, t, dt) {
    t.phase += dt * (t.state === 'idle' ? 1.1 : 2.2);
    if (t.hurt > 0) t.hurt -= dt;
    if (t.hitCool > 0) t.hitCool -= dt;

    // Anchors ride the base of the body as it breathes and slumps.
    t.ax = b.x + t.side * (26 + t.rank * 13);
    t.ay = b.baseY - 20;

    var ease = 3, goal;

    switch (t.state) {
      case 'severed':
        t.grow = approach(t.grow, 0, 5 * dt);
        if (b.phase !== 'EXPOSED') {
          t.severTimer -= dt;
          if (t.severTimer <= 0) {
            t.state = 'regrow';
            t.grow = 0;
            t.hp = t.maxHp;
            PitSound.play('regrow');
            floatText(t.ax, t.ay - 26, 'IT GREW BACK!', '#ff8a80');
          }
        }
        return;

      case 'regrow':
        t.grow = approach(t.grow, 1, 1.4 * dt);
        goal = tentacleIdleGoal(t, b);
        ease = 4;
        if (t.grow >= 1) { t.state = 'idle'; t.timer = rnd(1, 2.5); }
        break;

      case 'idle':
        goal = tentacleIdleGoal(t, b);
        ease = 2.2;
        break;

      case 'wind':
        // Rears up and back. This is the telegraph the whole fight hangs on.
        goal = { x: t.ax + t.side * 20, y: t.ay - 70 };
        ease = 7;
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = 'strike';
          t.timer = t.mode === 'sweep' ? 1.5 : 0.42;
          PitSound.play('swing');
        }
        break;

      case 'strike':
        if (t.mode === 'sweep') {
          t.targetX = clamp(t.targetX + t.sweepDir * 230 * dt, 20, W - 20);
        }
        goal = { x: t.targetX, y: t.targetY };
        ease = t.mode === 'sweep' ? 12 : 17;
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = 'held';
          t.timer = 0.85;
          shake = Math.max(shake, 4);
          PitSound.play('land');
          burst(t.tipX, t.tipY, 10, ['#ef4b52', '#2f4a72', '#ff8a80'], 130, 0.45, 2, 260);
        }
        break;

      case 'held':
        // Stretched out flat and inert: the punish window.
        goal = { x: t.targetX, y: t.targetY - 4 };
        ease = 5;
        t.timer -= dt;
        if (t.timer <= 0) { t.state = 'retract'; t.timer = 0.9; }
        break;

      case 'retract':
        goal = tentacleIdleGoal(t, b);
        ease = 3.2;
        t.timer -= dt;
        if (t.timer <= 0) { t.state = 'idle'; t.timer = rnd(0.8, 2.2); }
        break;

      default:
        goal = tentacleIdleGoal(t, b);
    }

    var f = 1 - Math.exp(-ease * dt);
    t.tipX = lerp(t.tipX, goal.x, f);
    t.tipY = lerp(t.tipY, goal.y, f);

    var pts = tentaclePoints(t);
    var i;

    // ---- arm hurts Bob ----
    if (tentacleDangerous(t) && !player.dead) {
      for (i = 6; i < pts.length; i++) {
        if (dist(pts[i].x, pts[i].y, player.x, player.y - PLAYER_H / 2) < pts[i].r + 8) {
          hurtPlayer(1, pts[i].x);
          break;
        }
      }
    }

    // ---- Bob hurts arm ----
    var box = attackBox();
    if (box && t.hitCool <= 0) {
      for (i = 3; i < pts.length; i++) {
        if (boxHit(box, pts[i].x, pts[i].y, pts[i].r + 2)) {
          t.hp -= player.keen ? 2 : 1;
          t.hurt = 0.16;
          t.hitCool = 0.16;
          shake = Math.max(shake, 3);
          burst(pts[i].x, pts[i].y, 7, ['#ef4b52', '#ffffff', '#ff8a80'], 130, 0.4, 2, 220);
          if (player.attackKind === 'stab' && !player.stabBounced) {
            player.vy = -STAB_BOUNCE;
            player.stabBounced = true;
          }
          if (t.hp <= 0) severTentacle(b, t);
          else PitSound.play('hit');
          break;
        }
      }
    }
  }

  /* ---------- flow --------------------------------------------------------- */
  function startRun() {
    level = 1;
    score = 0;
    lives = START_LIVES;
    PitSound.unlock();
    PitSound.startMusic();
    PitSound.play('start');
    beginLevel();
  }

  function beginLevel() {
    map = loadMap(GAUNTLETS[(level - 1) % GAUNTLETS.length], false);
    mapW = map.pxW;
    player = makePlayer(map.start.x, map.start.y);
    boss = null;
    spawnFromMap();
    buildBackdrop();
    camX = clamp(player.x - W / 2, 0, mapW - W);
    PitSound.setMode('cave');
    PitSound.setDepth(level);
    PitSound.setIntensity(0.2);
    state = 'CARD';
    stateTime = 0;
  }

  function enterArena() {
    map = loadMap(ARENA, true);
    mapW = map.pxW;
    player = makePlayer(map.start.x, map.start.y);
    player.hearts = Math.max(2, player.hearts);   // never enter the fight on fumes
    spawnFromMap();
    buildBackdrop();
    camX = 0;
    boss = makeBoss(level);
    state = 'BOSSIN';
    stateTime = 0;
    PitSound.setMode('boss');
    PitSound.play('gate');
    PitSound.play('roar');
    showBanner('THE PLANCKTOPUS', 'SEVER ALL ' + boss.tentacles.length + ' ARMS AT ONCE', 2.4);
  }

  function levelClear() {
    state = 'CLEAR';
    stateTime = 0;
    PitSound.play('victory');
    PitSound.setMode('cave');
    PitSound.setIntensity(0);
  }

  function nextLevel() {
    level++;
    beginLevel();
  }

  function respawn() {
    if (lives <= 0) {
      state = 'OVER';
      stateTime = 0;
      PitSound.stopMusic();
      return;
    }
    if (boss) {
      // Dying in the arena resets the fight, not the whole level.
      player = makePlayer(map.start.x, map.start.y);
      shots.length = 0;
      boss = makeBoss(level);
      state = 'BOSSIN';
      stateTime = 0;
      PitSound.setMode('boss');
      showBanner('AGAIN.', 'SEVER ALL ' + boss.tentacles.length + ' ARMS AT ONCE', 2.0);
    } else {
      player = makePlayer(map.start.x, map.start.y);
      spawnFromMap();
      camX = clamp(player.x - W / 2, 0, mapW - W);
      state = 'PLAY';
      stateTime = 0;
      PitSound.setMode('cave');
    }
  }

  var paused = false;
  function togglePause() {
    if (state === 'TITLE' || state === 'OVER') return;
    paused = !paused;
    syncButtons();
  }

  function toggleSound() {
    var on = PitSound.toggle();
    syncButtons();
    return on;
  }

  /* ---------- update ------------------------------------------------------- */
  function update(dt) {
    stateTime += dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 22);
    if (flashAmt > 0) flashAmt = Math.max(0, flashAmt - dt * 2.6);
    if (bannerTime > 0) bannerTime -= dt;

    dripTimer -= dt;
    if (dripTimer <= 0) { dripTimer = rnd(2.5, 7); PitSound.play('drip'); }

    updateParticles(dt);

    switch (state) {
      case 'TITLE':
        if (takeJump() || takeAttack()) startRun();
        break;

      case 'CARD':
        if (stateTime > 2.2 || takeJump() || takeAttack()) {
          state = 'PLAY';
          stateTime = 0;
          PitSound.setIntensity(0.35);
        }
        break;

      case 'PLAY':
        updatePlayer(dt);
        updateEnemies(dt);
        updateShots(dt);
        updateCamera(dt);
        break;

      case 'BOSSIN':
        updatePlayer(dt);
        updateShots(dt);
        if (stateTime > 2.2) { state = 'BOSS'; stateTime = 0; }
        break;

      case 'BOSS':
        updatePlayer(dt);
        updateShots(dt);
        if (boss) updateBoss(dt);
        break;

      case 'DEAD':
        // Let Bob's ragdoll finish its arc before offering the retry.
        player.vy = Math.min(MAX_FALL, player.vy + GRAV * dt);
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        updateShots(dt);
        if (stateTime > 1.8 && (takeJump() || takeAttack())) respawn();
        if (stateTime > 4.5) respawn();
        break;

      case 'CLEAR':
        updateParticles(dt);
        if (stateTime > 3.4 || ((takeJump() || takeAttack()) && stateTime > 1.2)) nextLevel();
        break;

      case 'OVER':
        if (stateTime > 1.0 && (takeJump() || takeAttack())) { state = 'TITLE'; stateTime = 0; }
        break;
    }

    // Consume any edge that no state used, so it cannot fire a frame later.
    jumpEdge = false;
    attackEdge = false;
  }

  function updateCamera(dt) {
    var want = clamp(player.x - W / 2, 0, Math.max(0, mapW - W));
    camX = lerp(camX, want, 1 - Math.exp(-9 * dt));
    camX = clamp(camX, 0, Math.max(0, mapW - W));
  }

  /* ---------- backdrop ----------------------------------------------------- *
   * Three pre-rendered parallax layers plus a live mote field. Rendering them
   * once per level keeps the per-frame cost to three drawImage calls.
   */
  function makeGlowSprite() {
    var size = 64;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  // Additive glow blit. Everything bioluminescent goes through here, which is
  // what gives the cavern its bloom without an actual blur pass.
  function glow(x, y, r, colour, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    // Tint the white glow sprite by drawing it into the colour via a clip.
    ctx.drawImage(glowSprite, Math.round(x - r), Math.round(y - r), r * 2, r * 2);
    ctx.restore();
  }

  function tintedGlow(x, y, r, colour, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function buildBackdrop() {
    var w = Math.max(W, Math.ceil(mapW * 0.55) + W);
    backLayers = { far: null, mid: null, crystals: [], motes: [] };

    // --- far layer: dithered gradient plus soft rock silhouettes ---
    var far = document.createElement('canvas');
    far.width = Math.ceil(mapW * 0.25) + W;
    far.height = H;
    var fg = far.getContext('2d');
    var grad = fg.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#06050f');
    grad.addColorStop(0.45, '#0d0b22');
    grad.addColorStop(1, '#141033');
    fg.fillStyle = grad;
    fg.fillRect(0, 0, far.width, H);

    // Ordered dither between the bands so the gradient reads as 16-bit
    // rather than as a smooth modern blend.
    fg.fillStyle = 'rgba(30,26,72,0.5)';
    for (var dy = 0; dy < H; dy += 2) {
      var band = dy / H;
      for (var dx = (dy % 4 === 0 ? 0 : 2); dx < far.width; dx += 4) {
        if (Math.random() < band * 0.5) fg.fillRect(dx, dy, 2, 2);
      }
    }

    // Distant stalactites and stalagmites.
    fg.fillStyle = '#0a0820';
    var x = 0;
    while (x < far.width) {
      var bw = rndInt(26, 58);
      var bh = rndInt(30, 78);
      fg.beginPath();
      fg.moveTo(x, 0);
      fg.lineTo(x + bw / 2, bh);
      fg.lineTo(x + bw, 0);
      fg.closePath();
      fg.fill();
      fg.beginPath();
      fg.moveTo(x + 8, H);
      fg.lineTo(x + 8 + bw / 2, H - bh * 0.8);
      fg.lineTo(x + 8 + bw, H);
      fg.closePath();
      fg.fill();
      x += bw - rndInt(4, 12);
    }
    backLayers.far = far;

    // --- mid layer: closer rock, with glow-moss veins ---
    var mid = document.createElement('canvas');
    mid.width = Math.ceil(mapW * 0.5) + W;
    mid.height = H;
    var mg = mid.getContext('2d');
    mg.fillStyle = 'rgba(0,0,0,0)';
    mg.clearRect(0, 0, mid.width, H);
    mg.fillStyle = '#12102c';
    var mx = 0;
    while (mx < mid.width) {
      var mw = rndInt(40, 90);
      var mh = rndInt(24, 60);
      mg.beginPath();
      mg.moveTo(mx, 0);
      mg.lineTo(mx + mw * 0.35, mh);
      mg.lineTo(mx + mw * 0.7, mh * 0.5);
      mg.lineTo(mx + mw, 0);
      mg.closePath();
      mg.fill();

      mg.beginPath();
      mg.moveTo(mx + 12, H);
      mg.lineTo(mx + 12 + mw * 0.3, H - mh);
      mg.lineTo(mx + 12 + mw * 0.65, H - mh * 0.4);
      mg.lineTo(mx + 12 + mw, H);
      mg.closePath();
      mg.fill();
      mx += mw - 10;
    }
    // Veins of glow moss picked out along the silhouette edges.
    mg.fillStyle = '#1d6f6a';
    for (var v = 0; v < mid.width; v += 3) {
      if (Math.random() < 0.18) mg.fillRect(v, rndInt(8, 46), 2, 1);
      if (Math.random() < 0.18) mg.fillRect(v, H - rndInt(8, 46), 2, 1);
    }
    backLayers.mid = mid;

    // --- crystal clusters: drawn live so they can pulse ---
    var count = Math.floor(mapW / 90);
    for (var c = 0; c < count; c++) {
      backLayers.crystals.push({
        x: rnd(0, mapW), y: rnd(24, H - 30),
        r: rnd(4, 11), hue: pick(['#4de0c0', '#6fe8ff', '#b06ae8', '#4de0ff']),
        phase: rnd(0, 6.28), par: rnd(0.55, 0.75)
      });
    }

    // --- drifting spore motes ---
    for (var m = 0; m < 46; m++) {
      backLayers.motes.push({
        x: rnd(0, mapW), y: rnd(0, H),
        vy: rnd(-9, -2), vx: rnd(-7, 7),
        r: rnd(0.6, 1.8), a: rnd(0.25, 0.8), phase: rnd(0, 6.28)
      });
    }
  }

  function updateBackdrop(dt) {
    if (!backLayers) return;
    for (var i = 0; i < backLayers.motes.length; i++) {
      var m = backLayers.motes[i];
      m.phase += dt;
      m.x += (m.vx + Math.sin(m.phase * 0.8) * 4) * dt;
      m.y += m.vy * dt;
      if (m.y < -4) { m.y = H + 4; m.x = rnd(0, mapW); }
      if (m.x < -4) m.x = mapW + 4;
      if (m.x > mapW + 4) m.x = -4;
    }
  }

  /* ---------- render ------------------------------------------------------- */
  function drawBackdrop() {
    ctx.fillStyle = '#06050f';
    ctx.fillRect(0, 0, W, H);
    if (!backLayers) return;

    ctx.drawImage(backLayers.far, -Math.round(camX * 0.25), 0);
    ctx.drawImage(backLayers.mid, -Math.round(camX * 0.5), 0);

    // Crystal clusters, drawn as a solid facet plus an additive halo.
    var t = stateTime;
    for (var i = 0; i < backLayers.crystals.length; i++) {
      var c = backLayers.crystals[i];
      var sx = c.x - camX * c.par;
      if (sx < -40 || sx > W + 40) continue;
      var pulse = 0.6 + 0.4 * Math.sin(t * 1.6 + c.phase);
      tintedGlow(sx, c.y, c.r * 4.5, c.hue, 0.22 * pulse);
      ctx.fillStyle = c.hue;
      ctx.globalAlpha = 0.5 + 0.3 * pulse;
      ctx.beginPath();
      ctx.moveTo(sx, c.y - c.r);
      ctx.lineTo(sx + c.r * 0.55, c.y);
      ctx.lineTo(sx, c.y + c.r * 0.8);
      ctx.lineTo(sx - c.r * 0.55, c.y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Motes ride nearly with the camera so they read as "in the room".
    ctx.fillStyle = '#9ff2e0';
    for (var m = 0; m < backLayers.motes.length; m++) {
      var mo = backLayers.motes[m];
      var mx = mo.x - camX * 0.85;
      if (mx < -4 || mx > W + 4) continue;
      ctx.globalAlpha = mo.a * (0.5 + 0.5 * Math.sin(mo.phase * 2));
      ctx.fillRect(Math.round(mx), Math.round(mo.y), Math.ceil(mo.r), Math.ceil(mo.r));
    }
    ctx.globalAlpha = 1;
  }

  function drawTiles() {
    var x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    var x1 = Math.min(map.w - 1, Math.ceil((camX + W) / TILE));
    var T = A.tile;

    for (var ty = 0; ty < MAP_H; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        var ch = map.grid[ty][tx];
        if (ch === '.') continue;
        var px = Math.round(tx * TILE - camX), py = ty * TILE;
        var v = tileHash(tx, ty) < 0.5 ? 0 : 1;

        if (ch === SOLID) {
          var above = tileAt(tx, ty - 1);
          var below = tileAt(tx, ty + 1);
          if (!isSolid(above) && above !== undefined && ty > 0 && !isSolid(above)) {
            ctx.drawImage(T.top[v], px, py);
          } else if (!isSolid(below)) {
            ctx.drawImage(T.roof, px, py);
          } else {
            ctx.drawImage(T.fill[v], px, py);
          }
        } else if (ch === SHELF) {
          ctx.drawImage(T.shelf, px, py);
        } else if (ch === '^') {
          ctx.drawImage(T.spike, px, py);
        } else if (ch === 'v') {
          ctx.drawImage(T.spikeDown, px, py);
        } else if (ch === '~') {
          drawInk(px, py, tx, ty);
        }
      }
    }
  }

  // Ink is drawn rather than tiled: a moving surface line plus a glow so the
  // hazard is unmistakable even at the bottom edge of the screen.
  function drawInk(px, py, tx, ty) {
    var surface = !(tileAt(tx, ty - 1) === '~');
    ctx.fillStyle = '#0d3f4a';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#12626b';
    ctx.fillRect(px, py + 3, TILE, TILE - 3);
    if (surface) {
      var wob = Math.sin(stateTime * 2.4 + tx * 0.7) * 1.5;
      ctx.fillStyle = '#4de0c0';
      ctx.fillRect(px, py + Math.round(wob), TILE, 2);
      ctx.fillStyle = '#b6ffee';
      ctx.fillRect(px + ((Math.floor(stateTime * 8) + tx) % 4) * 4, py + Math.round(wob), 3, 1);
      tintedGlow(px + TILE / 2, py + 2, 22, '#4de0c0', 0.28);
    }
  }

  function drawGate() {
    if (!map.gate) return;
    var gx = map.gate.x - camX, gy = map.gate.y;
    if (gx < -40 || gx > W + 40) return;
    var pulse = 0.6 + 0.4 * Math.sin(stateTime * 3);
    tintedGlow(gx, gy, 40, '#b06ae8', 0.4 * pulse);
    ctx.strokeStyle = '#d9a3e6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gy + 8, 15, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(90,30,120,0.55)';
    ctx.beginPath();
    ctx.arc(gx, gy + 8, 14, Math.PI, 0);
    ctx.lineTo(gx - 14, gy + 8);
    ctx.fill();
    PitArt.drawTextCentredShadow(ctx, 'DOWN', gx, gy - 26, '#e6c8ff', 1);
  }

  function drawPickups() {
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      var x = p.x - camX;
      if (x < -20 || x > W + 20) continue;
      var bob = Math.sin(p.t * 2.6) * 2.5;
      if (p.kind === 'glimmer') {
        var pulse = 0.55 + 0.45 * Math.sin(p.t * 5);
        tintedGlow(x, p.y + bob, 16, '#b6ffee', 0.55 * pulse);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(x) - 1, Math.round(p.y + bob) - 3, 2, 6);
        ctx.fillRect(Math.round(x) - 3, Math.round(p.y + bob) - 1, 6, 2);
        ctx.fillStyle = '#4de0c0';
        ctx.fillRect(Math.round(x) - 1, Math.round(p.y + bob) - 5, 2, 2);
        ctx.fillRect(Math.round(x) - 1, Math.round(p.y + bob) + 3, 2, 2);
      } else if (p.kind === 'heart') {
        tintedGlow(x, p.y + bob, 18, '#ff5f7a', 0.4);
        PitArt.draw(ctx, A.heart, x, p.y + bob, false);
      } else {
        // Power-ups get a bigger, faster halo than a heart so they read as
        // rare from across the room.
        var hot = 0.5 + 0.5 * Math.sin(p.t * 6);
        var col = p.kind === 'shield' ? '#4a8ade' : '#ffd23f';
        var art = p.kind === 'shield' ? A.shield : (p.kind === 'keen' ? A.keen : A.lifeHeart);
        tintedGlow(x, p.y + bob, 26 + hot * 8, col, 0.45 + hot * 0.25);
        PitArt.draw(ctx, art, x, p.y + bob, false);
      }
    }
  }

  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var x = e.x - camX;
      if (x < -30 || x > W + 30) continue;
      var set, fi = 0, flashSet = null;

      if (e.kind === 'gremlin') {
        set = A.gremlin; flashSet = A.flash.gremlin;
        fi = Math.floor(e.anim * (e.alerted > 0 ? 13 : 6)) % 2;
        // Alerted gremlins get a coral glow, so a charge is visible before it
        // reaches you even at the edge of the screen.
        if (e.alerted > 0) tintedGlow(x, e.y - e.h / 2, 26, '#ef4b52', 0.22);
      } else if (e.kind === 'grub') {
        set = A.grub; flashSet = A.flash.grub;
        fi = Math.floor(e.anim * 7) % 2;
      } else if (e.kind === 'bat') {
        set = A.bat; flashSet = A.flash.bat;
        fi = Math.floor(e.anim * 9) % 2;
        tintedGlow(x, e.y, 20, '#7dfcff', 0.2);
      } else if (e.kind === 'pod') {
        set = A.pod; flashSet = A.flash.pod;
        fi = e.open > 0 ? 1 : 0;
        tintedGlow(x, e.y - e.h + 4, 22, '#b6ff4d', 0.18);
      } else {
        set = A.shroom;
        fi = e.squash > 0.2 ? 1 : 0;
        tintedGlow(x, e.y - e.h, 22, '#e582c0', 0.22);
      }

      var f = set[fi];
      var cy = e.y - f.h / 2;
      if (e.hurt > 0 && flashSet) PitArt.draw(ctx, flashSet[fi], x, cy, e.face < 0);
      else PitArt.draw(ctx, f, x, cy, e.face < 0);
    }
  }

  function drawShots() {
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      var x = s.x - camX;
      if (x < -20 || x > W + 20) continue;
      tintedGlow(x, s.y, s.r * 4, s.col, 0.5);
      ctx.fillStyle = s.col;
      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x - 1), Math.round(s.y - s.r + 1), 2, 2);
    }
  }

  function drawPlayer() {
    var p = player;
    if (p.invuln > 0 && !p.dead && Math.floor(p.invuln * 22) % 2 === 0) return;

    var set = A.bob.idle, fi = 0;
    if (p.dead) {
      set = A.bob.hurt; fi = 0;
    } else if (p.attack >= 0) {
      if (p.attackKind === 'stab') { set = A.bob.stab; fi = 0; }
      else {
        set = A.bob.swing;
        fi = p.attack < ATTACK_ACTIVE0 ? 0 : (p.attack < ATTACK_ACTIVE1 ? 1 : 2);
      }
    } else if (p.hurtTime > 0) {
      set = A.bob.hurt; fi = 0;
    } else if (!p.onGround) {
      set = p.vy < 0 ? A.bob.jump : A.bob.fall; fi = 0;
    } else if (Math.abs(p.vx) > 12) {
      set = A.bob.run;
      fi = Math.floor(p.animTime * 11) % 4;
    } else {
      set = A.bob.idle;
      fi = Math.floor(p.animTime * 2.2) % 2;
    }

    var f = set[fi];
    var x = p.x - camX;
    var y = p.y - f.h / 2;

    // Bob catches the cavern's light: a faint rim halo keeps him readable
    // against the busy parallax without a hard outline.
    tintedGlow(x, y, 26, '#4de0c0', 0.1);
    PitArt.draw(ctx, f, x, y, p.face < 0);

    // A shield bubble around Bob, so the free hit is visible in play and not
    // only in the HUD.
    if (p.shield) {
      var sp = 0.55 + 0.45 * Math.sin(stateTime * 4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30 + sp * 0.22;
      ctx.strokeStyle = '#7db4f2';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, p.y - PLAYER_H / 2, 17, 21, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Swing arc: a cheap streak that sells the reach of the cleaver.
    if (p.attack >= ATTACK_ACTIVE0 && p.attack <= ATTACK_ACTIVE1) {
      var a = 1 - (p.attack - ATTACK_ACTIVE0) / (ATTACK_ACTIVE1 - ATTACK_ACTIVE0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = '#dff6ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (p.attackKind === 'stab') {
        ctx.arc(x, p.y + 6, 12, Math.PI * 0.15, Math.PI * 0.85);
      } else {
        var d = p.face > 0 ? 1 : -1;
        ctx.arc(x, p.y - 12, 20, d > 0 ? -0.9 : Math.PI + 0.9, d > 0 ? 0.9 : Math.PI - 0.9, d < 0);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    var i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      var x = p.x - camX;
      if (x < -8 || x > W + 8) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    for (i = 0; i < floats.length; i++) {
      var f = floats[i];
      ctx.globalAlpha = clamp(f.life / 1.1, 0, 1);
      PitArt.drawTextCentredShadow(ctx, f.text, f.x - camX, f.y, f.col, 1);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- the Plancktopus, drawn --------------------------------------
   * Slate blue, ridged in horizontal bands, with a coral flank of bristles.
   * The bands are not decoration: the same profile curve that draws them is
   * the boss's hit shape, so the two can never disagree.
   */
  var BOSS_COL = {
    deep: '#101c30', dark: '#1b2b47', mid: '#2f4a72', lit: '#4a6d9c', rim: '#7fa4d4',
    ridge: '#14203a',
    coral: '#ef4b52', coralDark: '#a82c3c', coralLit: '#ff8a80',
    sclera: '#f2b09c', scleraLit: '#ffd8c8', iris: '#e8383c', irisDark: '#a81f2c',
    pupil: '#0d0508',
    tooth: '#e8dcc0', toothLit: '#fff6e0', toothDark: '#b09a72',
    maw: '#4a0c24', mawLit: '#8f2350', tongue: '#a83a5e'
  };

  function drawTentacle(t) {
    if (t.state === 'severed' && t.grow <= 0.02) {
      // Stump only: a raw coral wound where the arm used to be.
      var pulse = 0.5 + 0.5 * Math.sin(stateTime * 6 + t.idx);
      tintedGlow(t.ax, t.ay, 18, BOSS_COL.coral, 0.45 * pulse);
      ctx.fillStyle = BOSS_COL.dark;
      ctx.beginPath(); ctx.arc(t.ax, t.ay, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BOSS_COL.coralDark;
      ctx.beginPath(); ctx.arc(t.ax, t.ay, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = BOSS_COL.coral;
      ctx.beginPath(); ctx.arc(t.ax, t.ay, 2.5, 0, Math.PI * 2); ctx.fill();
      return;
    }

    var pts = tentaclePoints(t);
    var danger = tentacleDangerous(t);
    var hurt = t.hurt > 0;
    var i, p;

    /* Colour carries the whole rule of the fight: an arm winding up or
     * striking burns coral, a spent arm goes cold blue. That difference is
     * the player's only cue for when to close in, so it is loud on purpose. */
    var deep = hurt ? '#ffffff' : (danger ? BOSS_COL.coralDark : BOSS_COL.deep);
    var midC = hurt ? '#ffd8c8' : (danger ? BOSS_COL.coral : BOSS_COL.mid);
    var lit = hurt ? '#ffffff' : (danger ? BOSS_COL.coralLit : BOSS_COL.lit);

    if (danger) {
      for (i = 0; i < pts.length; i += 3) tintedGlow(pts[i].x, pts[i].y, 24, BOSS_COL.coral, 0.18);
    } else if (t.state === 'held' || t.state === 'retract') {
      for (i = 0; i < pts.length; i += 3) tintedGlow(pts[i].x, pts[i].y, 18, '#6fe8ff', 0.14);
    }

    // Outline, fill, then a rim highlight along the upper edge.
    ctx.fillStyle = '#05080f';
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1.3, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      ctx.fillStyle = p.s < 0.35 ? deep : (p.s < 0.75 ? midC : lit);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = hurt ? '#ffffff' : (danger ? BOSS_COL.coralLit : BOSS_COL.rim);
    for (i = 0; i < pts.length; i += 2) {
      p = pts[i];
      ctx.beginPath(); ctx.arc(p.x - p.r * 0.36, p.y - p.r * 0.46, p.r * 0.30, 0, Math.PI * 2); ctx.fill();
    }

    // Coral sucker rings along the underside, straight off the design.
    for (i = 3; i < pts.length - 1; i += 3) {
      p = pts[i];
      var sr = Math.max(1.0, p.r * 0.27);
      ctx.fillStyle = hurt ? '#ffffff' : BOSS_COL.coralDark;
      ctx.beginPath();
      ctx.arc(p.x + p.r * 0.36, p.y + p.r * 0.40, sr, 0, Math.PI * 2);
      ctx.fill();
      if (sr > 1.6) {
        ctx.fillStyle = hurt ? '#ffd8c8' : BOSS_COL.coral;
        ctx.beginPath();
        ctx.arc(p.x + p.r * 0.36, p.y + p.r * 0.40, sr * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Damage pips at the tip: how close this arm is to coming off.
    if (t.hp < t.maxHp && t.grow > 0.6) {
      var tip = pts[pts.length - 1];
      for (i = 0; i < t.maxHp; i++) {
        ctx.fillStyle = i < t.hp ? '#ffd23f' : '#3a1a24';
        ctx.fillRect(Math.round(tip.x - t.maxHp * 2 + i * 4), Math.round(tip.y - 13), 3, 3);
      }
    }
  }

  /* Every tooth is a sharp cone — upper fangs hanging down, lower fangs
   * pointing up, sizes varied deterministically so the bite looks ragged
   * without ever looking blunt. */
  function drawFangs(mx, my, mw, mh) {
    var i, n = 9, half = mw / 2;
    for (i = 0; i < n; i++) {
      var f = (i + 0.5) / n;
      var x = mx - half + f * mw;
      // Fangs are longest at the corners of the mouth and in the centre.
      var vary = 0.62 + 0.38 * Math.abs(Math.cos(f * Math.PI * 2.2 + i));
      var wTop = 3.4 + (i % 3) * 0.7;
      var hTop = Math.min(mh * 0.46, (5 + vary * 8));
      var yTop = my - mh / 2 + Math.abs(f - 0.5) * mh * 0.30;

      ctx.fillStyle = '#3a2a18';
      ctx.beginPath();
      ctx.moveTo(x - wTop / 2 - 0.8, yTop - 1);
      ctx.lineTo(x + wTop / 2 + 0.8, yTop - 1);
      ctx.lineTo(x, yTop + hTop + 1.2);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = BOSS_COL.tooth;
      ctx.beginPath();
      ctx.moveTo(x - wTop / 2, yTop);
      ctx.lineTo(x + wTop / 2, yTop);
      ctx.lineTo(x, yTop + hTop);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = BOSS_COL.toothLit;
      ctx.beginPath();
      ctx.moveTo(x - wTop / 2, yTop);
      ctx.lineTo(x - wTop / 2 + 1.4, yTop);
      ctx.lineTo(x - 0.5, yTop + hTop * 0.8);
      ctx.closePath(); ctx.fill();
    }

    for (i = 0; i < n - 1; i++) {
      var g = (i + 1) / n;
      var bx = mx - half + g * mw;
      var vary2 = 0.6 + 0.4 * Math.abs(Math.sin(g * Math.PI * 2.6 + i * 1.7));
      var wBot = 3.2 + ((i + 1) % 3) * 0.7;
      var hBot = Math.min(mh * 0.42, (4 + vary2 * 8));
      var yBot = my + mh / 2 - Math.abs(g - 0.5) * mh * 0.26;

      ctx.fillStyle = '#3a2a18';
      ctx.beginPath();
      ctx.moveTo(bx - wBot / 2 - 0.8, yBot + 1);
      ctx.lineTo(bx + wBot / 2 + 0.8, yBot + 1);
      ctx.lineTo(bx, yBot - hBot - 1.2);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = BOSS_COL.tooth;
      ctx.beginPath();
      ctx.moveTo(bx - wBot / 2, yBot);
      ctx.lineTo(bx + wBot / 2, yBot);
      ctx.lineTo(bx, yBot - hBot);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = BOSS_COL.toothLit;
      ctx.beginPath();
      ctx.moveTo(bx - wBot / 2, yBot);
      ctx.lineTo(bx - wBot / 2 + 1.3, yBot);
      ctx.lineTo(bx - 0.4, yBot - hBot * 0.8);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawBoss() {
    var b = boss;
    var i;
    var top = bossTop(b);
    var halfMax = BOSS_BODY_W / 2;
    var hurtFlash = b.hurtFlash > 0;

    tintedGlow(b.x, top + b.h * 0.45, 120, '#2f4a72', 0.35);

    /* The body is drawn as a stack of horizontal ridge bands rather than one
     * filled shape. That single loop produces the silhouette, the segmented
     * texture and the shading in one pass. */
    var BAND = 2;
    for (var y = 0; y < b.h; y += BAND) {
      var t = y / b.h;
      var hw = bossHalfWidth(t) * halfMax;
      // Ridges bulge very slightly, which is what reads as segmentation.
      hw += Math.sin(t * Math.PI * 14 + b.breathe * 1.2) * 1.4;
      var py = top + y;

      // Vertical light: crown lit, base in shadow.
      var shade = 1 - t * 0.55;
      var col;
      if (hurtFlash) col = '#ffffff';
      else if (shade > 0.82) col = BOSS_COL.lit;
      else if (shade > 0.62) col = BOSS_COL.mid;
      else if (shade > 0.45) col = BOSS_COL.dark;
      else col = BOSS_COL.deep;

      ctx.fillStyle = '#05080f';
      ctx.fillRect(Math.round(b.x - hw - 1), Math.round(py), Math.round(hw * 2 + 2), BAND);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(b.x - hw), Math.round(py), Math.round(hw * 2), BAND);

      // Groove between bands.
      ctx.fillStyle = hurtFlash ? '#e0e8f0' : BOSS_COL.ridge;
      ctx.fillRect(Math.round(b.x - hw), Math.round(py + BAND - 1), Math.round(hw * 2), 1);

      // Left rim light.
      ctx.fillStyle = hurtFlash ? '#ffffff' : BOSS_COL.rim;
      ctx.fillRect(Math.round(b.x - hw), Math.round(py), 2, BAND - 1);

      /* Coral flank: the right-hand third of every band, plus bristles
       * poking out past the silhouette. This is the design's signature and
       * it is also a free depth cue, since it only ever sits on one side. */
      if (!hurtFlash && t > 0.06) {
        var cw = hw * 0.20;
        ctx.fillStyle = BOSS_COL.coralDark;
        ctx.fillRect(Math.round(b.x + hw - cw), Math.round(py), Math.round(cw), 1);
        ctx.fillStyle = BOSS_COL.coral;
        ctx.fillRect(Math.round(b.x + hw - cw * 0.55), Math.round(py + 1), Math.round(cw * 0.55), 1);

        if (((y / BAND) | 0) % 3 === 0) {
          var bl = 2 + Math.max(0, Math.sin(t * 20 + b.breathe * 2)) * 2.5;
          ctx.fillStyle = BOSS_COL.coral;
          ctx.fillRect(Math.round(b.x + hw), Math.round(py + 1), Math.round(bl), 1);
        }
      }
    }

    // A crown of bristles over the top of the head.
    if (!hurtFlash) {
      for (i = 0; i < 18; i++) {
        // Ride the actual crown curve, and lean each bristle away from centre.
        var ct = 0.02 + 0.24 * (i / 17);
        var chw = bossHalfWidth(ct) * halfMax;
        var sgn = (i % 2) ? 1 : -1;
        var bx = b.x + sgn * chw * (0.55 + 0.45 * (i / 17));
        var by = top + ct * b.h;
        var bl2 = 3 + Math.abs(Math.sin(i * 1.7 + b.breathe * 2.2)) * 4;
        ctx.fillStyle = sgn > 0 ? BOSS_COL.coral : BOSS_COL.coralDark;
        ctx.fillRect(Math.round(bx), Math.round(by - bl2), 1, Math.round(bl2));
      }
    }

    // ---- the maw ----
    var m = bossMouth(b);
    ctx.fillStyle = '#05080f';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.w / 2 + 2, m.h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BOSS_COL.maw;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.w / 2, m.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (b.mouth > 0.35) {
      ctx.fillStyle = BOSS_COL.mawLit;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + m.h * 0.12, m.w / 2 * 0.72, m.h / 2 * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BOSS_COL.tongue;
      ctx.beginPath();
      ctx.ellipse(m.x - 4, m.y + m.h * 0.24, m.w * 0.19, m.h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawFangs(m.x, m.y, m.w, m.h);

    // ---- the eye ----
    var eye = bossEye(b);
    var er = eye.r * (0.9 + 0.1 * b.eyeOpen);
    var exposed = b.phase === 'EXPOSED';
    tintedGlow(eye.x, eye.y, er * (exposed ? 4.5 : 2.6), exposed ? '#ffd23f' : BOSS_COL.coral,
      exposed ? 0.6 : 0.22);

    ctx.fillStyle = '#05080f';
    ctx.beginPath(); ctx.arc(eye.x, eye.y, er + 2, 0, Math.PI * 2); ctx.fill();

    var eg = ctx.createRadialGradient(eye.x - er * 0.3, eye.y - er * 0.35, er * 0.1,
      eye.x, eye.y, er);
    eg.addColorStop(0, BOSS_COL.scleraLit);
    eg.addColorStop(0.65, BOSS_COL.sclera);
    eg.addColorStop(1, exposed ? '#ffd23f' : '#c07868');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(eye.x, eye.y, er, 0, Math.PI * 2); ctx.fill();

    // Red iris with a vertical slit pupil, tracking Bob.
    var ix = eye.x + b.look.x, iy = eye.y + b.look.y;
    ctx.fillStyle = BOSS_COL.irisDark;
    ctx.beginPath(); ctx.arc(ix, iy, er * 0.56, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BOSS_COL.iris;
    ctx.beginPath(); ctx.arc(ix, iy, er * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BOSS_COL.pupil;
    ctx.beginPath();
    ctx.ellipse(ix, iy, er * (exposed ? 0.30 : 0.15), er * 0.40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ix + er * 0.10, iy - er * 0.18, er * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eye.x + er * 0.38, eye.y - er * 0.42, er * 0.16, 0, Math.PI * 2); ctx.fill();

    // A heavy brow that lowers as arms come off: it visibly gets angrier.
    var anger = 1 - liveTentacles(b) / b.tentacles.length;
    ctx.fillStyle = hurtFlash ? '#ffffff' : BOSS_COL.dark;
    ctx.beginPath();
    ctx.moveTo(eye.x - er - 4, eye.y - er * (0.98 - anger * 0.42));
    ctx.lineTo(eye.x + er + 4, eye.y - er * (1.20 - anger * 0.18));
    ctx.lineTo(eye.x + er + 4, eye.y - er - 9);
    ctx.lineTo(eye.x - er - 4, eye.y - er - 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hurtFlash ? '#ffffff' : BOSS_COL.rim;
    ctx.fillRect(Math.round(eye.x - er - 4), Math.round(eye.y - er - 9), 2, 6);

    /* Arms last, in front of the mantle. Drawn behind it they vanished
     * entirely — the body is wider than their curl. */
    for (i = 0; i < b.tentacles.length; i++) drawTentacle(b.tentacles[i]);
  }

  /* ---------- HUD ---------------------------------------------------------- */
  function drawHearts() {
    for (var i = 0; i < MAX_HEARTS; i++) {
      var x = 10 + i * 15, y = 12;
      if (i < player.hearts) {
        PitArt.draw(ctx, A.heart, x, y, false);
      } else {
        ctx.globalAlpha = 0.25;
        PitArt.draw(ctx, A.heart, x, y, false);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawHud() {
    drawHearts();
    PitArt.drawTextShadow(ctx, 'BOB X' + Math.max(0, lives), 10, 22, '#9ff2e0', 1);

    // Carried upgrades sit beside the hearts, each with its own tint so a
    // glance tells you whether the next hit costs a heart.
    var ix = 10 + MAX_HEARTS * 15 + 4;
    if (player.shield) {
      tintedGlow(ix + 6, 12, 14, '#4a8ade', 0.5);
      PitArt.draw(ctx, A.shield, ix + 6, 12, false);
      ix += 16;
    }
    if (player.keen) {
      tintedGlow(ix + 5, 12, 13, '#ffd23f', 0.5);
      PitArt.draw(ctx, A.keen, ix + 5, 12, false);
    }
    PitArt.drawTextShadow(ctx, pad(score, 7), W - 10 - PitArt.textWidth(pad(score, 7), 1), 8, '#ffe89a', 1);
    var lbl = 'LEVEL ' + level;
    PitArt.drawTextShadow(ctx, lbl, W - 10 - PitArt.textWidth(lbl, 1), 18, '#b678cb', 1);

    if (boss && (state === 'BOSS' || state === 'BOSSIN')) drawBossHud();
  }

  /* The arm tracker is the fight's real HUD: one pip per tentacle, and a bar
   * counting down to the soonest regrowth so the player can judge whether
   * there is still time to finish the set. */
  function drawBossHud() {
    var b = boss;
    var n = b.tentacles.length;
    var pipW = 9, gap = 3;
    var total = n * pipW + (n - 1) * gap;
    var x0 = Math.round(W / 2 - total / 2);
    var y = H - 22;

    var soonest = Infinity, anySevered = false;
    for (var i = 0; i < n; i++) {
      var t = b.tentacles[i];
      var x = x0 + i * (pipW + gap);
      var alive = tentacleAlive(t);
      if (!alive) {
        anySevered = true;
        soonest = Math.min(soonest, t.severTimer);
      }
      ctx.fillStyle = '#0a0614';
      ctx.fillRect(x - 1, y - 1, pipW + 2, 8);
      if (alive) {
        // Live pip: filled proportionally to remaining tentacle HP.
        ctx.fillStyle = '#3a1030';
        ctx.fillRect(x, y, pipW, 6);
        ctx.fillStyle = t.state === 'strike' ? '#ff3f7a' : '#e0356f';
        var fw = Math.round(pipW * (t.hp / t.maxHp));
        ctx.fillRect(x, y, fw, 6);
      } else {
        ctx.fillStyle = '#123c3a';
        ctx.fillRect(x, y, pipW, 6);
        ctx.fillStyle = '#4de0c0';
        ctx.fillRect(x, y, pipW, 2);
      }
    }

    var label = b.phase === 'EXPOSED' ? 'STRIKE THE EYE'
      : (anySevered ? 'REGROWS IN ' + Math.max(0, soonest).toFixed(1) : 'SEVER ALL ' + n);
    PitArt.drawTextCentredShadow(ctx, label, W / 2, y - 11,
      b.phase === 'EXPOSED' ? '#ffd23f' : (anySevered && soonest < 3 ? '#ff5f7a' : '#9ff2e0'), 1);

    if (b.phase === 'EXPOSED') {
      var w = Math.round((b.exposeTimer / EXPOSE_TIME) * 120);
      ctx.fillStyle = '#0a0614';
      ctx.fillRect(W / 2 - 61, y + 9, 122, 5);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(W / 2 - 60, y + 10, w, 3);
    }
  }

  function drawBanner() {
    if (bannerTime <= 0 || !banner) return;
    var a = clamp(bannerTime, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(6,5,15,0.72)';
    ctx.fillRect(0, 22, W, bannerSub ? 44 : 30);
    PitArt.drawTextCentredShadow(ctx, banner, W / 2, 30, '#ffd23f', 2);
    if (bannerSub) PitArt.drawTextCentredShadow(ctx, bannerSub, W / 2, 54, '#9ff2e0', 1);
    ctx.globalAlpha = 1;
  }

  function veil(alpha) {
    ctx.fillStyle = 'rgba(4,3,10,' + alpha + ')';
    ctx.fillRect(0, 0, W, H);
  }

  function drawCard() {
    veil(0.78);
    var idx = (level - 1) % LEVEL_NAMES.length;
    PitArt.drawTextCentredShadow(ctx, 'LEVEL ' + level, W / 2, 68, '#9ff2e0', 1);
    PitArt.drawTextCentredShadow(ctx, LEVEL_NAMES[idx], W / 2, 84, '#ffd23f', 2);
    PitArt.drawTextCentredShadow(ctx, LEVEL_FLAVOUR[idx], W / 2, 116, '#b678cb', 1);
    var n = tentacleCount(level);
    PitArt.drawTextCentredShadow(ctx, 'THE PLANCKTOPUS HAS ' + n + ' ARMS', W / 2, 140, '#ff8fb0', 1);
    if (stateTime > 1.0 && Math.floor(stateTime * 2) % 2 === 0) {
      PitArt.drawTextCentredShadow(ctx, 'PRESS JUMP', W / 2, 176, '#ffffff', 1);
    }
  }

  function drawTitle() {
    veil(0.55);
    var bobY = 96 + Math.sin(stateTime * 2) * 3;
    PitArt.drawTextCentredShadow(ctx, 'THE DEATH PIT OF', W / 2, 40, '#9ff2e0', 1);
    PitArt.drawTextCentredShadow(ctx, 'SHEM', W / 2, 54, '#ffd23f', 4);
    PitArt.draw(ctx, A.bob.idle[Math.floor(stateTime * 2) % 2], W / 2, bobY + 14, false);

    PitArt.drawTextCentredShadow(ctx, 'BOB GOBLIN, CONVICTED OF:', W / 2, 136, '#b678cb', 1);
    PitArt.drawTextCentredShadow(ctx, 'ONE (1) STOLEN SANDWICH.', W / 2, 148, '#ffffff', 1);

    if (Math.floor(stateTime * 2) % 2 === 0) {
      PitArt.drawTextCentredShadow(ctx, 'PRESS JUMP TO BE THROWN IN', W / 2, 174, '#ffd23f', 1);
    }
    var hs = 'BEST ' + pad(hiScore, 7);
    PitArt.drawTextCentredShadow(ctx, hs, W / 2, 196, '#9ff2e0', 1);
  }

  var deathQuip = DEATH_QUIPS[0];
  function drawDead() {
    veil(clamp(stateTime * 0.4, 0, 0.66));
    if (stateTime > 0.8) {
      PitArt.drawTextCentredShadow(ctx, deathQuip, W / 2, H / 2 - 8, '#ffd23f', 1);
      PitArt.drawTextCentredShadow(ctx, lives > 0 ? 'BOB X' + lives + ' REMAIN' : 'NO MORE BOB',
        W / 2, H / 2 + 8, '#9ff2e0', 1);
    }
    if (stateTime > 1.8 && Math.floor(stateTime * 2) % 2 === 0) {
      PitArt.drawTextCentredShadow(ctx, 'PRESS JUMP', W / 2, H / 2 + 30, '#ffffff', 1);
    }
  }

  function drawClear() {
    veil(0.7);
    PitArt.drawTextCentredShadow(ctx, 'ALL ARMS OFF', W / 2, 62, '#ffd23f', 2);
    PitArt.drawTextCentredShadow(ctx, 'THE PLANCKTOPUS SULKS.', W / 2, 92, '#9ff2e0', 1);
    PitArt.drawTextCentredShadow(ctx, 'SCORE ' + pad(score, 7), W / 2, 116, '#ffffff', 1);
    PitArt.drawTextCentredShadow(ctx, 'IT WILL HAVE ' + tentacleCount(level + 1) + ' NEXT TIME.',
      W / 2, 138, '#ff8fb0', 1);
    if (stateTime > 1.2 && Math.floor(stateTime * 2) % 2 === 0) {
      PitArt.drawTextCentredShadow(ctx, 'DOWN WE GO', W / 2, 172, '#b678cb', 1);
    }
  }

  function drawOver() {
    veil(0.82);
    PitArt.drawTextCentredShadow(ctx, 'GAME OVER', W / 2, 66, '#ff5f7a', 3);
    PitArt.drawTextCentredShadow(ctx, 'THE PIT KEEPS BOB.', W / 2, 104, '#9ff2e0', 1);
    PitArt.drawTextCentredShadow(ctx, 'SCORE ' + pad(score, 7), W / 2, 126, '#ffffff', 1);
    PitArt.drawTextCentredShadow(ctx, 'BEST  ' + pad(hiScore, 7), W / 2, 138, '#ffd23f', 1);
    if (stateTime > 1.0 && Math.floor(stateTime * 2) % 2 === 0) {
      PitArt.drawTextCentredShadow(ctx, 'PRESS JUMP', W / 2, 172, '#ffffff', 1);
    }
  }

  function drawPaused() {
    veil(0.6);
    PitArt.drawTextCentredShadow(ctx, 'PAUSED', W / 2, H / 2 - 10, '#ffd23f', 2);
    PitArt.drawTextCentredShadow(ctx, 'P TO RESUME', W / 2, H / 2 + 16, '#9ff2e0', 1);
  }

  function render() {
    ctx.save();
    if (shake > 0.2) {
      ctx.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
    }

    drawBackdrop();
    if (map) {
      drawTiles();
      if (state === 'PLAY' || state === 'CARD') drawGate();
      drawPickups();
      drawEnemies();
      if (boss && (state === 'BOSS' || state === 'BOSSIN' || state === 'CLEAR' || state === 'DEAD')) {
        drawBoss();
      }
      drawShots();
      if (player) drawPlayer();
      drawParticles();
    }

    ctx.restore();

    if (flashAmt > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(flashAmt, 0, 1) * 0.75;
      ctx.fillStyle = flashCol;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Vignette: keeps the eye centred and hides the parallax seams.
    var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,1,8,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (!posterMode) {
      if (state !== 'TITLE') drawHud();
      drawBanner();

      if (state === 'TITLE') drawTitle();
      else if (state === 'CARD') drawCard();
      else if (state === 'DEAD') drawDead();
      else if (state === 'CLEAR') drawClear();
      else if (state === 'OVER') drawOver();
    }

    if (paused) drawPaused();
  }

  /* ---------- DOM glue ----------------------------------------------------- */
  function syncButtons() {
    var sb = document.getElementById('btn-sound');
    if (sb) {
      var on = PitSound.isEnabled();
      sb.textContent = 'Sound: ' + (on ? 'on' : 'off');
      sb.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    var pb = document.getElementById('btn-pause');
    if (pb) {
      pb.textContent = paused ? 'Resume' : 'Pause';
      pb.setAttribute('aria-pressed', paused ? 'true' : 'false');
    }
  }

  function bindButtons() {
    var pb = document.getElementById('btn-pause');
    if (pb) pb.addEventListener('click', function () { togglePause(); canvas.focus(); });

    var sb = document.getElementById('btn-sound');
    if (sb) sb.addEventListener('click', function () { PitSound.unlock(); toggleSound(); canvas.focus(); });

    var fb = document.getElementById('btn-full');
    if (fb) {
      fb.addEventListener('click', function () {
        var stage = document.getElementById('stage');
        if (document.fullscreenElement) document.exitFullscreen();
        else if (stage && stage.requestFullscreen) stage.requestFullscreen();
      });
    }

    // Hold-to-act touch buttons. Pointer events cover mouse, touch and pen,
    // and the lost-capture handlers stop a button sticking down if the finger
    // slides off it mid-press.
    var holdBtns = document.querySelectorAll('[data-hold]');
    for (var i = 0; i < holdBtns.length; i++) {
      (function (btn) {
        var act = btn.getAttribute('data-hold');
        function down(e) {
          e.preventDefault();
          PitSound.unlock();
          if (!holds[act]) {
            if (act === 'jump') jumpEdge = true;
            if (act === 'attack') attackEdge = true;
          }
          holds[act] = true;
          btn.classList.add('is-active');
          if (btn.setPointerCapture && e.pointerId != null) {
            try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
          }
        }
        function up(e) {
          if (e) e.preventDefault();
          holds[act] = false;
          btn.classList.remove('is-active');
        }
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', up);
        btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      })(holdBtns[i]);
    }

    // Tapping the canvas itself starts and un-pauses, so a phone player never
    // has to find a button to get going.
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      PitSound.unlock();
      canvas.focus();
      if (state === 'TITLE' || state === 'OVER' || state === 'CARD' ||
          state === 'CLEAR' || state === 'DEAD') {
        jumpEdge = true;
      }
    });
  }

  function fit() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var chrome = document.fullscreenElement ? 0 : 210;
    var availW = stage.clientWidth;
    var availH = Math.max(180, global.innerHeight - chrome);
    var scale = Math.min(availW / W, availH / H);
    if (scale >= 1) scale = Math.max(1, Math.floor(scale * 2) / 2);
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
  }

  /* ---------- main loop ---------------------------------------------------- */
  function frame(ts) {
    if (!running) return;
    var dt = (ts - last) / 1000;
    last = ts;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;           // a stall must never teleport anything

    if (!paused) {
      update(dt);
      updateBackdrop(dt);
    }
    render();
    global.requestAnimationFrame(frame);
  }

  function boot() {
    canvas = document.getElementById('screen');
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    A = PitArt.build();
    // Any PNGs present in art/ replace the hand-authored grids as they load.
    // `A` points at the same object build() returns, so a sheet arriving three
    // frames from now is picked up without a reload.
    PitArt.loadOverrides(function (loaded) {
      if (loaded.length && typeof console !== 'undefined') {
        console.log('Death Pit: using PNG art for ' + loaded.join(', '));
      }
    });
    glowSprite = makeGlowSprite();
    hiScore = loadHi();

    // The title screen runs over a live level, so there is always something
    // moving behind the logo.
    level = 1;
    map = loadMap(GAUNTLETS[0], false);
    mapW = map.pxW;
    player = makePlayer(map.start.x, map.start.y);
    spawnFromMap();
    buildBackdrop();
    camX = 0;

    bindInput();
    bindButtons();
    syncButtons();
    fit();
    global.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);

    var loading = document.getElementById('loading');
    if (loading) loading.remove();

    // Opt-in test harness: /games/deathpit/?debug
    if (global.location.search.indexOf('debug') >= 0) {
      global.DP = {
        state: function () {
          return {
            state: state, level: level, score: score, lives: lives,
            hearts: player ? player.hearts : null,
            x: player ? Math.round(player.x) : null,
            y: player ? Math.round(player.y) : null,
            tile: player ? (Math.round(player.x / TILE) + ',' + Math.round(player.y / TILE)) : null,
            onGround: player ? player.onGround : null,
            keen: player ? player.keen : null,
            shield: player ? player.shield : null,
            enemies: enemies.length,
            boss: boss ? {
              phase: boss.phase,
              live: liveTentacles(boss),
              of: boss.tentacles.length,
              arms: boss.tentacles.map(function (t) {
                return t.state + ':' + t.hp + (t.state === 'severed' ? '@' + t.severTimer.toFixed(1) : '');
              })
            } : null
          };
        },
        start: startRun,
        gotoLevel: function (n) { level = n; beginLevel(); },
        skipToBoss: function () { if (state === 'PLAY') enterArena(); },
        severAll: function () {
          if (!boss) return;
          for (var i = 0; i < boss.tentacles.length; i++) {
            if (tentacleAlive(boss.tentacles[i])) severTentacle(boss, boss.tentacles[i]);
          }
        },
        killBoss: function () {
          if (!boss) return;
          boss.phase = 'EXPOSED';
          boss.exposeTimer = EXPOSE_TIME;
        },
        godMode: function (on) { INVULN_FOREVER = on !== false; },
        heal: function () { if (player) player.hearts = MAX_HEARTS; },
        give: function (what) {
          if (!player) return;
          if (what === 'keen') player.keen = true;
          else if (what === 'shield') player.shield = true;
          else if (what === 'life') lives++;
        },
        /* Poses the arena for a promotional still: Bob small and low on the
         * left mid-swing, two arms reaching down at him, the rest curled. */
        posterScene: function () {
          if (!boss || !player) return 'enter the arena first';
          player.x = 56; player.y = 160;      // the left shelf, not the floor player.vx = 0; player.vy = 0;
          player.face = 1; player.invuln = 0; player.hurtTime = 0;
          player.attack = 0.12; player.attackKind = 'swing';   // the thrust frame
          boss.mouth = 0.9;
          boss.look.x = -6; boss.look.y = 7;                   // eye down on Bob
          for (var i = 0; i < boss.tentacles.length; i++) {
            var t = boss.tentacles[i];
            t.grow = 1; t.hp = t.maxHp; t.hurt = 0;
            if (i < 2) {
              t.state = 'strike';
              t.targetX = 96 + i * 34; t.targetY = H - 40;
              t.tipX = t.targetX; t.tipY = t.targetY;
            } else {
              t.state = 'idle';
              var g = tentacleIdleGoal(t, boss);
              t.tipX = g.x; t.tipY = g.y;
            }
          }
          render();
          return 'posed';
        },
        /* Returns the frame as a PNG data URL. Called with no arguments it
         * renders ONCE, caches the result and returns its length; called with
         * an offset it slices that cached string. The caching matters — the
         * glows and the breathing animate every frame, so slicing across
         * separate renders would splice together different images. */
        poster: function (offset, len) {
          if (offset == null) {
            posterMode = true;
            render();
            posterMode = false;
            posterURL = canvas.toDataURL('image/png');
            return posterURL.length;
          }
          return posterURL ? posterURL.substr(offset, len || 30000) : '';
        },
        tp: function (x, y) { if (player) { player.x = x; player.y = y; player.vx = 0; player.vy = 0; } },
        enemyAt: function (i) {
          var e = enemies[i || 0];
          return e ? { kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), h: e.h, hp: e.hp } : null;
        },
        drop: function (what) {
          if (player) pickups.push(makePickup(what || 'keen', player.x + 40, player.y - 12));
        },
        addLives: function (n) { lives += (n || 3); }
      };
    }

    running = true;
    last = performance.now();
    global.requestAnimationFrame(frame);
  }

  // Fresh quip each death, chosen when the death actually happens.
  var _killPlayer = killPlayer;
  killPlayer = function () {
    deathQuip = pick(DEATH_QUIPS);
    _killPlayer();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
