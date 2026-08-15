/* The Death Pit of Shem — 16-bit pixel art data and the bitmap font.
 *
 * Every sprite is authored here as a character grid; nothing is loaded from
 * disk. The 16-bit look comes from two places: deep shading ramps (six or
 * seven tones per material instead of the usual three) and a dedicated rim
 * key `r`, a cyan edge light that stands in for the bioluminescence bouncing
 * off everything in the cavern. Read the ramps as 1=deepest shadow through
 * 6=brightest highlight, so one silhouette can be re-skinned per creature.
 *
 * Rows are right-padded to the widest row in their grid, so art can be
 * written with trailing dots omitted. A row that runs LONGER than its
 * declared width is a typo and warns loudly.
 */
(function (global) {
  'use strict';

  /* ---------- palettes ---------------------------------------------------
   * Shared keys across every creature:
   *   o outline   1..6 shading ramp (dark to light)   r rim light
   *   e eye       E eye glint       p pupil           t teeth
   * Material-specific keys are noted per palette.
   */
  var RIM = '#6fe8ff';   // the cavern's own glow, reflected off every edge

  /* Bob Goblin, from the model sheet: a yellow-green ramp for the skin, warm
   * tan for the ear interiors and nose, and a separate ramp for each piece of
   * his kit so the cowl, pauldron, belt and loincloth all hold their own value
   * against the green instead of muddying into it. */
  var PAL_BOB = {
    o: '#101609',
    1: '#24400f', 2: '#3a6417', 3: '#528a1f', 4: '#6faa2b', 5: '#8cc63f', 6: '#a8dc57', 7: '#c8ee7e',
    r: RIM,
    n: '#b8632f', N: '#e0924a', m: '#f7c07e',              // ear interiors, nose
    b: '#d9663f', t: '#fff4d6',                            // cheek blush, fang
    c: '#242e1e', C: '#3d4a33', v: '#5a6b4c',              // neck cowl
    a: '#3f4d46', A: '#647569', S: '#8fa093',              // scale pauldron
    l: '#3a2412', L: '#5e3a1c', G: '#8a5a2c',              // leather belt, boots
    u: '#8f3c18', U: '#c85f24', V: '#ef8b3f',              // rust loincloth
    k: '#2e1d10', K: '#4d3018',                            // cloak
    x: '#2f3945', X: '#6b7b8c', Y: '#b6c6d6', Z: '#eef6ff',// dagger steel
    h: '#3a2010', H: '#6b3c1c'                             // dagger hilt
  };

  /* Gremlin: dark shaggy green with a salmon ear lining, straight off the
     monster sheet. `7` is the bright rim that picks out the ear edges. */
  var PAL_GREM = {
    o: '#0d1a0c',
    1: '#1e3a18', 2: '#2f5c24', 3: '#437a2f', 4: '#5a9a3c', 5: '#78bb4e',
    6: '#9dd468', 7: '#c8e88a',
    p: '#b8524a', P: '#e0736a', q: '#f5a094',        // ear lining, foot claws
    e: '#f7efe2', E: '#ffffff', b: '#140f0a',        // eye white, glint, pupil
    n: '#d9635a', t: '#fff2d8', r: RIM               // nose, crooked teeth
  };

  // Cave crawler: hot orange, the one warm creature down here.
  var PAL_GRUB = {
    o: '#12060c',
    1: '#5c1a12', 2: '#8f2f14', 3: '#c2521c', 4: '#e07a24', 5: '#f5a63f', 6: '#ffd98a',
    r: RIM, e: '#9dffea', E: '#ffffff', p: '#140a06', g: '#4dffd0', G: '#c8fff2'
  };

  // Glowbat: violet body, cyan lamp-eyes.
  var PAL_BAT = {
    o: '#0a0616',
    1: '#2a1550', 2: '#432474', 3: '#5f3a9c', 4: '#7f57c0', 5: '#a37fe0', 6: '#d2b8f5',
    r: RIM, e: '#7dfcff', E: '#ffffff', p: '#0a0616', g: '#4de0ff'
  };

  // Sporepod: sickly yellow-green, deliberately unappetising.
  var PAL_POD = {
    o: '#0d1008',
    1: '#2e3d10', 2: '#4c621a', 3: '#6f8a24', 4: '#95ac2f', 5: '#bccb4f', 6: '#e6ec93',
    r: RIM, e: '#ff5f7a', E: '#ffd0d8', p: '#180608', g: '#b6ff4d'
  };

  // Bounce shroom: the friendliest thing in the pit, so it gets pink.
  var PAL_SHROOM = {
    o: '#140618',
    1: '#4a1240', 2: '#73215e', 3: '#a03680', 4: '#c9539f', 5: '#e582c0', 6: '#ffc2e4',
    r: RIM, s: '#3d2a52', S: '#6b4f88', T: '#a58cc4'
  };

  // Cavern rock. `t`/`T` are the lit crust; `g`/`G` are glow moss.
  var PAL_ROCK = {
    o: '#04030a',
    1: '#0d0c22', 2: '#171633', 3: '#232148', 4: '#302d5e', 5: '#403c78', 6: '#565194',
    t: '#1d5b66', T: '#3aa39c', g: '#4de0c0', G: '#b6ffee', r: RIM
  };

  // Crystal spikes — bright enough to read as "do not touch".
  var PAL_SPIKE = {
    o: '#04030a',
    1: '#0f3a52', 2: '#17607f', 3: '#2189ad', 4: '#3fb6d6', 5: '#7fe2f5', 6: '#dcfbff',
    r: '#ffffff'
  };

  // Fungal shelf platforms: purple caps so they never read as solid rock.
  var PAL_SHELF = {
    o: '#0a0614',
    1: '#331446', 2: '#4f2166', 3: '#6f3489', 4: '#8f4faa', 5: '#b678cb', 6: '#dcb0e8',
    g: '#4de0c0', r: RIM
  };

  // Extra life: the same heart in gold, which reads as "rare" instantly.
  var PAL_LIFE = {
    o: '#2a1a02',
    1: '#6b4a06', 2: '#9c710f', 3: '#c99a1c', 4: '#e8bd35', 5: '#f7d968', 6: '#fff4c0',
    r: RIM
  };

  var PAL_HEART = {
    o: '#14060c',
    1: '#5c0d22', 2: '#8f1633', 3: '#c22348', 4: '#e04463', 5: '#f57f92', 6: '#ffd0d8',
    r: RIM
  };

  /* ---------- grid plumbing --------------------------------------------- */
  function hexToRgb(hex) {
    return [
      parseInt(hex.substr(1, 2), 16),
      parseInt(hex.substr(3, 2), 16),
      parseInt(hex.substr(5, 2), 16)
    ];
  }

  /* Right-pads short rows so art can omit trailing dots, but shouts about a
   * row that overshoots — that is always a miscount, never a shorthand. */
  function normalise(rows, name) {
    var w = 0, i;
    for (i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    var out = [];
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      while (row.length < w) row += '.';
      out.push(row);
    }
    if (name && typeof console !== 'undefined') {
      for (i = 0; i < rows.length; i++) {
        if (rows[i].length > w) console.warn('sprite "' + name + '" row ' + i + ' overruns');
      }
    }
    return { rows: out, w: w, h: out.length };
  }

  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* Character grid -> canvas. Unknown characters and '.' are transparent, so
   * a missing palette key leaves a visible hole rather than a wrong colour. */
  function make(rows, pal, name) {
    var n = normalise(rows, name);
    var c = newCanvas(n.w, n.h);
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(n.w, n.h);
    var d = img.data;
    var cache = {};
    for (var y = 0; y < n.h; y++) {
      for (var x = 0; x < n.w; x++) {
        var ch = n.rows[y].charAt(x);
        if (ch === '.' || ch === ' ') continue;
        var hex = pal[ch];
        if (!hex) continue;
        var col = cache[hex] || (cache[hex] = hexToRgb(hex));
        var o = (y * n.w + x) * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function flip(src) {
    var c = newCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0);
    return c;
  }

  // Solid-colour silhouette, used for damage flashes.
  function tint(src, colour) {
    var c = newCanvas(src.width, src.height);
    var ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* A frame carries both facings so the game never flips at draw time. */
  function frame(rows, pal, name) {
    var r = make(rows, pal, name);
    return { r: r, l: flip(r), w: r.width, h: r.height };
  }

  function frames(list, pal, name) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(frame(list[i], pal, name + i));
    return out;
  }

  function flashOf(list, colour) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      out.push({ r: tint(list[i].r, colour), l: tint(list[i].l, colour), w: list[i].w, h: list[i].h });
    }
    return out;
  }

  /* ---------- Bob Goblin -------------------------------------------------
   * Built from the model sheet: an oversized dome head that is nearly half
   * his height, huge swept-back ears with warm tan interiors, a sprout on
   * top, dot eyes set low and forward, a blush, one fang, a neck cowl, a
   * single scale pauldron, a leather belt over a rust loincloth, boots, and
   * a short dagger.
   *
   * The head is authored ONCE and composed into every frame, so the character
   * cannot drift between animations — only the body and the head's vertical
   * offset change. That is also why the frames stay cheap to add: a new pose
   * is thirteen rows of body, not a whole character.
   *
   * Grid is 24 wide; head occupies rows 0-16 and body rows 15-27, overlapping
   * at the neck so the cowl sits over the jaw.
   */
  var BOB_W = 30, BOB_H = 28, BODY_Y = 15;

  // Merges layers of character art into one grid. Later layers win, and '.'
  // is transparent, so a body can be dropped over the head without erasing it.
  function compose(w, h, layers) {
    var grid = [], y, x;
    for (y = 0; y < h; y++) grid.push(new Array(w + 1).join('.').split(''));
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      var n = normalise(L.rows, L.name);
      for (y = 0; y < n.h; y++) {
        var gy = y + (L.dy || 0);
        if (gy < 0 || gy >= h) continue;
        for (x = 0; x < n.w; x++) {
          var gx = x + (L.dx || 0);
          if (gx < 0 || gx >= w) continue;
          var ch = n.rows[y].charAt(x);
          if (ch === '.' || ch === ' ') continue;
          grid[gy][gx] = ch;
        }
      }
    }
    var out = [];
    for (y = 0; y < h; y++) out.push(grid[y].join(''));
    return out;
  }

  /* The head is itself composed from three pieces: the dome, and the two ears
   * as separate layers. Authoring the ears inline failed twice — as thin
   * diagonal bands they read as ARMS, not ears. Kept as their own filled
   * wedges they can be shaped and positioned independently, which is the only
   * way the swept-back silhouette from the model sheet survives at 30px.
   */
  var BOB_EAR_BACK = [
    'oo......',
    'o77o....',
    'o7NN7o..',
    'o7NNNN7o',
    'o7NNNNNo',
    '.onNNNNo',
    '..onnNNo',
    '...onnno',
    '....ooo.'
  ];

  var BOB_EAR_FRONT = [
    '....oo',
    '...o7o',
    '..o7No',
    '.o7NNo',
    'o7NNNo',
    'onnNNo',
    '.ooooo'
  ];

  var BOB_DOME = [
    '........6.........',
    '.......o3o........',
    '....oooooooooo....',
    '..oo7777777777oo..',
    '.o77777777777777o.',
    'o7777777777777777o',
    'o7777777777777777o',
    'o7666666666666666o',
    'o6666666666666666o',
    'o6666666666666665o',
    'o66666o55555o5555o',
    'o6666655555555nNNo',
    'o66b5555555b555nNo',
    'o6655555t555555nno',
    'o455555555555555o.',
    '.o44444444444440..',
    '..o3333333333o....',
    '...ooooooooooo....'
  ];

  // Same dome, eyes screwed shut and teeth bared, for the hurt pose.
  var BOB_DOME_HURT = [
    '........6.........',
    '.......o3o........',
    '....oooooooooo....',
    '..oo7777777777oo..',
    '.o77777777777777o.',
    'o7777777777777777o',
    'o7777777777777777o',
    'o7666666666666666o',
    'o6666666666666666o',
    'o6666666666666665o',
    'o6666oo5555oo5555o',
    'o6666655555555nNNo',
    'o66b5555555b555nNo',
    'o665ottto555555nno',
    'o455555555555555o.',
    '.o44444444444440..',
    '..o3333333333o....',
    '...ooooooooooo....'
  ];

  function bobHead(hurt) {
    return compose(BOB_W, 18, [
      { rows: BOB_EAR_BACK, dx: 0, dy: 7, name: 'bob-ear-back' },
      { rows: BOB_EAR_FRONT, dx: 22, dy: 8, name: 'bob-ear-front' },
      { rows: hurt ? BOB_DOME_HURT : BOB_DOME, dx: 6, dy: 0, name: 'bob-dome' }
    ]);
  }

  var BOB_HEAD = bobHead(false);
  var BOB_HEAD_HURT = bobHead(true);

  /* Bodies. Row 0 lands on sprite row BODY_Y. Each pose carries its own arm
   * and dagger, because a dagger without the arm that holds it reads as a
   * floating stick — which is exactly what the first pass looked like. */
  var BODY_IDLE = [
    '.......occCCCCCCcco...........',
    '.....oaAScCCvvvCCcoo44o.......',
    '....oaASSAocCCCCCCo545o.......',
    '....oaAAAAoLLLLLLLo545o.......',
    '.....oaaaoLGLLLGLLo54o........',
    '......oooluUUUUUUlohHo........',
    '........ouUVVVVVUuohHo........',
    '........ouUVVVVVUuooZo........',
    '........ouUVVVVVUuooYo........',
    '........oLLo.oLLo..oXo........',
    '........oLGo.oLGo...o.........',
    '........oLLo.oLLo.............',
    '........oooo.oooo.............'
  ];

  var BODY_RUN = [
    [ // 0 — contact, stride open, dagger arm swung back
      '.......occCCCCCCcco...........',
      '...o44oaAScCCvvvCCco..........',
      '..o545oASSAocCCCCCCo..........',
      '..o545AAAAoLLLLLLLo...........',
      '..o54ooaaoLGLLLGLLo...........',
      '..ohHoooluUUUUUUlo............',
      '..ohHo..ouUVVVVVUuo...........',
      '..ooZo..ouUVVVVVUuo...........',
      '..ooYo.oLLo....oLLo...........',
      '..ooXo.LGo......oLGo..........',
      '...o..oLLo.......oLLo.........',
      '.....oLGo........oLGo.........',
      '.....oooo........oooo.........'
    ],
    [ // 1 — passing, weight forward
      '.......occCCCCCCcco...........',
      '.....oaAScCCvvvCCcoo44o.......',
      '....oaASSAocCCCCCCo545o.......',
      '....oaAAAAoLLLLLLLo545o.......',
      '.....oaaaoLGLLLGLLo54o........',
      '......oooluUUUUUUlohHo........',
      '........ouUVVVVVUuohHo........',
      '........ouUVVVVVUuooZo........',
      '........oLLooLLo...oYo........',
      '........oLGooLGo...oXo........',
      '........oLLooLLo....o.........',
      '........oLGooLGo..............',
      '........ooooooooo.............'
    ],
    [ // 2 — contact, opposite stride, arm forward
      '.......occCCCCCCcco...........',
      '.....oaAScCCvvvCCco...44o.....',
      '....oaASSAocCCCCCCo..o545o....',
      '....oaAAAAoLLLLLLLo..o545o....',
      '.....oaaaoLGLLLGLLo...o54o....',
      '......oooluUUUUUUlo...ohHo....',
      '........ouUVVVVVUuo...ohHo....',
      '........ouUVVVVVUuo...ooZo....',
      '......oLLo....oLLo....ooYo....',
      '.....oLGo......oLGo...ooXo....',
      '....oLLo........oLLo...o......',
      '....oLGo........oLGo..........',
      '....oooo........oooo..........'
    ],
    [ // 3 — passing, both feet gathered under him
      '.......occCCCCCCcco...........',
      '.....oaAScCCvvvCCcoo44o.......',
      '....oaASSAocCCCCCCo545o.......',
      '....oaAAAAoLLLLLLLo545o.......',
      '.....oaaaoLGLLLGLLo54o........',
      '......oooluUUUUUUlohHo........',
      '........ouUVVVVVUuohHo........',
      '........ouUVVVVVUuooZo........',
      '.......oLLo.oLLo...oYo........',
      '.......oLGo.oLGo...oXo........',
      '.......oLLo.oLLo....o.........',
      '.......oooo.oooo..............',
      '..............................'
    ]
  ];

  // Rising: knees tucked, dagger arm thrown up.
  var BODY_JUMP = [
    '.......occCCCCCCcco..o44o.....',
    '.....oaAScCCvvvCCco.o545o.....',
    '....oaASSAocCCCCCCoo545o......',
    '....oaAAAAoLLLLLLLo54o........',
    '.....oaaaoLGLLLGLLohHo........',
    '......oooluUUUUUUlohHo........',
    '........ouUVVVVVUuooZo........',
    '......ooLLo.oLLoo..oYo........',
    '.....oLGGo...oLGGo.oXo........',
    '.....oLLo.....oLLo..o.........',
    '.....oooo.....oooo............',
    '..............................',
    '..............................'
  ];

  // Falling: legs trailing, arm flung wide for balance.
  var BODY_FALL = [
    '.......occCCCCCCcco...........',
    '.....oaAScCCvvvCCco44o........',
    '....oaASSAocCCCCCCo545o.......',
    '....oaAAAAoLLLLLLLoo545o......',
    '.....oaaaoLGLLLGLLo.o54o......',
    '......oooluUUUUUUlo..ohHo.....',
    '........ouUVVVVVUuo..ohHo.....',
    '........ouUVVVVVUuo...oZo.....',
    '........oLLo.oLLo.....oYo.....',
    '.......oLGo...oLGo....oXo.....',
    '......oLLo.....oLLo....o......',
    '.....oLGo.......oLGo..........',
    '.....oooo.......oooo..........'
  ];

  /* Three-frame stab: cocked, thrust, recovery. The dagger is short, so the
   * frames lean on the arm and the torso lunge to sell the reach. */
  var BODY_SWING = [
    [ // 0 — cocked back behind the shoulder
      '.......occCCCCCCcco...........',
      'o44o.oaAScCCvvvCCco...........',
      'o545oaASSAocCCCCCCo...........',
      'o545oaAAAAoLLLLLLLo...........',
      'o54o.oaaaoLGLLLGLLo...........',
      'ohHo..oooluUUUUUUlo...........',
      'ohHo....ouUVVVVVUuo...........',
      'oZo.....ouUVVVVVUuo...........',
      'oYo.....ouUVVVVVUuo...........',
      'oXo.....oLLo.oLLo.............',
      '.o......oLGo.oLGo.............',
      '........oLLo.oLLo.............',
      '........oooo.oooo.............'
    ],
    [ // 1 — the thrust, arm and blade fully extended
      '.......occCCCCCCcco...........',
      '.....oaAScCCvvvCCco...........',
      '....oaASSAocCCCCCCoooooooooo..',
      '....oaAAAAoLLLLLLo4454hHXYZZo.',
      '.....oaaaoLGLLLGLoooooooooooo.',
      '......oooluUUUUUUlo...........',
      '........ouUVVVVVUuo...........',
      '........ouUVVVVVUuo...........',
      '......oLLo....oLLo............',
      '.....oLGo......oLGo...........',
      '.....oLLo......oLLo...........',
      '.....oLGo......oLGo...........',
      '.....oooo......oooo...........'
    ],
    [ // 2 — recovery, blade dropped low
      '.......occCCCCCCcco...........',
      '.....oaAScCCvvvCCco...........',
      '....oaASSAocCCCCCCo44o........',
      '....oaAAAAoLLLLLLLo545o.......',
      '.....oaaaoLGLLLGLLo545o.......',
      '......oooluUUUUUUlo.o54o......',
      '........ouUVVVVVUuo.ohHo......',
      '........ouUVVVVVUuo..ohHo.....',
      '........ouUVVVVVUuo..ooZo.....',
      '........oLLo.oLLo....ooYo.....',
      '........oLGo.oLGo.....oXo.....',
      '........oLLo.oLLo......o......',
      '........oooo.oooo.............'
    ]
  ];

  // Down-stab: both hands on the hilt, blade under the boots. The pogo.
  var BODY_STAB = [
    '.......occCCCCCCcco...........',
    '.....oaAScCCvvvCCco...........',
    '....oaASSAocCCCCCCo...........',
    '....oaAAAAoLLLLLLLo...........',
    '.....o44aoLGLLLGLo44o.........',
    '.....o545luUUUUUUl545o........',
    '......o54ouUVVVVVUo54o........',
    '.....oLLoohHHHHHhoooLLo.......',
    '.....oLGo.ohHHHho..oLGo.......',
    '.....oooo..oZZZo...oooo.......',
    '...........oYYo...............',
    '...........oXXo...............',
    '............oo................'
  ];

  // Hurt: recoiled, both arms up, dagger flung wide.
  var BODY_HURT = [
    'o44o...occCCCCCCcco...o44o....',
    'o545oaAScCCvvvCCco....o545o...',
    'o545oASSAocCCCCCCo.....o54o...',
    'o54o.aAAAoLLLLLLLo.....ohHo...',
    'ohHo.oaaaoLGLLLGLLo....ohHo...',
    'ohHo..oooluUUUUUUlo.....oZo...',
    'oZo.....ouUVVVVVUuo.....oYo...',
    '.o......ouUVVVVVUuo.....oXo...',
    '......oLLo....oLLo.......o....',
    '.....oLGo......oLGo...........',
    '....oLLo........oLLo..........',
    '....oLGo........oLGo..........',
    '....oooo........oooo..........'
  ];

  // Assembles one frame: head at `headDy`, body always at BODY_Y.
  function bobFrame(body, headDy, head) {
    return compose(BOB_W, BOB_H, [
      { rows: head || BOB_HEAD, dx: 0, dy: headDy || 0, name: 'bob-head' },
      { rows: body, dx: 0, dy: BODY_Y, name: 'bob-body' }
    ]);
  }

  /* ---------- gremlin: Bob-sized, and considerably less friendly ----------
   * From the monster sheet: a shaggy green ball of fur standing on two
   * clawed feet, with ears far bigger than its head lined in salmon, white
   * almond eyes under heavy brows, and a mouth of crooked teeth. The fur
   * silhouette is deliberately ragged — every edge alternates between two
   * greens rather than sitting on a clean outline, which is what separates
   * "fur" from "green blob" at this size.
   */
  var GREMLIN = [
    [ // 0 — standing, weight on the left foot
      'oo........................oo',
      'o7o......................o7o',
      'o7po....................op7o',
      'o7pPo..................oPp7o',
      'o7pPPo...ooooooo......oPPp7o',
      'o7pPPPo.oo55555oo....oPPPp7o',
      '.o7pPPPo5566666550..oPPPp7o.',
      '.o7pPPPo566666666o.oPPPp7o..',
      '..o7pPPo6666666666oPPPp7o...',
      '..o7pPPo6656666566oPPp7o....',
      '...o7pPo5555555555oPp7o.....',
      '....o75o55eeo5oee55o57o.....',
      '.....o5o5eEbo5obEe5o5o......',
      '.....o55o5eeon5nee5o55o.....',
      '......o5555ottttto5555o.....',
      '.......o555ttottto555o......',
      '........o5544444455o........',
      '.......o344444444443o.......',
      '......o33444444444433o......',
      '......o2334444444433o.......',
      '.......o2334444443320.......',
      '.......o22333333322o........',
      '........o112222211o.........',
      '.......oqqo....oqqo.........',
      '.......oooo....oooo.........'
    ],
    [ // 1 — hunched forward mid-step, ears back
      '..........................',
      'oo......................oo',
      'o7o....................o7o',
      'o7po..................op7o',
      'o7pPo...ooooooo......oPp7o',
      'o7pPPo.oo55555oo....oPPp7o',
      'o7pPPPo5566666550..oPPPp7o',
      '.o7pPPo566666666o.oPPPp7o.',
      '.o7pPPo6666666666oPPPp7o..',
      '..o7pPo6656666566oPPp7o...',
      '..o7pPo5555555555oPp7o....',
      '...o75o5eeo55oee5o57o.....',
      '....o5o5eEbo5obEe5o5o.....',
      '....o55o5eeon5nee5o55o....',
      '.....o5555ottttto5555o....',
      '......o555ttottto555o.....',
      '.......o5544444455o.......',
      '......o344444444443o......',
      '.....o33444444444433o.....',
      '.....o233444444444330.....',
      '......o23344444433320.....',
      '......o223333333322o......',
      '.......o11222222110o......',
      '.....oqqo........oqqo.....',
      '.....oooo........oooo.....'
    ]
  ];

  /* ---------- cave crawler: 20x12, two frames of a hunching walk --------- */
  var GRUB = [
    [
      '....................',
      '.......oooooo.......',
      '.....oo344443oo.....',
      '....o3455665543o....',
      '..oo34g5666g5443oo..',
      '.o3445666666544543o.',
      'o2334455666554433320',
      'o1223344555443332210',
      '.o1223oo3443oo32210.',
      '..ooo....oo....ooo..',
      '...o1o..o11o..o1o...',
      '...ooo..oooo..ooo...'
    ],
    [
      '....................',
      '....................',
      '.......oooooo.......',
      '.....oo344443oo.....',
      '....o3455665543o....',
      '..oo34g5666g5443oo..',
      '.o3445666666544543o.',
      'o2334455666554433320',
      'o1223344555443332210',
      '.oo123oo3443oo321oo.',
      '..o1oo..o11o..oo1o..',
      '..oooo..oooo..oooo..'
    ]
  ];

  /* ---------- glowbat: 22x14, wings up / wings down --------------------- */
  var BAT = [
    [ // wings up
      'oo................oo',
      'o44oo..........oo44o',
      'o3445oo......oo5443o',
      '.o23445oo..oo544320.',
      '..o122344oo443221o..',
      '...oo1223oo3221oo...',
      '.....oo34455430o....',
      '......o3e55e43o.....',
      '.....o345665430.....',
      '.....o34566543o.....',
      '......o3455430......',
      '.......o3443o.......',
      '........o22o........',
      '.........oo.........'
    ],
    [ // wings down
      '....................',
      '.......oooooo.......',
      '......o345543o......',
      '.....o3e5665e3o.....',
      '.....o345665430.....',
      '......o34554430.....',
      '.oo....o34443o....oo',
      'o44oo...o333o...oo44',
      'o3445oo.o22o..oo5443',
      '.o234455oooo554432o.',
      '..o12233445443221o..',
      '...oo112233221oo....',
      '.....ooo1221ooo.....',
      '........oooo........'
    ]
  ];

  /* ---------- sporepod: 20x18, shut and mid-spit ------------------------ */
  var POD = [
    [ // closed
      '.......oooo.........',
      '......o3445o........',
      '.....o345665o.......',
      '....o34566654o......',
      '...o3455666554o.....',
      '...o345g666g543o....',
      '..o34556666655430...',
      '..o3455666666543o...',
      '..o3445566665443o...',
      '..o33445555444330...',
      '...o3344444433330...',
      '...oo333333333oo....',
      '.....o22222220......',
      '.....o11111110......',
      '....oo1111111oo.....',
      '...o11ooooooo11o....',
      '...o1oo.....oo1o....',
      '...ooo.......ooo....'
    ],
    [ // open, about to spit — the mouth is the tell
      '.......oooo.........',
      '......o3445o........',
      '.....o345665o.......',
      '....o34566654o......',
      '...o3455666554o.....',
      '...o34oooooo543o....',
      '..o34oeEEEeo5430....',
      '..o345oppppo543o....',
      '..o3445oooo65443o...',
      '..o33445555444330...',
      '...o3344444433330...',
      '...oo333333333oo....',
      '.....o22222220......',
      '.....o11111110......',
      '....oo1111111oo.....',
      '...o11ooooooo11o....',
      '...o1oo.....oo1o....',
      '...ooo.......ooo....'
    ]
  ];

  /* ---------- bounce shroom: 20x14, resting and squashed ---------------- */
  var SHROOM = [
    [
      '.....oooooooo.......',
      '...oo34555543oo.....',
      '..o3456666665430....',
      '.o345666666665430...',
      'o34566r6666r665430..',
      'o2445666666665544320',
      'o1233445555443332210',
      '.oo1122333221100oo..',
      '....ooSSTTSSoo......',
      '.....oSSTTSSo.......',
      '.....oSSTTSSo.......',
      '.....osSTTSso.......',
      '....oossSSsoo.......',
      '....oooooooooo......'
    ],
    [ // compressed under Bob's boots
      '....................',
      '....................',
      '...oooooooooooo.....',
      '.oo3455666554330o...',
      'o345666666666654320.',
      'o2345666r66r6654430o',
      'o1233445555554433210',
      '.oo11223333221100oo.',
      '.....ooSSTTSSoo.....',
      '.....oSSTTTTSSo.....',
      '.....osSTTTTSso.....',
      '....oossSSSSsoo.....',
      '....oooooooooooo....',
      '....................'
    ]
  ];

  /* ---------- pickups --------------------------------------------------- */
  var HEART = [
    '..oooo..oooo..',
    '.o4556oo6554o.',
    'o455666oo66540',
    'o35566666665430',
    'o3455666666543o',
    '.o34556666543o.',
    '..o334555433o..',
    '...o33444330...',
    '....o33333o....',
    '.....o333o.....',
    '......ooo......'
  ];

  /* ---------- power-ups -------------------------------------------------- */
  var PAL_SHIELD = {
    o: '#0a1020',
    1: '#16305c', 2: '#22488a', 3: '#3166b8', 4: '#4a8ade', 5: '#7db4f2', 6: '#cfe6ff',
    S: '#5c6a7d', W: '#b9c8da', X: '#f2f8ff'
  };

  var SHIELD = [
    '..ooooooooo..',
    '.oXWWWWWWWXo.',
    'oXW3333333WXo',
    'oW344444443Wo',
    'oW345555543Wo',
    'oW345666543Wo',
    'oW345555543Wo',
    'oW344444443Wo',
    '.oW33333333Wo',
    '.oXWW2222WWXo',
    '..oXWW22WWXo.',
    '...oXWWWWXo..',
    '....oXWWXo...',
    '.....oooo....'
  ];

  // Keen edge: the dagger, re-forged. Deliberately reads as a blade at 11px.
  var PAL_KEEN = {
    o: '#0d1018',
    x: '#2f3945', X: '#6b7b8c', Y: '#b6c6d6', Z: '#eef6ff',
    h: '#3a2010', H: '#6b3c1c', g: '#ffd23f', G: '#fff4c0'
  };

  var KEEN = [
    '.....o.....',
    '....oZo....',
    '...oZZZo...',
    '...oZYZo...',
    '...oZYZo...',
    '...oZYZo...',
    '...oXYXo...',
    '..oXYYYXo..',
    '.gHHHHHHHg.',
    'G.oHHHHHo.G',
    '...oHHHo...',
    '...oHHHo...',
    '...oHHHo...',
    '....ooo....'
  ];

  /* ---------- tiles: 16x16 ---------------------------------------------- *
   * Rock is authored in two variants plus a lit-crust top so long walls do
   * not tile visibly. The crust (`t`/`T`) and moss (`g`/`G`) are what make
   * the cavern read as lit from within rather than merely dark.
   */
  var TILE_TOP = [
    [
      'GgTTtTTgGTTtTTgG',
      'tTTtt4tTTt4ttTTt',
      '2t4543t2453t42t3',
      '1234454322344532',
      '1223344321233442',
      '1122334211223341',
      '0112233111122331',
      '0112223110112231',
      '0011222100112221',
      '0011122100011221',
      '0001122100011121',
      '0001112100011121',
      '0000112100001121',
      '0000111100001112',
      '0000111000001112',
      '0000011000000111'
    ],
    [
      'gGTtTTTgtTTtTGgT',
      'Tt4tTt3tt4tTTt2t',
      '3t2453t42t45432t',
      '2334452312344512',
      '1223442211233441',
      '1122331211223321',
      '1112231110122331',
      '0112221100112221',
      '0011221100011221',
      '0011121000011211',
      '0001121000011211',
      '0001112000001121',
      '0000112000001112',
      '0000111000001111',
      '0000110000000111',
      '0000110000000011'
    ]
  ];

  var TILE_FILL = [
    [
      '0011122100011221',
      '0001122100011121',
      '0001112100011121',
      '0000112100001121',
      '0000111100001112',
      '0100111000001112',
      '0010011000010111',
      '0001001000011011',
      '0000110001001101',
      '0000111000101110',
      '0001111000011110',
      '0011121000011210',
      '0011221000012210',
      '0001121000011210',
      '0000112000001120',
      '0000011000000110'
    ],
    [
      '0001121000011211',
      '0001112000001121',
      '0000112000001112',
      '0000111000001111',
      '0000110001000111',
      '0001110010100110',
      '0011210001010110',
      '0012210000101110',
      '0011210000011210',
      '0001110000012210',
      '0000110000011210',
      '0000111000001110',
      '0001121000001110',
      '0001121000011210',
      '0000112000011210',
      '0000011000001100'
    ]
  ];

  // Ceiling rock: the crust runs along the bottom edge instead.
  var TILE_ROOF = [
    '0000011000000110',
    '0000111000001110',
    '0001112000011210',
    '0011122000112210',
    '0111222001122210',
    '0112223011222310',
    '1122334112233421',
    '1223344122334431',
    '1233445223344532',
    '2334455233445542',
    '2344554334455432',
    '3445543445554323',
    '345t4tt45t4t4332',
    'tTtTTtTtTTtTtTTt',
    'GgTTtTTgGTTtTTgG',
    '.g.G..g...G..g..'
  ];

  var TILE_SPIKE = [
    '................',
    '...o.......o....',
    '..o5o.....o5o...',
    '..o5o..o..o5o...',
    '.o455o.o..o554o.',
    '.o455oo5oo554o..',
    '.o3445o5o44530..',
    'o34456o5o654430.',
    'o2344563654433o.',
    'o1233455554332o.',
    'o1223344443221o.',
    'o1122333322110o.',
    'o0112222211000o.',
    'oo011111110000o.',
    '.oo0000000000oo.',
    '..oooooooooooo..'
  ];

  var TILE_SPIKE_DOWN = [
    '..oooooooooooo..',
    '.oo0000000000oo.',
    'oo011111110000o.',
    'o0112222211000o.',
    'o1122333322110o.',
    'o1223344443221o.',
    'o1233455554332o.',
    'o2344563654433o.',
    'o34456o5o654430.',
    '.o3445o5o44530..',
    '.o455oo5oo554o..',
    '.o455o.o..o554o.',
    '..o5o..o..o5o...',
    '..o5o.....o5o...',
    '...o.......o....',
    '................'
  ];

  // Fungal shelf: a one-way platform, only six pixels deep.
  var TILE_SHELF = [
    '..gooooooooog...',
    '.o34566665443o..',
    'o3456666665543o.',
    'o2345555554432o.',
    'o1123333322110o.',
    '.oo111111111oo..',
    '..o.o.....o.o...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ];

  /* ---------- bitmap font: 5x7 ------------------------------------------ */
  var FONT_W = 5, FONT_H = 7;
  var FONT_SRC = {
    A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
    B: '####./#...#/#...#/####./#...#/#...#/####.',
    C: '.###./#...#/#..../#..../#..../#...#/.###.',
    D: '####./#...#/#...#/#...#/#...#/#...#/####.',
    E: '#####/#..../#..../####./#..../#..../#####',
    F: '#####/#..../#..../####./#..../#..../#....',
    G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
    H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    I: '#####/..#../..#../..#../..#../..#../#####',
    J: '..###/...#./...#./...#./...#./#..#./.##..',
    K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    L: '#..../#..../#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
    O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    P: '####./#...#/#...#/####./#..../#..../#....',
    Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    R: '####./#...#/#...#/####./#.#../#..#./#...#',
    S: '.####/#..../#..../.###./....#/....#/####.',
    T: '#####/..#../..#../..#../..#../..#../..#..',
    U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
    X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
    Z: '#####/....#/...#./..#../.#.../#..../#####',
    '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    '1': '..#../.##../..#../..#../..#../..#../.###.',
    '2': '.###./#...#/....#/...#./..#../.#.../#####',
    '3': '#####/...#./..##./....#/....#/#...#/.###.',
    '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
    '5': '#####/#..../####./....#/....#/#...#/.###.',
    '6': '..##./.#.../#..../####./#...#/#...#/.###.',
    '7': '#####/....#/...#./..#../.#.../.#.../.#...',
    '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
    '9': '.###./#...#/#...#/.####/....#/...#./.##..',
    ' ': '...../...../...../...../...../...../.....',
    '.': '...../...../...../...../...../..##./..##.',
    ',': '...../...../...../...../..##./..##./.#...',
    '!': '..#../..#../..#../..#../..#../...../..#..',
    '?': '.###./#...#/....#/...#./..#../...../..#..',
    '-': '...../...../...../#####/...../...../.....',
    ':': '...../..##./..##./...../..##./..##./.....',
    ';': '...../..##./..##./...../..##./..##./.#...',
    "'": '..#../..#../...../...../...../...../.....',
    '"': '.#.#./.#.#./...../...../...../...../.....',
    '/': '....#/...#./...#./..#../.#.../.#.../#....',
    '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
    ')': '.#.../..#../...#./...#./...#./..#../.#...',
    '+': '...../..#../..#../#####/..#../..#../.....',
    '*': '...../.#.#./..#../#####/..#../.#.#./.....',
    '<': '...#./..#../.#.../#..../.#.../..#../...#.',
    '>': '.#.../..#../...#./....#/...#./..#../.#...',
    '=': '...../...../#####/...../#####/...../.....',
    '%': '#...#/...#./..#../..#../.#.../#...#/....#',
    '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
    '#': '.#.#./#####/.#.#./.#.#./#####/.#.#./.....',
    '_': '...../...../...../...../...../...../#####'
  };

  var FONT = {};
  (function buildFont() {
    for (var ch in FONT_SRC) {
      var rows = FONT_SRC[ch].split('/');
      var mask = [];
      for (var y = 0; y < FONT_H; y++) {
        var row = rows[y] || '.....';
        for (var x = 0; x < FONT_W; x++) mask.push(row.charAt(x) === '#');
      }
      FONT[ch] = mask;
    }
  })();

  function textWidth(str, scale) {
    scale = scale || 1;
    return String(str).length * (FONT_W + 1) * scale - scale;
  }

  function drawText(ctx, str, x, y, colour, scale) {
    scale = scale || 1;
    ctx.fillStyle = colour || '#ffffff';
    str = String(str).toUpperCase();
    var cx = Math.round(x), by = Math.round(y);
    for (var i = 0; i < str.length; i++) {
      var mask = FONT[str.charAt(i)];
      if (mask) {
        for (var p = 0; p < mask.length; p++) {
          if (!mask[p]) continue;
          ctx.fillRect(cx + (p % FONT_W) * scale, by + Math.floor(p / FONT_W) * scale, scale, scale);
        }
      }
      cx += (FONT_W + 1) * scale;
    }
  }

  function drawTextCentred(ctx, str, cx, y, colour, scale) {
    drawText(ctx, str, cx - textWidth(str, scale) / 2, y, colour, scale);
  }

  // Text with a hard 1px drop shadow — cheap, and it keeps HUD readable
  // against the busy parallax without needing a panel behind it.
  function drawTextShadow(ctx, str, x, y, colour, scale, shadow) {
    scale = scale || 1;
    drawText(ctx, str, x + scale, y + scale, shadow || '#05030c', scale);
    drawText(ctx, str, x, y, colour, scale);
  }

  function drawTextCentredShadow(ctx, str, cx, y, colour, scale, shadow) {
    drawTextShadow(ctx, str, cx - textWidth(str, scale || 1) / 2, y, colour, scale, shadow);
  }

  /* ---------- build ------------------------------------------------------ */
  var built = null;

  function build() {
    if (built) return built;

    // Idle is a one-pixel head bob rather than a redrawn body: on a head this
    // large, that single pixel is the whole breathing animation.
    var bobIdle = [
      frame(bobFrame(BODY_IDLE, 0), PAL_BOB, 'bob-idle0'),
      frame(bobFrame(BODY_IDLE, 1), PAL_BOB, 'bob-idle1')
    ];

    var bobRun = [];
    for (var ri = 0; ri < BODY_RUN.length; ri++) {
      // Contact frames sit a pixel lower than the passing frames, which is
      // what gives the cycle its bounce.
      var drop = (ri % 2 === 0) ? 1 : 0;
      bobRun.push(frame(bobFrame(BODY_RUN[ri], drop), PAL_BOB, 'bob-run' + ri));
    }

    var bobSwing = [];
    for (var si = 0; si < BODY_SWING.length; si++) {
      bobSwing.push(frame(bobFrame(BODY_SWING[si], si === 1 ? 1 : 0), PAL_BOB, 'bob-swing' + si));
    }

    built = {
      bob: {
        idle: bobIdle,
        run: bobRun,
        jump: [frame(bobFrame(BODY_JUMP, -1), PAL_BOB, 'bob-jump')],
        fall: [frame(bobFrame(BODY_FALL, 1), PAL_BOB, 'bob-fall')],
        swing: bobSwing,
        stab: [frame(bobFrame(BODY_STAB, 0), PAL_BOB, 'bob-stab')],
        hurt: [frame(bobFrame(BODY_HURT, 1, BOB_HEAD_HURT), PAL_BOB, 'bob-hurt')]
      },
      gremlin: frames(GREMLIN, PAL_GREM, 'gremlin'),
      grub: frames(GRUB, PAL_GRUB, 'grub'),
      bat: frames(BAT, PAL_BAT, 'bat'),
      pod: frames(POD, PAL_POD, 'pod'),
      shroom: frames(SHROOM, PAL_SHROOM, 'shroom'),
      heart: frame(HEART, PAL_HEART, 'heart'),
      lifeHeart: frame(HEART, PAL_LIFE, 'life-heart'),
      shield: frame(SHIELD, PAL_SHIELD, 'shield'),
      keen: frame(KEEN, PAL_KEEN, 'keen'),
      tile: {
        top: [make(TILE_TOP[0], PAL_ROCK, 'top0'), make(TILE_TOP[1], PAL_ROCK, 'top1')],
        fill: [make(TILE_FILL[0], PAL_ROCK, 'fill0'), make(TILE_FILL[1], PAL_ROCK, 'fill1')],
        roof: make(TILE_ROOF, PAL_ROCK, 'roof'),
        spike: make(TILE_SPIKE, PAL_SPIKE, 'spike'),
        spikeDown: make(TILE_SPIKE_DOWN, PAL_SPIKE, 'spikeDown'),
        shelf: make(TILE_SHELF, PAL_SHELF, 'shelf')
      }
    };

    built.flash = {
      gremlin: flashOf(built.gremlin, '#ffffff'),
      grub: flashOf(built.grub, '#ffffff'),
      bat: flashOf(built.bat, '#ffffff'),
      pod: flashOf(built.pod, '#ffffff')
    };

    return built;
  }


  /* ---------- optional PNG overrides -------------------------------------
   * The character grids above are hand-authored and will only ever be an
   * approximation of a real model sheet. This is the escape hatch: drop a
   * PNG into art/ using the names below and it replaces the built-in art at
   * boot, with no code change. A missing file is not an error — the grid art
   * simply stays.
   *
   * Convention for every sheet:
   *   - one horizontal strip of N equal-width frames, N given below
   *   - authored FACING RIGHT (the left-facing copy is generated by mirroring)
   *   - transparent background
   *   - the character's FEET on the bottom row of the strip, since frames are
   *     anchored by their centre and bottom-aligned to the hitbox
   *   - any pixel size; taller art simply overhangs the hitbox, which is what
   *     already happens with Bob's head
   */
  var OVERRIDES = [
    { path: 'art/bob-idle.png',  n: 2, set: function (b, f) { b.bob.idle = f; } },
    { path: 'art/bob-run.png',   n: 4, set: function (b, f) { b.bob.run = f; } },
    { path: 'art/bob-jump.png',  n: 1, set: function (b, f) { b.bob.jump = f; } },
    { path: 'art/bob-fall.png',  n: 1, set: function (b, f) { b.bob.fall = f; } },
    { path: 'art/bob-swing.png', n: 3, set: function (b, f) { b.bob.swing = f; } },
    { path: 'art/bob-stab.png',  n: 1, set: function (b, f) { b.bob.stab = f; } },
    { path: 'art/bob-hurt.png',  n: 1, set: function (b, f) { b.bob.hurt = f; } },
    { path: 'art/gremlin.png',   n: 2, set: function (b, f) {
        b.gremlin = f; b.flash.gremlin = flashOf(f, '#ffffff'); } },
    { path: 'art/grub.png',      n: 2, set: function (b, f) {
        b.grub = f; b.flash.grub = flashOf(f, '#ffffff'); } },
    { path: 'art/bat.png',       n: 2, set: function (b, f) {
        b.bat = f; b.flash.bat = flashOf(f, '#ffffff'); } },
    { path: 'art/pod.png',       n: 2, set: function (b, f) {
        b.pod = f; b.flash.pod = flashOf(f, '#ffffff'); } },
    { path: 'art/shroom.png',    n: 2, set: function (b, f) { b.shroom = f; } }
  ];

  // Slices a loaded strip into frames, generating the mirrored facing for each.
  function sliceStrip(img, n) {
    var fw = Math.floor(img.width / n), fh = img.height, out = [];
    for (var i = 0; i < n; i++) {
      var c = newCanvas(fw, fh);
      var g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, i * fw, 0, fw, fh, 0, 0, fw, fh);
      out.push({ r: c, l: flip(c), w: fw, h: fh });
    }
    return out;
  }

  /* Loads any PNG overrides listed in art/manifest.json.
   *
   * The manifest is what makes this opt-in. Probing for all twelve sheets
   * unconditionally meant twelve 404s in the console on every single load of
   * a game that ships with no art/ folder at all. Now a project with no
   * overrides costs exactly one failed request, and the manifest is also the
   * record of which sheets are live.
   *
   * Format — a plain array of the filenames you have added:
   *   ["bob-idle.png", "gremlin.png"]
   *
   * Loading is fire-and-forget: the game boots on grid art immediately and
   * swaps each sheet in as it arrives, so slow art never blocks the game. */
  function loadOverrides(done) {
    var b = build();
    var loaded = [];

    fetch('art/manifest.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (list) {
        if (!list || !list.length) { if (done) done(loaded); return; }
        var wanted = OVERRIDES.filter(function (o) {
          return list.indexOf(o.path.replace('art/', '')) >= 0;
        });
        if (!wanted.length) { if (done) done(loaded); return; }
        loadSheets(b, wanted, loaded, done);
      })
      .catch(function () { if (done) done(loaded); });
  }

  function loadSheets(b, list, loaded, done) {
    var pending = list.length;
    list.forEach(function (o) {
      var img = new Image();
      img.onload = function () {
        try {
          if (img.width > 0 && img.height > 0) {
            o.set(b, sliceStrip(img, o.n));
            loaded.push(o.path);
          }
        } catch (e) {
          if (typeof console !== 'undefined') console.warn('override failed: ' + o.path, e);
        }
        if (--pending === 0 && done) done(loaded);
      };
      img.onerror = function () {
        if (typeof console !== 'undefined') console.warn('override listed but missing: ' + o.path);
        if (--pending === 0 && done) done(loaded);
      };
      img.src = o.path;
    });
  }

  /* ---------- draw helpers ---------------------------------------------- */
  // Frames are anchored by their centre so a sprite can grow without moving.
  function draw(ctx, f, x, y, faceLeft) {
    ctx.drawImage(faceLeft ? f.l : f.r, Math.round(x - f.w / 2), Math.round(y - f.h / 2));
  }

  global.PitArt = {
    build: build,
    loadOverrides: loadOverrides,
    draw: draw,
    make: make,
    flip: flip,
    tint: tint,
    FONT_H: FONT_H,
    FONT_W: FONT_W,
    textWidth: textWidth,
    drawText: drawText,
    drawTextCentred: drawTextCentred,
    drawTextShadow: drawTextShadow,
    drawTextCentredShadow: drawTextCentredShadow,
    RIM: RIM
  };
})(window);
