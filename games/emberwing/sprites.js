/* Emberwing — pixel art data, rotation baking, and bitmap font.
 * All art is authored here as character grids; nothing is loaded from disk.
 * Sprites are authored FACING UP (north) and baked into DIRS rotations at boot.
 */
(function (global) {
  'use strict';

  var DIRS = 16; // baked rotation steps

  /* ---------- palettes ---------------------------------------------------
   * Shared key meanings so one silhouette can be re-skinned per realm:
   *   o outline   d dark   m mid   l light
   *   w membrane shadow    W membrane lit    b wing leading edge
   *   h horn/bone/claw     e eye
   *
   * `b` is deliberately NOT bone-white: the leading edge runs the full
   * wingspan, so at a 90-degree rotation a white edge reads as a mast
   * stuck through the creature.
   */
  var PAL_DRAGON = {
    o: '#1b1008', d: '#7a4a15', m: '#c8922f', l: '#f2cf72',
    w: '#8f4a17', W: '#d98a33', b: '#f0b45c', h: '#f6ecc8', e: '#e8341f'
  };
  /* Enemy palettes run deliberately BRIGHTER than their realm sky. Every sky
   * here is dark-to-mid, so high-value creatures stay readable against it —
   * matching an enemy's hue to its backdrop turns the game into camouflage. */
  var PAL_ASH = {
    o: '#1a0a06', d: '#8a2f12', m: '#e2621f', l: '#ffb454',
    w: '#a83c16', W: '#ff8a3c', b: '#ffb877', h: '#fff0c8', e: '#3ef2ff'
  };
  var PAL_RIME = {
    o: '#04101c', d: '#2a6a96', m: '#5fb3dd', l: '#d6f2ff',
    w: '#3a7fa8', W: '#8ed6f5', b: '#bfe9ff', h: '#ffffff', e: '#ffd23f'
  };
  var PAL_STORM = {
    o: '#0d0518', d: '#5a34a0', m: '#9a63e8', l: '#e0c8ff',
    w: '#6b3fb5', W: '#b48af0', b: '#cfaef7', h: '#ffffff', e: '#7dfcff'
  };
  var PAL_VOID = {
    o: '#000000', d: '#4a4d63', m: '#8a8fa8', l: '#dfe3f2',
    w: '#5b6078', W: '#a8adc4', b: '#c4c8dc', h: '#ffffff', e: '#ff2f6d'
  };

  /* Sparse grid builder: only the rows that contain art need to be written,
   * which keeps the wing frames aligned with the body they sit under. */
  function grid(w, h, rows) {
    var empty = new Array(w + 1).join('.');
    var out = [];
    for (var y = 0; y < h; y++) out.push(rows[y] == null ? empty : rows[y]);
    return out;
  }

  /* ---------- player dragon: 28x28, body and three flap frames ----------- */
  var DRAGON_BODY = grid(28, 28, [
    /*  0 */ '.............oo.............',
    /*  1 */ '............ollo............',
    /*  2 */ '............ommo............',
    /*  3 */ '...........omllmo...........',
    /*  4 */ '..........oemllmeo..........',
    /*  5 */ '..........ommmmmmo..........',
    /*  6 */ '.........hommmmmmoh.........',
    /*  7 */ '........hhommmmmmohh........',
    /*  8 */ '...........ommmmo...........',
    /*  9 */ '...........ommmmo...........',
    /* 10 */ '..........odmllmdo..........',
    /* 11 */ '..........odmllmdo..........',
    /* 12 */ '.........odmllllmdo.........',
    /* 13 */ '.........odmllllmdo.........',
    /* 14 */ '.........odmllllmdo.........',
    /* 15 */ '..........odmllmdo..........',
    /* 16 */ '..........odmmmmdo..........',
    /* 17 */ '.........hodmmmmdoh.........',
    /* 18 */ '...........ommmmo...........',
    /* 19 */ '............ommo............',
    /* 20 */ '............ommo............',
    /* 21 */ '............oddo............',
    /* 22 */ '............oddo............',
    /* 23 */ '...........hoddoh...........',
    /* 24 */ '............oddo............',
    /* 25 */ '.............oo.............'
  ]);

  var DRAGON_WINGS = [
    // 0 — mid stroke, fully spread
    grid(28, 28, {
      8: '.oo......................oo.',
      9: 'obbbbbbbbWWW....WWWbbbbbbbbo',
      10: 'oWWWWWWWWWWW....WWWWWWWWWWWo',
      11: '.oWWWWWWWWWW....WWWWWWWWWWo.',
      12: '..oWWWWWWWWW....WWWWWWWWWo..',
      13: '...owwwwwwww....wwwwwwwwo...',
      14: '....owwwwwww....wwwwwwwo....',
      15: '.....owwwwww....wwwwwwo.....',
      16: '......owwwww....wwwwwo......',
      17: '.......owwww....wwwwo.......',
      18: '........owww....wwwo........',
      19: '.........oww....wwo.........',
      20: '..........oo....oo..........'
    }),
    // 1 — upstroke: same span, chord foreshortened as the wing rises
    grid(28, 28, {
      6: '.oo......................oo.',
      7: 'obbbbbbbbWWW....WWWbbbbbbbbo',
      8: 'oWWWWWWWWWWW....WWWWWWWWWWWo',
      9: '.oWWWWWWWWWW....WWWWWWWWWWo.',
      10: '..owwwwwwwww....wwwwwwwwwo..',
      11: '...oowwwwwww....wwwwwwwoo...',
      12: '.....oowwwww....wwwwwoo.....',
      13: '.......ooooo....ooooo.......'
    }),
    // 2 — downstroke: full chord, swung below the shoulders
    grid(28, 28, {
      10: '.oo......................oo.',
      11: 'obbbbbbbbWWW....WWWbbbbbbbbo',
      12: 'oWWWWWWWWWWW....WWWWWWWWWWWo',
      13: '.oWWWWWWWWWW....WWWWWWWWWWo.',
      14: '..oWWWWWWWWW....WWWWWWWWWo..',
      15: '...owwwwwwww....wwwwwwwwo...',
      16: '....owwwwwww....wwwwwwwo....',
      17: '.....owwwwww....wwwwwwo.....',
      18: '......owwwww....wwwwwo......',
      19: '.......owwww....wwwwo.......',
      20: '........owww....wwwo........',
      21: '.........oww....wwo.........',
      22: '..........oo....oo..........'
    })
  ];

  /* ---------- enemy A: bat-winged wyvern, 18x18 -------------------------- */
  var WYVERN_BODY = grid(18, 18, [
    /*  0 */ '........oo........',
    /*  1 */ '.......ommo.......',
    /*  2 */ '......oemmeo......',
    /*  3 */ '......ommmmo......',
    /*  4 */ '......odmmdo......',
    /*  5 */ '.....odmllmdo.....',
    /*  6 */ '.....odmllmdo.....',
    /*  7 */ '.....odmllmdo.....',
    /*  8 */ '......odmmdo......',
    /*  9 */ '.......ommo.......',
    /* 10 */ '.......ommo.......',
    /* 11 */ '.......oddo.......',
    /* 12 */ '......hoddoh......',
    /* 13 */ '.......oddo.......',
    /* 14 */ '........oo........'
  ]);

  var WYVERN_WINGS = [
    grid(18, 18, {
      4: '.oo............oo.',
      5: 'obbbbbWW..WWbbbbbo',
      6: 'oWWWWWWW..WWWWWWWo',
      7: '.oWWWWWW..WWWWWWo.',
      8: '..owwwww..wwwwwo..',
      9: '...owwww..wwwwo...',
      10: '....owww..wwwo....',
      11: '.....oww..wwo.....',
      12: '......oo..oo......'
    }),
    grid(18, 18, {
      3: '.oo............oo.',
      4: 'obbbbbWW..WWbbbbbo',
      5: 'oWWWWWWW..WWWWWWWo',
      6: '.oowwwww..wwwwwoo.',
      7: '...ooooo..ooooo...'
    })
  ];

  /* ---------- enemy B: feathered raptor, 18x18 --------------------------- */
  var RAPTOR_BODY = grid(18, 18, [
    /*  0 */ '..................',
    /*  1 */ '........oo........',
    /*  2 */ '.......oeeo.......',
    /*  3 */ '.......ommo.......',
    /*  4 */ '......omllmo......',
    /*  5 */ '......ollllo......',
    /*  6 */ '......ollllo......',
    /*  7 */ '......omllmo......',
    /*  8 */ '......ommmmo......',
    /*  9 */ '.......ommo.......',
    /* 10 */ '.......ommo.......',
    /* 11 */ '......oddddo......',
    /* 12 */ '......od..do......',
    /* 13 */ '......oo..oo......'
  ]);

  var RAPTOR_WINGS = [
    grid(18, 18, {
      3: '.oo............oo.',
      4: 'obbbbbbW..Wbbbbbbo',
      5: 'oWWWWWWW..WWWWWWWo',
      6: 'oWWWWWWW..WWWWWWWo',
      7: '.owwwwww..wwwwwwo.',
      8: '..obobob..bobobo..',
      9: '...o.o.o..o.o.o...'
    }),
    grid(18, 18, {
      2: '.oo............oo.',
      3: 'obbbbbbW..Wbbbbbbo',
      4: 'oWWWWWWW..WWWWWWWo',
      5: '.owwwwww..wwwwwwo.',
      6: '..obobob..bobobo..'
    })
  ];

  /* ---------- boss: the sky leviathan, 30x32 ----------------------------- */
  var BOSS_BODY = grid(30, 32, [
    /*  0 */ '..............oo..............',
    /*  1 */ '.............ollo.............',
    /*  2 */ '............ommmmo............',
    /*  3 */ '...........ommmmmmo...........',
    /*  4 */ '..........oeemmmmeeo..........',
    /*  5 */ '..........ommmmmmmmo..........',
    /*  6 */ '........hhommmmmmmmohh........',
    /*  7 */ '.......hhhommmmmmmmohhh.......',
    /*  8 */ '..........ommmmmmmmo..........',
    /*  9 */ '.........odmmllllmmdo.........',
    /* 10 */ '........odmmllllllmmdo........',
    /* 11 */ '........odmllhhhhllmdo........',
    /* 12 */ '........odmlhhhhhhlmdo........',
    /* 13 */ '........odmlhheehhlmdo........',
    /* 14 */ '........odmlhhhhhhlmdo........',
    /* 15 */ '........odmlhhhhhhlmdo........',
    /* 16 */ '........odmllhhhhllmdo........',
    /* 17 */ '........odmmllllllmmdo........',
    /* 18 */ '.........odmmllllmmdo.........',
    /* 19 */ '..........ommmmmmmmo..........',
    /* 20 */ '..........ommmmmmmmo..........',
    /* 21 */ '.........hommmmmmmmoh.........',
    /* 22 */ '...........ommmmmmo...........',
    /* 23 */ '............ommmmo............',
    /* 24 */ '.............ommo.............',
    /* 25 */ '.............ommo.............',
    /* 26 */ '.............oddo.............',
    /* 27 */ '.............oddo.............',
    /* 28 */ '............hoddoh............',
    /* 29 */ '.............oddo.............',
    /* 30 */ '..............oo..............'
  ]);

  var BOSS_WINGS = [
    grid(30, 32, {
      6: '.oo........................oo.',
      7: 'obbbbbbbbbbWWWWWWWWbbbbbbbbbbo',
      8: 'oWWWWWWWWWWWWWWWWWWWWWWWWWWWWo',
      9: '.oWWWWWWWWWWWWWWWWWWWWWWWWWWo.',
      10: '..oWWWWWWWWWWWWWWWWWWWWWWWWo..',
      11: '...owwwwwwwwwwwwwwwwwwwwwwo...',
      12: '....owwwwwwwwwwwwwwwwwwwwo....',
      13: '.....owwwwwwwwwwwwwwwwwwo.....',
      14: '......owwwwwwwwwwwwwwwwo......',
      15: '.......owwwwwwwwwwwwwwo.......',
      16: '........owwwwwwwwwwwwo........',
      17: '.........owwwwwwwwwwo.........',
      18: '..........owwwwwwwwo..........',
      19: '...........owwwwwwo...........',
      20: '............owwwwo............',
      21: '.............oooo.............'
    }),
    grid(30, 32, {
      4: '.oo........................oo.',
      5: 'obbbbbbbbbbWWWWWWWWbbbbbbbbbbo',
      6: 'oWWWWWWWWWWWWWWWWWWWWWWWWWWWWo',
      7: '.oWWWWWWWWWWWWWWWWWWWWWWWWWWo.',
      8: '..owwwwwwwwwwwwwwwwwwwwwwwwo..',
      9: '...oowwwwwwwwwwwwwwwwwwwwoo...',
      10: '.....oowwwwwwwwwwwwwwwwoo.....',
      11: '.......oooowwwwwwwwoooo.......',
      12: '...........oooooooo...........'
    })
  ];

  /* ---------- hatchling pickup, 12x12, unrotated ------------------------- */
  var HATCHLING = grid(12, 12, [
    /*  0 */ '...h......h.',
    /*  1 */ '...ho....oh.',
    /*  2 */ '....ommmmo..',
    /*  3 */ '...omemmemo.',
    /*  4 */ '...ommmmmmo.',
    /*  5 */ '..oWmmmmmmWo',
    /*  6 */ '..oWmllllmWo',
    /*  7 */ '...ommmmmmo.',
    /*  8 */ '....odmmdo..',
    /*  9 */ '.....oddo...',
    /* 10 */ '....ho..oh..'
  ]);

  /* ---------- 5x7 bitmap font ------------------------------------------- */
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
    "'": '..#../..#../...../...../...../...../.....',
    '/': '....#/...#./...#./..#../.#.../.#.../#....',
    '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
    ')': '.#.../..#../...#./...#./...#./..#../.#...',
    '+': '...../..#../..#../#####/..#../..#../.....',
    '*': '...../.#.#./..#../#####/..#../.#.#./.....',
    '<': '...#./..#../.#.../#..../.#.../..#../...#.',
    '>': '.#.../..#../...#./....#/...#./..#../.#...',
    '=': '...../...../#####/...../#####/...../.....',
    '%': '#...#/...#./..#../..#../.#.../#...#/....#'
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

  /* ---------- grid -> pixel buffer -------------------------------------- */
  function hexToRgb(hex) {
    return [
      parseInt(hex.substr(1, 2), 16),
      parseInt(hex.substr(3, 2), 16),
      parseInt(hex.substr(5, 2), 16)
    ];
  }

  // Validates row widths so a mis-typed art row is loud rather than silent.
  function gridSize(rows, name) {
    var w = 0, i;
    for (i = 0; i < rows.length; i++) w = Math.max(w, rows[i].length);
    for (i = 0; i < rows.length; i++) {
      if (rows[i].length !== w && typeof console !== 'undefined') {
        console.warn('sprite "' + name + '" row ' + i + ' is ' +
          rows[i].length + ' wide, expected ' + w);
      }
    }
    return { w: w, h: rows.length };
  }

  function makeSprite(rows, pal, name) {
    var s = gridSize(rows, name || 'unnamed');
    var px = new Array(s.w * s.h);
    var cache = {};
    for (var y = 0; y < s.h; y++) {
      var row = rows[y];
      for (var x = 0; x < s.w; x++) {
        var ch = row.charAt(x);
        if (!ch || ch === '.' || ch === ' ') { px[y * s.w + x] = null; continue; }
        var hex = pal[ch];
        if (!hex) { px[y * s.w + x] = null; continue; }
        px[y * s.w + x] = cache[hex] || (cache[hex] = hexToRgb(hex));
      }
    }
    return { w: s.w, h: s.h, px: px };
  }

  // Layers `over` on top of `under`; both must be the same grid size.
  function overlay(under, over) {
    var px = under.px.slice();
    for (var i = 0; i < px.length; i++) if (over.px[i]) px[i] = over.px[i];
    return { w: under.w, h: under.h, px: px };
  }

  /* ---------- rotation baking ------------------------------------------ */
  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Nearest-neighbour inverse mapping: keeps hard pixel edges at every angle.
  function bake(sprite, steps) {
    var size = Math.ceil(Math.sqrt(sprite.w * sprite.w + sprite.h * sprite.h)) + 2;
    if (size % 2) size++;
    var half = size / 2, out = [];
    for (var i = 0; i < steps; i++) {
      var ang = i / steps * Math.PI * 2;
      var c = newCanvas(size, size);
      var ctx = c.getContext('2d');
      var img = ctx.createImageData(size, size);
      var d = img.data;
      var ca = Math.cos(-ang), sa = Math.sin(-ang);
      for (var y = 0; y < size; y++) {
        var dy = y - half + 0.5;
        for (var x = 0; x < size; x++) {
          var dx = x - half + 0.5;
          var sx = Math.floor(ca * dx - sa * dy + sprite.w / 2);
          var sy = Math.floor(sa * dx + ca * dy + sprite.h / 2);
          if (sx < 0 || sy < 0 || sx >= sprite.w || sy >= sprite.h) continue;
          var col = sprite.px[sy * sprite.w + sx];
          if (!col) continue;
          var o = (y * size + x) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      out.push(c);
    }
    return { frames: out, size: size };
  }

  // A solid-colour silhouette of a baked set, used for hit/freeze flashes.
  function bakeFlash(set, colour) {
    var out = [];
    for (var i = 0; i < set.frames.length; i++) {
      var src = set.frames[i];
      var c = newCanvas(src.width, src.height);
      var ctx = c.getContext('2d');
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, c.width, c.height);
      out.push(c);
    }
    return { frames: out, size: set.size };
  }

  /* ---------- built assets ---------------------------------------------- */
  var built = null;

  function buildFlyer(bodyRows, wingSets, pal, name) {
    var body = makeSprite(bodyRows, pal, name + ':body');
    var frames = [];
    for (var i = 0; i < wingSets.length; i++) {
      var wing = makeSprite(wingSets[i], pal, name + ':wing' + i);
      frames.push(bake(overlay(wing, body), DIRS));
    }
    return frames;
  }

  function flashAll(sets, colour) {
    var out = [];
    for (var i = 0; i < sets.length; i++) out.push(bakeFlash(sets[i], colour));
    return out;
  }

  var ICE = '#a9e6ff';

  function build() {
    if (built) return built;

    var dragon = buildFlyer(DRAGON_BODY, DRAGON_WINGS, PAL_DRAGON, 'dragon');
    var pals = { ash: PAL_ASH, rime: PAL_RIME, storm: PAL_STORM, vd: PAL_VOID };

    var enemy = { wyvern: {}, raptor: {} };
    var enemyFlash = { wyvern: {}, raptor: {} };
    var enemyIce = { wyvern: {}, raptor: {} };
    var boss = {}, bossFlash = {}, bossIce = {};

    for (var key in pals) {
      var w = buildFlyer(WYVERN_BODY, WYVERN_WINGS, pals[key], 'wyvern-' + key);
      var r = buildFlyer(RAPTOR_BODY, RAPTOR_WINGS, pals[key], 'raptor-' + key);
      var b = buildFlyer(BOSS_BODY, BOSS_WINGS, pals[key], 'boss-' + key);

      enemy.wyvern[key] = w;
      enemy.raptor[key] = r;
      boss[key] = b;

      enemyFlash.wyvern[key] = flashAll(w, '#ffffff');
      enemyFlash.raptor[key] = flashAll(r, '#ffffff');
      bossFlash[key] = flashAll(b, '#ffffff');

      enemyIce.wyvern[key] = flashAll(w, ICE);
      enemyIce.raptor[key] = flashAll(r, ICE);
      bossIce[key] = flashAll(b, ICE);
    }

    built = {
      DIRS: DIRS,
      dragon: dragon,
      dragonFlash: flashAll(dragon, '#ffffff'),
      enemy: enemy,
      enemyFlash: enemyFlash,
      enemyIce: enemyIce,
      boss: boss,
      bossFlash: bossFlash,
      bossIce: bossIce,
      hatchling: makeSprite(HATCHLING, PAL_DRAGON, 'hatchling')
    };
    return built;
  }

  /* ---------- draw helpers ---------------------------------------------- */
  // angle 0 = east; art is authored facing north, hence the +PI/2.
  function dirIndex(angle) {
    var t = (angle + Math.PI / 2) / (Math.PI * 2);
    var i = Math.round(t * DIRS) % DIRS;
    return i < 0 ? i + DIRS : i;
  }

  function drawSet(ctx, set, angle, x, y) {
    var f = set.frames[dirIndex(angle)];
    ctx.drawImage(f, Math.round(x - set.size / 2), Math.round(y - set.size / 2));
  }

  // Unrotated sprite blit, used for pickups and title art.
  function drawSprite(ctx, sprite, x, y) {
    if (!sprite._c) {
      var c = newCanvas(sprite.w, sprite.h);
      var cc = c.getContext('2d');
      var img = cc.createImageData(sprite.w, sprite.h);
      for (var i = 0; i < sprite.px.length; i++) {
        var col = sprite.px[i];
        if (!col) continue;
        img.data[i * 4] = col[0];
        img.data[i * 4 + 1] = col[1];
        img.data[i * 4 + 2] = col[2];
        img.data[i * 4 + 3] = 255;
      }
      cc.putImageData(img, 0, 0);
      sprite._c = c;
    }
    ctx.drawImage(sprite._c, Math.round(x - sprite.w / 2), Math.round(y - sprite.h / 2));
  }

  function textWidth(str, scale) {
    scale = scale || 1;
    return str.length * (FONT_W + 1) * scale - scale;
  }

  function drawText(ctx, str, x, y, colour, scale) {
    scale = scale || 1;
    ctx.fillStyle = colour || '#ffffff';
    str = String(str).toUpperCase();
    var cx = Math.round(x);
    for (var i = 0; i < str.length; i++) {
      var mask = FONT[str.charAt(i)];
      if (mask) {
        for (var p = 0; p < mask.length; p++) {
          if (!mask[p]) continue;
          ctx.fillRect(
            cx + (p % FONT_W) * scale,
            Math.round(y) + Math.floor(p / FONT_W) * scale,
            scale, scale
          );
        }
      }
      cx += (FONT_W + 1) * scale;
    }
  }

  function drawTextCentred(ctx, str, cx, y, colour, scale) {
    drawText(ctx, str, cx - textWidth(String(str).toUpperCase(), scale) / 2, y, colour, scale);
  }

  global.Art = {
    DIRS: DIRS,
    FONT_H: FONT_H,
    build: build,
    dirIndex: dirIndex,
    drawSet: drawSet,
    drawSprite: drawSprite,
    drawText: drawText,
    drawTextCentred: drawTextCentred,
    textWidth: textWidth,
    palettes: {
      dragon: PAL_DRAGON, ash: PAL_ASH, rime: PAL_RIME,
      storm: PAL_STORM, vd: PAL_VOID
    }
  };
})(window);
