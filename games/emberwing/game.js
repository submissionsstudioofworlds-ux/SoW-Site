/* Emberwing — a Time Pilot-style dragon shooter.
 *
 * The dragon is pinned to the centre of the screen and the whole sky scrolls
 * around it: the camera is simply the player's world position, so "moving"
 * means the world slides past. Enemies persist off-screen and wheel back
 * around, exactly like the 1982 original.
 */
(function (global) {
  'use strict';

  /* ---------- constants -------------------------------------------------- */
  var W = 320, H = 240, HALF_W = W / 2, HALF_H = H / 2;
  var SPAWN_R = 250;     // enemies enter just beyond the screen corner (~200)
  var RECYCLE_R = 460;   // strays are folded back in rather than deleted
  var TAU = Math.PI * 2;

  var PLAYER_SPEED = 74;
  var PLAYER_TURN = 3.4;         // rad/s
  /* Throttle rides on separate keys rather than up/down, so all eight
   * steering directions stay available — losing north/south steering would
   * break the whole world-turns-around-you feel. Surging burns ember, so
   * speed trades against frost and storm instead of being free. */
  var SPEED_SURGE = 1.75;
  var SPEED_GLIDE = 0.55;
  var SURGE_DRAIN = 24;
  var PLAYER_R = 7;
  var MANA_MAX = 100;
  var MANA_REGEN = 17;
  var INVULN_TIME = 2.6;
  var EXTRA_LIFE_FIRST = 20000;
  var EXTRA_LIFE_EVERY = 40000;
  var RESCUES_PER_LIFE = 5;   // the skill route to a spare wing

  var WEAPONS = [
    {
      name: 'FIRE', cost: 0, cd: 0.105, dmg: 1, speed: 235, life: 0.56,
      spread: 0.11, count: 1, radius: 3, sfx: 'fire', kick: 0.5,
      core: '#fff6c4', mid: '#ffae32', edge: '#f4531b'
    },
    {
      name: 'FROST', cost: 7, cd: 0.27, dmg: 1, speed: 195, life: 0.52,
      spread: 0.40, count: 3, radius: 3, freeze: 1.9, sfx: 'frost', kick: 0.8,
      core: '#f2fdff', mid: '#9fe1ff', edge: '#3d93cc'
    },
    {
      name: 'STORM', cost: 15, cd: 0.34, dmg: 3, speed: 430, life: 0.40,
      spread: 0.03, count: 1, radius: 2, pierce: 4, chain: 46, sfx: 'zap', kick: 1.4,
      core: '#ffffff', mid: '#d3b3ff', edge: '#7b55d8'
    }
  ];

  var REALMS = [
    // Cloud tones sit between sky0 and sky1 on purpose: they read as depth
    // without ever competing with an enemy silhouette for attention.
    {
      name: 'EMBERFALL RIDGE', pal: 'ash',
      sky0: '#2c0d07', sky1: '#63220d', cloudA: '#3d1409', cloudB: '#57200f',
      mote: '#ff9a3c', shot: '#ffe08a', quota: 18, speed: 46, aggression: 0.7
    },
    {
      name: 'HOARFROST REACH', pal: 'rime',
      sky0: '#061422', sky1: '#1d4160', cloudA: '#0d2337', cloudB: '#163650',
      mote: '#dff4ff', shot: '#fff0a0', quota: 22, speed: 52, aggression: 1.05
    },
    {
      name: 'THE STORMSPIRE', pal: 'storm',
      sky0: '#120820', sky1: '#301e4e', cloudA: '#1b0f31', cloudB: '#281842',
      mote: '#c9a4ff', shot: '#9dfcff', quota: 26, speed: 58, aggression: 1.2
    },
    {
      name: 'THE SUNDER', pal: 'vd',
      sky0: '#040407', sky1: '#1a1a24', cloudA: '#0c0c12', cloudB: '#15151d',
      mote: '#8e93ad', shot: '#ff5c86', quota: 30, speed: 64, aggression: 1.4
    }
  ];

  /* ---------- module state ----------------------------------------------- */
  var canvas, ctx, A;
  var last = 0, timeNow = 0, running = false;
  var state = 'TITLE';
  var stateTime = 0;

  var realmIndex = 0, loopCount = 0, realm = REALMS[0];
  var sky = null, cloudArt = [];

  var score = 0, hiScore = 0, lives = 3, nextExtra = EXTRA_LIFE_FIRST;
  var rescues = 0;   // every RESCUES_PER_LIFE hatchlings earns a wing
  var kills = 0, quota = 0;
  var shake = 0, flashAmount = 0, flashColour = '#ffffff';
  var banner = null;

  var player = null;
  var enemies = [], shots = [], foeShots = [], parts = [], pickups = [], rings = [];
  var clouds = [], motes = [];
  var boss = null, bossPending = 0;
  var spawnTimer = 0, pickupTimer = 0;
  var INVULN_FOREVER = false;   // only ever set by the ?debug harness

  /* ---------- small helpers ---------------------------------------------- */
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  function turnToward(current, target, maxStep) {
    var d = wrapAngle(target - current);
    if (d > maxStep) d = maxStep;
    else if (d < -maxStep) d = -maxStep;
    return wrapAngle(current + d);
  }

  function dist2(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function pad(n, len) {
    var s = String(Math.floor(n));
    while (s.length < len) s = '0' + s;
    return s;
  }

  function loadHi() {
    try { return parseInt(global.localStorage.getItem('emberwing.hi') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveHi(v) {
    try { global.localStorage.setItem('emberwing.hi', String(v)); } catch (e) { /* private mode */ }
  }

  /* ---------- input ------------------------------------------------------- */
  var keys = {};
  var touch = {
    active: false, dx: 0, dy: 0, fire: false, id: null, fireId: null,
    surge: false, glide: false
  };

  var KEY_ALIASES = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'fire', KeyZ: 'fire', KeyJ: 'fire',
    KeyX: 'swap', KeyK: 'swap',
    ShiftLeft: 'surge', ShiftRight: 'surge', KeyE: 'surge',
    ControlLeft: 'glide', ControlRight: 'glide', KeyQ: 'glide',
    Digit1: 'w1', Digit2: 'w2', Digit3: 'w3',
    Enter: 'start', NumpadEnter: 'start',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'mute'
  };

  function inputVector() {
    var dx = 0, dy = 0;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;
    if (keys.up) dy -= 1;
    if (keys.down) dy += 1;
    if (!dx && !dy && touch.active) { dx = touch.dx; dy = touch.dy; }
    return { x: dx, y: dy };
  }

  function firePressed() {
    return !!keys.fire || touch.fire;
  }

  function bindInput() {
    // Only swallow the keys that would otherwise scroll the page — leaving
    // browser shortcuts such as Ctrl+R alone.
    var SWALLOW = { up: 1, down: 1, left: 1, right: 1, fire: 1 };

    global.addEventListener('keydown', function (e) {
      var name = KEY_ALIASES[e.code];
      if (!name) return;
      if (SWALLOW[name]) e.preventDefault();
      if (!keys[name]) onPress(name);
      keys[name] = true;
      Sound.unlock();
    });
    global.addEventListener('keyup', function (e) {
      var name = KEY_ALIASES[e.code];
      if (!name) return;
      if (SWALLOW[name]) e.preventDefault();
      keys[name] = false;
    });
    global.addEventListener('blur', function () { keys = {}; touch.active = false; touch.fire = false; });

    // Pointer/touch: left half steers from the touch-down point, right half breathes.
    function localPos(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
    }

    // Capture is a nicety (it keeps tracking if the finger leaves the canvas)
    // and must never be able to take the controls down with it.
    function capture(id) {
      try { canvas.setPointerCapture(id); } catch (e) { /* not capturable */ }
    }

    canvas.addEventListener('pointerdown', function (ev) {
      Sound.unlock();
      var p = localPos(ev);
      if (state !== 'PLAY' && state !== 'PAUSED') {
        onPress('start');
        ev.preventDefault();
        return;
      }
      if (p.x < HALF_W) {
        touch.id = ev.pointerId;
        touch.active = true;
        touch.ox = p.x; touch.oy = p.y;
        touch.dx = 0; touch.dy = 0;
      } else {
        touch.fireId = ev.pointerId;
        touch.fire = true;
      }
      capture(ev.pointerId);
      ev.preventDefault();
    });

    canvas.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== touch.id || !touch.active) return;
      var p = localPos(ev);
      var dx = p.x - touch.ox, dy = p.y - touch.oy;
      var len = Math.hypot(dx, dy);
      if (len > 6) { touch.dx = dx / len; touch.dy = dy / len; }
      ev.preventDefault();
    });

    function release(ev) {
      if (ev.pointerId === touch.id) { touch.active = false; touch.id = null; touch.dx = 0; touch.dy = 0; }
      if (ev.pointerId === touch.fireId) { touch.fire = false; touch.fireId = null; }
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function onPress(name) {
    if (name === 'mute') {
      var on = Sound.toggle();
      showBanner(on ? 'SOUND ON' : 'SOUND OFF', 0.9);
      syncSoundButton();
      return;
    }
    if (name === 'pause') {
      if (state === 'PLAY') { state = 'PAUSED'; Sound.stopMusic(); }
      else if (state === 'PAUSED') { state = 'PLAY'; Sound.startMusic(); }
      return;
    }
    if (name === 'swap') { cycleWeapon(1); return; }
    if (name === 'w1') { selectWeapon(0); return; }
    if (name === 'w2') { selectWeapon(1); return; }
    if (name === 'w3') { selectWeapon(2); return; }

    if (name === 'start' || name === 'fire') {
      if (state === 'TITLE') { Sound.unlock(); startRun(); }
      else if (state === 'GAMEOVER' && stateTime > 1.0) { state = 'TITLE'; stateTime = 0; }
    }
  }

  function selectWeapon(i) {
    if (!player || player.weapon === i) return;
    player.weapon = i;
    Sound.play('swap');
    syncWeaponButtons();
  }
  function cycleWeapon(dir) {
    if (!player) return;
    selectWeapon((player.weapon + dir + WEAPONS.length) % WEAPONS.length);
  }

  /* ---------- backdrop ---------------------------------------------------- */
  var BAYER = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  ];

  function hex(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }

  // Ordered-dither vertical gradient — banding on purpose, like the era.
  function makeSky(c0, c1) {
    var a = hex(c0), b = hex(c1);
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d');
    var img = g.createImageData(W, H);
    for (var y = 0; y < H; y++) {
      var t = y / (H - 1);
      for (var x = 0; x < W; x++) {
        var thr = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
        var m = t + (thr - 0.5) * 0.09;
        m = m < 0 ? 0 : (m > 1 ? 1 : m);
        var q = Math.round(m * 7) / 7;   // 8 bands
        var o = (y * W + x) * 4;
        img.data[o] = a[0] + (b[0] - a[0]) * q;
        img.data[o + 1] = a[1] + (b[1] - a[1]) * q;
        img.data[o + 2] = a[2] + (b[2] - a[2]) * q;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Blobby two-tone cloud built from overlapping discs on a pixel grid.
  function makeCloud(w, h, dark, lit) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var img = g.createImageData(w, h);
    var blobs = [], i;
    var n = rndInt(4, 7);
    for (i = 0; i < n; i++) {
      blobs.push({
        x: rnd(w * 0.18, w * 0.82),
        y: rnd(h * 0.3, h * 0.72),
        r: rnd(Math.min(w, h) * 0.2, Math.min(w, h) * 0.42)
      });
    }
    var A_ = hex(dark), B_ = hex(lit);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var inside = false;
        for (i = 0; i < blobs.length; i++) {
          var b = blobs[i];
          if (dist2(x, y, b.x, b.y) < b.r * b.r) { inside = true; break; }
        }
        if (!inside) continue;
        // lit along the top edge, shadowed below
        var topLit = true;
        for (i = 0; i < blobs.length; i++) {
          var b2 = blobs[i];
          if (dist2(x, y + 3, b2.x, b2.y) < b2.r * b2.r && y > h * 0.55) { topLit = false; break; }
        }
        var col = topLit ? B_ : A_;
        var o = (y * w + x) * 4;
        img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2];
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function buildBackdrop() {
    sky = makeSky(realm.sky0, realm.sky1);
    cloudArt = [];
    for (var i = 0; i < 6; i++) {
      var s = i < 3 ? rnd(26, 40) : rnd(44, 68);
      cloudArt.push(makeCloud(Math.round(s), Math.round(s * 0.62), realm.cloudA, realm.cloudB));
    }
    clouds = [];
    for (var j = 0; j < 16; j++) clouds.push(newCloud(true));
    motes = [];
    for (var k = 0; k < 44; k++) {
      motes.push({ x: rnd(0, W), y: rnd(0, H), z: rnd(0.4, 1.5), s: Math.random() < 0.25 ? 2 : 1 });
    }
  }

  function newCloud(anywhere) {
    var far = Math.random() < 0.5;
    var c = {
      img: pick(cloudArt),
      par: far ? 0.45 : 0.85,   // parallax factor
      dim: far
    };
    if (anywhere) {
      c.x = player ? player.x * c.par + rnd(-HALF_W - 60, HALF_W + 60) : rnd(-W, W);
      c.y = player ? player.y * c.par + rnd(-HALF_H - 60, HALF_H + 60) : rnd(-H, H);
    } else {
      // enter from the edge the dragon is heading toward
      var a = player.a + rnd(-0.8, 0.8);
      var r = 210;
      c.x = player.x * c.par + Math.cos(a) * r;
      c.y = player.y * c.par + Math.sin(a) * r;
    }
    return c;
  }

  /* ---------- entities ---------------------------------------------------- */
  function makePlayer() {
    return {
      x: 0, y: 0, a: -Math.PI / 2,
      weapon: 0, cd: 0, mana: MANA_MAX,
      speed: PLAYER_SPEED, surging: false,
      flap: 0, flapT: 0,
      invuln: INVULN_TIME, dead: false, deadT: 0
    };
  }

  function spawnFormation() {
    var count = rndInt(2, 4) + (loopCount > 0 ? 1 : 0);
    var ang = rnd(0, TAU);
    var kind = Math.random() < (realm.aggression > 1 ? 0.5 : 0.35) ? 'raptor' : 'wyvern';
    var perp = ang + Math.PI / 2;
    for (var i = 0; i < count; i++) {
      var off = (i - (count - 1) / 2) * 20;
      spawnEnemy(kind,
        player.x + Math.cos(ang) * SPAWN_R + Math.cos(perp) * off,
        player.y + Math.sin(ang) * SPAWN_R + Math.sin(perp) * off);
    }
  }

  function spawnEnemy(kind, x, y) {
    var diff = 1 + loopCount * 0.18;
    var base = realm.speed * diff;
    var e = {
      kind: kind,
      x: x, y: y,
      a: Math.atan2(player.y - y, player.x - x),
      speed: kind === 'raptor' ? base * 1.32 : base,
      // Deliberately slower than the player's 3.4 rad/s: enemies overshoot and
      // wheel back around instead of gluing themselves to your tail.
      turn: kind === 'raptor' ? 1.5 : 1.0,
      hp: kind === 'raptor' ? 2 : 1,
      r: 7,
      flap: 0, flapT: rnd(0, 1),
      cool: rnd(0.6, 2.2),
      weave: rnd(-0.6, 0.6),
      phase: rnd(0, TAU),
      freeze: 0, hurt: 0,
      score: kind === 'raptor' ? 300 : 200
    };
    if (loopCount > 1) e.hp += 1;
    enemies.push(e);
    return e;
  }

  function spawnBoss() {
    var ang = rnd(0, TAU);
    boss = {
      kind: 'boss',
      x: player.x + Math.cos(ang) * SPAWN_R,
      y: player.y + Math.sin(ang) * SPAWN_R,
      a: ang + Math.PI,
      speed: 56 + realmIndex * 4 + loopCount * 6,
      turn: 0.85,
      hp: 46 + realmIndex * 12 + loopCount * 24,
      maxHp: 46 + realmIndex * 12 + loopCount * 24,
      r: 17,
      flap: 0, flapT: 0,
      cool: 2.0, burst: 0, escortCool: 6,
      hurt: 0, freeze: 0,
      score: 5000 + realmIndex * 1000
    };
    Sound.play('bossWarn');
    showBanner('THE SKY LEVIATHAN', 2.2);
  }

  function spawnPickup() {
    var ang = rnd(0, TAU);
    pickups.push({
      x: player.x + Math.cos(ang) * rnd(120, 200),
      y: player.y + Math.sin(ang) * rnd(120, 200),
      vx: rnd(-8, 8), vy: rnd(-8, 8),
      bob: rnd(0, TAU),
      life: 16
    });
  }

  /* Anything slower than the dragon can never catch a player flying straight.
   * Rather than strand it behind forever, fold it back in AHEAD of the
   * heading — the sky keeps coming to you, as in the original. */
  function recycleAhead(e) {
    var a = player.a + rnd(-1.2, 1.2);
    e.x = player.x + Math.cos(a) * SPAWN_R;
    e.y = player.y + Math.sin(a) * SPAWN_R;
    e.a = Math.atan2(player.y - e.y, player.x - e.x);
  }

  function burst(x, y, n, colours, speed, life, size) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), s = rnd(speed * 0.3, speed);
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(life * 0.5, life), max: life,
        c: pick(colours), s: size || 2, drag: 1.8
      });
    }
  }

  function ring(x, y, colour, max, speed) {
    rings.push({ x: x, y: y, r: 2, max: max, speed: speed || 90, c: colour });
  }

  /* ---------- firing ------------------------------------------------------ */
  function tryFire(dt) {
    player.cd -= dt;
    if (!firePressed() || player.cd > 0 || player.dead) return;
    var wp = WEAPONS[player.weapon];
    if (wp.cost > 0 && player.mana < wp.cost) {
      if (player.cd <= -0.35) { Sound.play('empty'); player.cd = 0.2; }
      return;
    }
    player.mana -= wp.cost;
    player.cd = wp.cd;

    var mx = player.x + Math.cos(player.a) * 11;
    var my = player.y + Math.sin(player.a) * 11;
    for (var i = 0; i < wp.count; i++) {
      var off = wp.count === 1 ? rnd(-wp.spread, wp.spread)
        : (i - (wp.count - 1) / 2) * wp.spread;
      var a = player.a + off;
      shots.push({
        x: mx, y: my,
        vx: Math.cos(a) * wp.speed, vy: Math.sin(a) * wp.speed,
        a: a, life: wp.life, w: player.weapon,
        pierce: wp.pierce || 0, hitList: null
      });
    }
    burst(mx, my, 2, [wp.core, wp.mid], 40, 0.16, 1);
    Sound.play(wp.sfx);
    shake = Math.max(shake, wp.kick);
  }

  function damageTarget(t, dmg, wp, sx, sy) {
    if (t.freeze > 0) dmg *= 2;          // frozen things shatter
    t.hp -= dmg;
    t.hurt = 0.09;
    if (wp.freeze && t.kind !== 'boss') {
      if (t.freeze <= 0) Sound.play('freeze');
      t.freeze = wp.freeze;
    }
    burst(sx, sy, 3, [wp.core, wp.mid, wp.edge], 70, 0.24, 1);
    if (t.hp > 0) { Sound.play('hit'); return false; }
    return true;
  }

  function killEnemy(e, idx) {
    addScore(e.score);
    kills++;
    burst(e.x, e.y, 14, ['#fff2c0', '#ffb03a', '#f4531b', '#8a2b12'], 130, 0.5, 2);
    ring(e.x, e.y, '#ffcf7a', 18, 110);
    Sound.play('explode', false);
    shake = Math.max(shake, 2.5);
    enemies.splice(idx, 1);
  }

  function killBoss() {
    addScore(boss.score);
    for (var i = 0; i < 5; i++) {
      (function (d) {
        setTimeout(function () {
          if (!boss) return;
          burst(boss.x + rnd(-18, 18), boss.y + rnd(-18, 18), 16,
            ['#ffffff', '#ffd166', '#f4531b', '#7a2a10'], 170, 0.7, 3);
        }, d);
      })(i * 90);
    }
    burst(boss.x, boss.y, 46, ['#ffffff', '#ffd166', '#f4531b', '#7a2a10'], 200, 0.9, 3);
    ring(boss.x, boss.y, '#ffffff', 70, 190);
    ring(boss.x, boss.y, '#ffb03a', 54, 140);
    Sound.play('explode', true);
    shake = 8;
    flash('#ffd9a0', 0.5);
    boss = null;
    state = 'REALM_CLEAR';
    stateTime = 0;
    Sound.play('realmClear');
  }

  function grantExtraLife(reason) {
    lives++;
    Sound.play('extraLife');
    showBanner(reason, 1.8);
    flash('#f2cf72', 0.25);
  }

  function addScore(n) {
    score += n;
    if (score >= nextExtra) {
      nextExtra += EXTRA_LIFE_EVERY;
      grantExtraLife('EXTRA WING');
    }
    if (score > hiScore) { hiScore = score; saveHi(hiScore); }
  }

  function flash(colour, amount) {
    flashColour = colour;
    flashAmount = Math.max(flashAmount, amount);
  }

  function showBanner(text, time) {
    banner = { text: text, t: time, max: time };
  }

  /* ---------- player death ------------------------------------------------ */
  function killPlayer() {
    if (player.dead || player.invuln > 0 || INVULN_FOREVER) return;
    player.dead = true;
    player.deadT = 0;
    burst(player.x, player.y, 40, ['#ffffff', '#f2cf72', '#c8922f', '#7a4a15'], 170, 0.85, 3);
    ring(player.x, player.y, '#ffffff', 46, 150);
    Sound.play('death');
    shake = 7;
    flash('#ffffff', 0.45);
    lives--;
  }

  function respawn() {
    player.dead = false;
    player.invuln = INVULN_TIME;
    player.mana = MANA_MAX;
    player.cd = 0;
    foeShots.length = 0;
    // shove anything sitting on top of the dragon back out to the rim
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (dist2(e.x, e.y, player.x, player.y) < 120 * 120) {
        var a = Math.atan2(e.y - player.y, e.x - player.x);
        e.x = player.x + Math.cos(a) * SPAWN_R;
        e.y = player.y + Math.sin(a) * SPAWN_R;
      }
    }
  }

  /* ---------- realm flow -------------------------------------------------- */
  function enterRealm(index) {
    realmIndex = index % REALMS.length;
    realm = REALMS[realmIndex];
    quota = realm.quota + loopCount * 6;
    kills = 0;
    boss = null;
    bossPending = 0;
    enemies.length = 0;
    foeShots.length = 0;
    shots.length = 0;
    pickups.length = 0;
    spawnTimer = 1.2;
    pickupTimer = rnd(8, 14);
    buildBackdrop();
    Sound.setRealm(realmIndex + loopCount);
    showBanner(realm.name, 2.4);
  }

  function startRun() {
    score = 0;
    lives = 3;
    nextExtra = EXTRA_LIFE_FIRST;
    rescues = 0;
    loopCount = 0;
    parts.length = 0;
    rings.length = 0;
    player = makePlayer();
    enterRealm(0);
    state = 'PLAY';
    stateTime = 0;
    Sound.play('start');
    Sound.startMusic();
    syncWeaponButtons();
  }

  /* ---------- update ------------------------------------------------------ */
  function update(dt) {
    stateTime += dt;
    timeNow += dt;

    if (shake > 0) shake = Math.max(0, shake - dt * 14);
    if (flashAmount > 0) flashAmount = Math.max(0, flashAmount - dt * 2.4);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

    if (state === 'TITLE') { updateTitle(dt); return; }
    if (state === 'PAUSED') return;
    if (state === 'GAMEOVER') { updateParticles(dt); return; }

    if (state === 'REALM_CLEAR') {
      updatePlayer(dt);
      updateParticles(dt);
      updateClouds(dt);
      if (stateTime > 3.2) {
        var next = realmIndex + 1;
        if (next >= REALMS.length) { loopCount++; next = 0; }
        enterRealm(next);
        state = 'PLAY';
        stateTime = 0;
      }
      return;
    }

    /* PLAY */
    updatePlayer(dt);

    if (player.dead) {
      player.deadT += dt;
      updateParticles(dt);
      updateClouds(dt);
      updateEnemies(dt);
      updateShots(dt);
      if (player.deadT > 1.9) {
        if (lives <= 0) {
          state = 'GAMEOVER';
          stateTime = 0;
          Sound.stopMusic();
        } else {
          respawn();
        }
      }
      return;
    }

    tryFire(dt);
    // no topping up mid-surge, or the drain would never bite
    if (!player.surging) player.mana = Math.min(MANA_MAX, player.mana + MANA_REGEN * dt);

    updateSpawning(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateShots(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateClouds(dt);

    Sound.setIntensity(boss ? 1 : kills / Math.max(1, quota));
  }

  function updateTitle(dt) {
    // idle dragon circling for the attract screen
    if (!player) player = makePlayer();
    player.a = wrapAngle(player.a + dt * 0.55);
    player.x += Math.cos(player.a) * 40 * dt;
    player.y += Math.sin(player.a) * 40 * dt;
    player.flapT += dt;
    if (player.flapT > 0.11) { player.flapT = 0; player.flap = (player.flap + 1) % 3; }
    updateClouds(dt);
    updateParticles(dt);
  }

  function updatePlayer(dt) {
    if (player.dead) return;

    var v = inputVector();
    if (v.x || v.y) {
      var want = Math.atan2(v.y, v.x);
      player.a = turnToward(player.a, want, PLAYER_TURN * dt);
    }

    var throttle = 1;
    player.surging = false;
    if ((keys.surge || touch.surge) && player.mana > 0) {
      throttle = SPEED_SURGE;
      player.surging = true;
      player.mana = Math.max(0, player.mana - SURGE_DRAIN * dt);
      // ember wake, so the speed change is felt as well as seen
      if (Math.random() < 0.8) {
        var back = player.a + Math.PI + rnd(-0.35, 0.35);
        parts.push({
          x: player.x + Math.cos(back) * 12,
          y: player.y + Math.sin(back) * 12,
          vx: Math.cos(back) * rnd(30, 70), vy: Math.sin(back) * rnd(30, 70),
          life: rnd(0.18, 0.4), max: 0.4,
          c: pick(['#fff6c4', '#ffae32', '#f4531b']), s: 1, drag: 2.4
        });
      }
    } else if (keys.glide || touch.glide) {
      throttle = SPEED_GLIDE;
    }
    player.speed = PLAYER_SPEED * throttle;

    player.x += Math.cos(player.a) * player.speed * dt;
    player.y += Math.sin(player.a) * player.speed * dt;

    // wings beat faster under power, slower on a glide
    player.flapT += dt * throttle;
    if (player.flapT > 0.09) {
      player.flapT = 0;
      player.flap = (player.flap + 1) % 3;
    }
    if (player.invuln > 0) player.invuln -= dt;
  }

  function updateSpawning(dt) {
    if (boss || state !== 'PLAY') return;

    if (kills >= quota) {
      if (bossPending === 0) {
        bossPending = 1;
        showBanner('SOMETHING VAST APPROACHES', 2.0);
        Sound.play('bossWarn');
        spawnTimer = 2.4;
      } else if (spawnTimer <= 0) {
        spawnBoss();
        bossPending = 2;
      }
      spawnTimer -= dt;
      return;
    }

    spawnTimer -= dt;
    var cap = 5 + Math.floor(realmIndex * 0.8) + loopCount;
    if (spawnTimer <= 0 && enemies.length < cap) {
      spawnFormation();
      spawnTimer = rnd(3.0, 4.8) / (1 + loopCount * 0.15);
    }

    pickupTimer -= dt;
    if (pickupTimer <= 0 && pickups.length < 2) {
      spawnPickup();
      pickupTimer = rnd(11, 19);
    }
  }

  function foeShoot(e, speed, angle) {
    foeShots.push({
      x: e.x + Math.cos(angle) * 8,
      y: e.y + Math.sin(angle) * 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 2.4
    });
  }

  function updateEnemies(dt) {
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.hurt > 0) e.hurt -= dt;

      if (e.freeze > 0) {
        e.freeze -= dt;
        if (e.freeze <= 0) e.freeze = 0;
      } else {
        var want = Math.atan2(player.y - e.y, player.x - e.x);
        if (e.kind === 'raptor') want += e.weave * Math.sin(timeNow * 1.6 + e.phase);
        e.a = turnToward(e.a, want, e.turn * dt);
        e.x += Math.cos(e.a) * e.speed * dt;
        e.y += Math.sin(e.a) * e.speed * dt;

        e.flapT += dt;
        if (e.flapT > 0.12) { e.flapT = 0; e.flap = (e.flap + 1) % 2; }

        // fire when roughly lined up and in range
        e.cool -= dt;
        var d2 = dist2(e.x, e.y, player.x, player.y);
        if (!player.dead && e.cool <= 0 && d2 < 170 * 170) {
          var aim = Math.atan2(player.y - e.y, player.x - e.x);
          if (Math.abs(wrapAngle(aim - e.a)) < 0.26) {
            foeShoot(e, 100 + realmIndex * 8, e.a);
            e.cool = rnd(2.2, 4.0) / realm.aggression;
          }
        }
      }

      if (dist2(e.x, e.y, player.x, player.y) > RECYCLE_R * RECYCLE_R) recycleAhead(e);

      if (!player.dead && player.invuln <= 0 &&
        dist2(e.x, e.y, player.x, player.y) < (e.r + PLAYER_R) * (e.r + PLAYER_R)) {
        killEnemy(e, i);
        killPlayer();
      }
    }
  }

  function updateBoss(dt) {
    if (!boss) return;
    var b = boss;
    if (b.hurt > 0) b.hurt -= dt;

    var d = Math.sqrt(dist2(b.x, b.y, player.x, player.y));
    var want = Math.atan2(player.y - b.y, player.x - b.x);
    // hold a stand-off distance rather than ramming
    if (d < 90) want += Math.PI * 0.55;
    else if (d < 150) want += Math.PI * 0.3;
    b.a = turnToward(b.a, want, b.turn * dt);

    /* The leviathan is slower than the dragon, so left alone it would trail
     * off-screen and the fight would become a 15-second waiting game. Surge
     * when the gap opens up to hold it at a distance you can actually duel. */
    var HOLD = 120;
    var sp = b.speed;
    if (d > HOLD) sp = Math.min(b.speed * 2.4, PLAYER_SPEED + (d - HOLD) * 0.6);
    b.x += Math.cos(b.a) * sp * dt;
    b.y += Math.sin(b.a) * sp * dt;

    b.flapT += dt;
    if (b.flapT > 0.18) { b.flapT = 0; b.flap = (b.flap + 1) % 2; }

    b.cool -= dt;
    if (!player.dead && b.cool <= 0) {
      var hp = b.hp / b.maxHp;
      if (Math.random() < 0.45 || hp < 0.4) {
        // radial burst
        var n = hp < 0.4 ? 12 : 8;
        var base = rnd(0, TAU);
        for (var i = 0; i < n; i++) foeShoot(b, 96, base + i / n * TAU);
      } else {
        // aimed three-shot
        var aim = Math.atan2(player.y - b.y, player.x - b.x);
        for (var j = -1; j <= 1; j++) foeShoot(b, 132, aim + j * 0.22);
      }
      b.cool = rnd(1.5, 2.6) * (hp < 0.4 ? 0.7 : 1);
    }

    b.escortCool -= dt;
    if (b.escortCool <= 0 && enemies.length < 8) {
      var ang = rnd(0, TAU);
      spawnEnemy('raptor', b.x + Math.cos(ang) * 40, b.y + Math.sin(ang) * 40);
      spawnEnemy('raptor', b.x - Math.cos(ang) * 40, b.y - Math.sin(ang) * 40);
      b.escortCool = rnd(7, 11);
    }

    if (dist2(b.x, b.y, player.x, player.y) > RECYCLE_R * RECYCLE_R) recycleAhead(b);

    if (!player.dead && player.invuln <= 0 &&
      dist2(b.x, b.y, player.x, player.y) < (b.r + PLAYER_R) * (b.r + PLAYER_R)) {
      killPlayer();
    }
  }

  function updateShots(dt) {
    var i, j;

    for (i = shots.length - 1; i >= 0; i--) {
      var s = shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) { shots.splice(i, 1); continue; }

      var wp = WEAPONS[s.w];
      var hitSomething = false;

      if (boss && dist2(s.x, s.y, boss.x, boss.y) < (boss.r + wp.radius) * (boss.r + wp.radius)) {
        if (damageTarget(boss, wp.dmg, wp, s.x, s.y)) { killBoss(); return; }
        hitSomething = true;
      }

      if (!hitSomething) {
        for (j = enemies.length - 1; j >= 0; j--) {
          var e = enemies[j];
          if (dist2(s.x, s.y, e.x, e.y) < (e.r + wp.radius) * (e.r + wp.radius)) {
            if (damageTarget(e, wp.dmg, wp, s.x, s.y)) {
              // storm breath arcs to a neighbour
              if (wp.chain) chainTo(e.x, e.y, wp, e);
              killEnemy(e, j);
            }
            hitSomething = true;
            break;
          }
        }
      }

      if (hitSomething) {
        if (s.pierce > 0) s.pierce--;
        else shots.splice(i, 1);
      }
    }

    for (i = foeShots.length - 1; i >= 0; i--) {
      var f = foeShots[i];
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0 || dist2(f.x, f.y, player.x, player.y) > RECYCLE_R * RECYCLE_R) {
        foeShots.splice(i, 1);
        continue;
      }
      if (!player.dead && player.invuln <= 0 &&
        dist2(f.x, f.y, player.x, player.y) < (PLAYER_R + 3) * (PLAYER_R + 3)) {
        foeShots.splice(i, 1);
        killPlayer();
      }
    }
  }

  function chainTo(x, y, wp, exclude) {
    var best = null, bestD = wp.chain * wp.chain;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e === exclude) continue;
      var d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return;
    parts.push({
      bolt: true, x1: x, y1: y, x2: best.x, y2: best.y,
      life: 0.14, max: 0.14, c: wp.core
    });
    if (damageTarget(best, wp.dmg, wp, best.x, best.y)) {
      var idx = enemies.indexOf(best);
      if (idx >= 0) killEnemy(best, idx);
    }
  }

  function updatePickups(dt) {
    for (var i = pickups.length - 1; i >= 0; i--) {
      var p = pickups[i];
      p.bob += dt * 3;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || dist2(p.x, p.y, player.x, player.y) > RECYCLE_R * RECYCLE_R) {
        pickups.splice(i, 1);
        continue;
      }
      if (!player.dead && dist2(p.x, p.y, player.x, player.y) < (PLAYER_R + 7) * (PLAYER_R + 7)) {
        pickups.splice(i, 1);
        rescues++;
        addScore(1000);
        player.mana = MANA_MAX;
        burst(p.x, p.y, 14, ['#ffffff', '#f2cf72', '#c8922f'], 90, 0.5, 2);
        ring(p.x, p.y, '#f2cf72', 22, 90);
        Sound.play('rescue');
        if (rescues % RESCUES_PER_LIFE === 0) {
          grantExtraLife('FIVE SAVED  EXTRA WING');
        } else {
          // show the progress so the reward is discoverable
          showBanner('HATCHLING SAVED  ' +
            (rescues % RESCUES_PER_LIFE) + '/' + RESCUES_PER_LIFE, 1.4);
        }
      }
    }
  }

  function updateParticles(dt) {
    var i, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.bolt) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var k = 1 - p.drag * dt;
      p.vx *= k; p.vy *= k;
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.r += r.speed * dt;
      if (r.r >= r.max) rings.splice(i, 1);
    }
  }

  function updateClouds(dt) {
    var i;
    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var sx = c.x - player.x * c.par + HALF_W;
      var sy = c.y - player.y * c.par + HALF_H;
      var m = 110;
      if (sx < -m || sx > W + m || sy < -m || sy > H + m) {
        clouds[i] = newCloud(false);
      }
    }
    // motes are screen-space and stream past opposite the heading; they ride
    // the current throttle, which is most of what sells a surge
    var sp = player.speed || PLAYER_SPEED;
    var vx = -Math.cos(player.a) * sp;
    var vy = -Math.sin(player.a) * sp;
    for (i = 0; i < motes.length; i++) {
      var mo = motes[i];
      mo.x += vx * mo.z * dt;
      mo.y += vy * mo.z * dt;
      if (mo.x < -4) mo.x += W + 8;
      if (mo.x > W + 4) mo.x -= W + 8;
      if (mo.y < -4) mo.y += H + 8;
      if (mo.y > H + 4) mo.y -= H + 8;
    }
  }

  /* ---------- render ------------------------------------------------------ */
  function sx(wx, par) { return wx - player.x * (par || 1) + HALF_W; }
  function sy(wy, par) { return wy - player.y * (par || 1) + HALF_H; }

  function render() {
    ctx.save();
    if (shake > 0.05) {
      ctx.translate(Math.round(rnd(-shake, shake)), Math.round(rnd(-shake, shake)));
    }

    ctx.drawImage(sky, 0, 0);
    drawClouds(false);
    drawMotes();
    drawClouds(true);

    if (state !== 'TITLE') {
      drawPickups();
      drawFoeShots();
      drawEnemies();
      drawBoss();
      drawShots();
    }
    drawPlayer();
    drawParticles();

    ctx.restore();

    if (flashAmount > 0.01) {
      ctx.globalAlpha = Math.min(1, flashAmount);
      ctx.fillStyle = flashColour;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (state === 'TITLE') drawTitle();
    else {
      drawHud();
      if (state === 'PAUSED') drawPaused();
      if (state === 'REALM_CLEAR') drawRealmClear();
      if (state === 'GAMEOVER') drawGameOver();
    }
    drawBanner();
  }

  function drawClouds(near) {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      if ((c.par > 0.6) !== near) continue;
      var x = Math.round(sx(c.x, c.par) - c.img.width / 2);
      var y = Math.round(sy(c.y, c.par) - c.img.height / 2);
      if (x > W + 60 || y > H + 60 || x < -c.img.width - 60 || y < -c.img.height - 60) continue;
      ctx.globalAlpha = c.dim ? 0.45 : 0.75;
      ctx.drawImage(c.img, x, y);
      ctx.globalAlpha = 1;
    }
  }

  function drawMotes() {
    ctx.fillStyle = realm.mote;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      ctx.globalAlpha = 0.25 + m.z * 0.35;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    if (!player || player.dead) return;
    // blink while invulnerable
    if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
    Art.drawSet(ctx, A.dragon[player.flap], player.a, HALF_W, HALF_H);
  }

  function drawEnemies() {
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      var x = sx(e.x), y = sy(e.y);
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      var sets;
      if (e.hurt > 0) sets = A.enemyFlash[e.kind][realm.pal];
      else if (e.freeze > 0) sets = A.enemyIce[e.kind][realm.pal];
      else sets = A.enemy[e.kind][realm.pal];
      Art.drawSet(ctx, sets[e.flap], e.a, x, y);
    }
  }

  function drawBoss() {
    if (!boss) return;
    var sets = boss.hurt > 0 ? A.bossFlash[realm.pal] : A.boss[realm.pal];
    Art.drawSet(ctx, sets[boss.flap], boss.a, sx(boss.x), sy(boss.y));
  }

  function drawShots() {
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      var wp = WEAPONS[s.w];
      var x = Math.round(sx(s.x)), y = Math.round(sy(s.y));
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;

      if (wp.pierce) {
        // storm: a jagged streak instead of a bead
        var tx = Math.round(x - Math.cos(s.a) * 9), ty = Math.round(y - Math.sin(s.a) * 9);
        ctx.strokeStyle = wp.edge;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.strokeStyle = wp.core;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo((tx + x) / 2 + rnd(-2, 2), (ty + y) / 2 + rnd(-2, 2));
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.fillStyle = wp.edge;
        ctx.fillRect(x - 2, y - 2, 5, 5);
        ctx.fillStyle = wp.mid;
        ctx.fillRect(x - 1, y - 1, 3, 3);
        ctx.fillStyle = wp.core;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function drawFoeShots() {
    for (var i = 0; i < foeShots.length; i++) {
      var f = foeShots[i];
      var x = Math.round(sx(f.x)), y = Math.round(sy(f.y));
      if (x < -6 || x > W + 6 || y < -6 || y > H + 6) continue;
      ctx.fillStyle = '#2a0b0b';
      ctx.fillRect(x - 2, y - 2, 5, 5);
      ctx.fillStyle = realm.shot;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function drawPickups() {
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i];
      var x = sx(p.x), y = sy(p.y) + Math.sin(p.bob) * 2;
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      // fade out as it is about to leave
      if (p.life < 3 && Math.floor(p.life * 6) % 2 === 0) continue;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#f2cf72';
      ctx.fillRect(Math.round(x) - 7, Math.round(y) - 7, 14, 14);
      ctx.globalAlpha = 1;
      Art.drawSprite(ctx, A.hatchling, x, y);
    }
  }

  function drawParticles() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var a = clamp(p.life / p.max, 0, 1);
      if (p.bolt) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.round(sx(p.x1)), Math.round(sy(p.y1)));
        ctx.lineTo(Math.round(sx((p.x1 + p.x2) / 2) + rnd(-3, 3)), Math.round(sy((p.y1 + p.y2) / 2) + rnd(-3, 3)));
        ctx.lineTo(Math.round(sx(p.x2)), Math.round(sy(p.y2)));
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(sx(p.x)), Math.round(sy(p.y)), p.s, p.s);
      ctx.globalAlpha = 1;
    }
    for (var j = 0; j < rings.length; j++) {
      var r = rings[j];
      ctx.globalAlpha = clamp(1 - r.r / r.max, 0, 1) * 0.8;
      ctx.strokeStyle = r.c;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.round(sx(r.x)), Math.round(sy(r.y)), r.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- HUD ---------------------------------------------------------- */
  function panel(x, y, w, h) {
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    panel(0, 0, W, 15);

    Art.drawText(ctx, 'SCORE ' + pad(score, 6), 4, 4, '#f2cf72', 1);
    var hiStr = 'HI ' + pad(hiScore, 6);
    Art.drawText(ctx, hiStr, W - 4 - Art.textWidth(hiStr, 1), 4, '#c8922f', 1);

    var label = realm.name + (loopCount ? ' +' + loopCount : '');
    Art.drawTextCentred(ctx, label, HALF_W, 4, '#ffffff', 1);

    // realm progress / boss health
    var barW = 96, barX = HALF_W - barW / 2, barY = 16;
    var frac = boss ? boss.hp / boss.maxHp : clamp(kills / quota, 0, 1);
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(barX - 1, barY - 1, barW + 2, 5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = boss ? '#e8341f' : '#7a4a15';
    ctx.fillRect(barX, barY, barW, 3);
    ctx.fillStyle = boss ? '#ffd166' : '#f2cf72';
    ctx.fillRect(barX, barY, Math.round(barW * frac), 3);

    // lives
    panel(0, H - 14, W, 14);
    Art.drawText(ctx, 'WINGS', 4, H - 11, '#c8922f', 1);
    for (var i = 0; i < Math.min(lives, 6); i++) {
      var lx = 42 + i * 9, ly = H - 11;
      ctx.fillStyle = '#f2cf72';
      ctx.fillRect(lx, ly + 2, 7, 2);
      ctx.fillRect(lx + 3, ly, 1, 6);
      ctx.fillStyle = '#c8922f';
      ctx.fillRect(lx + 1, ly + 4, 5, 1);
    }
    if (lives > 6) Art.drawText(ctx, '+' + (lives - 6), 42 + 6 * 9, H - 11, '#f2cf72', 1);

    // hatchling progress toward the next wing
    var got = rescues % RESCUES_PER_LIFE;
    for (var p = 0; p < RESCUES_PER_LIFE; p++) {
      ctx.fillStyle = p < got ? '#f2cf72' : '#3a2c14';
      ctx.fillRect(112 + p * 5, H - 8, 3, 3);
    }

    // mana + weapon
    var wp = WEAPONS[player.weapon];
    var mw = 58, mx = W - 4 - mw, my = H - 11;
    ctx.fillStyle = '#000000';
    ctx.fillRect(mx - 1, my - 1, mw + 2, 9);
    ctx.fillStyle = '#241a10';
    ctx.fillRect(mx, my, mw, 7);
    ctx.fillStyle = wp.mid;
    ctx.fillRect(mx, my, Math.round(mw * (player.mana / MANA_MAX)), 7);
    ctx.fillStyle = wp.core;
    ctx.fillRect(mx, my, Math.round(mw * (player.mana / MANA_MAX)), 1);
    var nameX = mx - 6 - Art.textWidth(wp.name, 1);
    Art.drawText(ctx, wp.name, nameX, H - 11, wp.core, 1);

    // weapon slots
    for (var k = 0; k < WEAPONS.length; k++) {
      var bx = nameX - 8 - (WEAPONS.length - k) * 6;
      ctx.fillStyle = k === player.weapon ? WEAPONS[k].core : WEAPONS[k].edge;
      ctx.fillRect(bx, H - 10, 4, 5);
    }
  }

  function drawBanner() {
    if (!banner) return;
    var a = clamp(banner.t / Math.min(0.6, banner.max), 0, 1);
    ctx.globalAlpha = a;
    var y = 44;
    var w = Art.textWidth(banner.text, 1) + 12;
    panel(HALF_W - w / 2, y - 5, w, 17);
    Art.drawTextCentred(ctx, banner.text, HALF_W, y, '#ffffff', 1);
    ctx.globalAlpha = 1;
  }

  function drawPaused() {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    Art.drawTextCentred(ctx, 'PAUSED', HALF_W, HALF_H - 10, '#f2cf72', 2);
    Art.drawTextCentred(ctx, 'PRESS P TO RESUME', HALF_W, HALF_H + 14, '#ffffff', 1);
  }

  // Kept clear of the screen centre so the dragon never sits inside the text.
  function drawRealmClear() {
    Art.drawTextCentred(ctx, 'REALM CLEARED', HALF_W, 54, '#f2cf72', 2);
    Art.drawTextCentred(ctx, realm.name, HALF_W, 78, '#ffffff', 1);
    if (stateTime > 1.4) {
      var next = REALMS[(realmIndex + 1) % REALMS.length];
      Art.drawTextCentred(ctx, 'NEXT  ' + next.name, HALF_W, 176, '#c8922f', 1);
    }
  }

  function drawGameOver() {
    ctx.globalAlpha = 0.62;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    Art.drawTextCentred(ctx, 'GAME OVER', HALF_W, 78, '#e8341f', 3);
    Art.drawTextCentred(ctx, 'SCORE  ' + pad(score, 6), HALF_W, 118, '#ffffff', 1);
    Art.drawTextCentred(ctx, 'BEST   ' + pad(hiScore, 6), HALF_W, 132, '#f2cf72', 1);
    if (score >= hiScore && score > 0) {
      Art.drawTextCentred(ctx, 'NEW RECORD', HALF_W, 150, '#ffd166', 1);
    }
    if (stateTime > 1.0 && Math.floor(stateTime * 2) % 2 === 0) {
      Art.drawTextCentred(ctx, 'PRESS ENTER', HALF_W, 176, '#ffffff', 1);
    }
  }

  function drawTitle() {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    Art.drawTextCentred(ctx, 'EMBERWING', HALF_W, 34, '#f2cf72', 4);
    Art.drawTextCentred(ctx, 'SKIES OF THE SUNDERED REALMS', HALF_W, 68, '#c8922f', 1);

    Art.drawTextCentred(ctx, 'ARROWS / WASD   STEER', HALF_W, 96, '#ffffff', 1);
    Art.drawTextCentred(ctx, 'SPACE   BREATHE', HALF_W, 108, '#ffffff', 1);
    Art.drawTextCentred(ctx, '1 2 3 OR X   FIRE FROST STORM', HALF_W, 120, '#ffffff', 1);
    Art.drawTextCentred(ctx, 'SHIFT SURGE    CTRL GLIDE', HALF_W, 132, '#f2cf72', 1);
    Art.drawTextCentred(ctx, 'P PAUSE    M SOUND', HALF_W, 146, '#8a6a3a', 1);

    if (hiScore > 0) {
      Art.drawTextCentred(ctx, 'BEST  ' + pad(hiScore, 6), HALF_W, 168, '#c8922f', 1);
    }
    if (Math.floor(timeNow * 2) % 2 === 0) {
      Art.drawTextCentred(ctx, 'PRESS ENTER OR TAP TO FLY', HALF_W, 196, '#ffffff', 1);
    }
    Art.drawTextCentred(ctx, 'THE STUDIO OF WORLDS', HALF_W, 220, '#6b5230', 1);
  }

  /* ---------- DOM glue ----------------------------------------------------- */
  function syncWeaponButtons() {
    var btns = document.querySelectorAll('[data-weapon]');
    for (var i = 0; i < btns.length; i++) {
      var idx = parseInt(btns[i].getAttribute('data-weapon'), 10);
      var on = player && player.weapon === idx;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function syncSoundButton() {
    var b = document.getElementById('btn-sound');
    if (!b) return;
    var on = Sound.isEnabled();
    b.textContent = on ? 'Sound: on' : 'Sound: off';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function bindButtons() {
    var btns = document.querySelectorAll('[data-weapon]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          Sound.unlock();
          selectWeapon(parseInt(b.getAttribute('data-weapon'), 10));
          canvas.focus();
        });
      })(btns[i]);
    }
    // Hold-to-act buttons for touch; pointer capture keeps the "up" reliable
    // even if the finger slides off the button.
    var holds = document.querySelectorAll('[data-hold]');
    for (var h = 0; h < holds.length; h++) {
      (function (b) {
        var flag = b.getAttribute('data-hold');
        function down(ev) {
          touch[flag] = true;
          b.classList.add('is-active');
          try { b.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ }
          Sound.unlock();
          ev.preventDefault();
        }
        function up() { touch[flag] = false; b.classList.remove('is-active'); }
        b.addEventListener('pointerdown', down);
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
      })(holds[h]);
    }

    var snd = document.getElementById('btn-sound');
    if (snd) snd.addEventListener('click', function () { Sound.toggle(); syncSoundButton(); });

    var pause = document.getElementById('btn-pause');
    if (pause) pause.addEventListener('click', function () { onPress('pause'); canvas.focus(); });

    var full = document.getElementById('btn-full');
    if (full) {
      full.addEventListener('click', function () {
        var stage = document.getElementById('stage');
        if (!document.fullscreenElement) {
          if (stage.requestFullscreen) stage.requestFullscreen();
          else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      });
    }
  }

  // Integer-scale the canvas so pixels stay square and crisp.
  function fit() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var availW = stage.clientWidth;
    var availH = Math.max(200, global.innerHeight - (document.fullscreenElement ? 0 : 190));
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
    if (dt > 0.05) dt = 0.05;     // never let a stall teleport anything

    update(dt);
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

    A = Art.build();
    hiScore = loadHi();

    player = makePlayer();
    realm = REALMS[0];
    buildBackdrop();

    bindInput();
    bindButtons();
    syncSoundButton();
    fit();
    global.addEventListener('resize', fit);
    document.addEventListener('fullscreenchange', fit);

    var loading = document.getElementById('loading');
    if (loading) loading.remove();

    // Opt-in test harness: /games/emberwing/?debug
    if (global.location.search.indexOf('debug') >= 0) {
      global.EW = {
        state: function () {
          return {
            state: state, realm: realm.name, kills: kills, quota: quota,
            score: score, lives: lives, enemies: enemies.length,
            boss: boss ? Math.round(boss.hp) + '/' + boss.maxHp : null,
            bossDist: boss ? Math.round(Math.sqrt(dist2(boss.x, boss.y, player.x, player.y))) : null,
            player: player ? {
              x: Math.round(player.x), y: Math.round(player.y),
              a: player.a.toFixed(2), dead: player.dead,
              invuln: player.invuln.toFixed(1), mana: Math.round(player.mana)
            } : null
          };
        },
        start: startRun,
        skipToBoss: function () { kills = quota; spawnTimer = 0; bossPending = 1; },
        killBoss: function () { if (boss) { boss.hp = 0; killBoss(); } },
        gotoRealm: function (i) { enterRealm(i); state = 'PLAY'; stateTime = 0; },
        godMode: function (on) { INVULN_FOREVER = !!on; },
        clearFoes: function () { enemies.length = 0; foeShots.length = 0; }
      };
    }

    running = true;
    last = performance.now();
    global.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
