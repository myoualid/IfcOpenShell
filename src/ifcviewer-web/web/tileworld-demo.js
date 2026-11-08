// This file was generated with the assistance of an AI coding tool.
//
// tileworld-demo.js: original demo content for the tile-world mode. A 256x256
// atlas of 16 px tiles painted procedurally in four shades per material, and a
// small town map built from it. Exposes TileWorldDemo.build().
//
// Every material uses four colours ordered by brightness, so the green and
// grey four-shade palettes in the blit pass recover the intended shading.
(function (global) {
  'use strict';

  const T = 16, AW = 256, AH = 256, PER_ROW = AW / T;

  // ---- Tile ids --------------------------------------------------------------
  const ID = {
    PLAYER: 0, NPC_A: 6, NPC_B: 12, NPC_C: 18, SHADOW: 24,
    GRASS: 32, TALL_BG: 33, TALL_FG: 34, PATH: 35, WATER: 36, /* 37 */ FLOWER: 38, /* 39 */
    LEDGE: 40, TREE_BASE: 41, TREE_TOP: 42, FENCE: 43, SIGN: 44,
    WALL: 45, WINDOW: 46, DOOR: 47, ROOF_LOW: 48, ROOF_TOP: 50,
    FLOOR: 52, WALL_IN: 53, TABLE: 54, MAT: 55, SHELF: 56, VOID: 57,
  };

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pal = (a, b, c, d) => [hex(a), hex(b), hex(c), hex(d)];  // lightest -> darkest
  const P = {
    grass:  pal('#c8f0a0', '#88c868', '#4a8a48', '#1e4a2a'),
    tall:   pal('#a8e080', '#68b050', '#357a3a', '#143820'),
    path:   pal('#f4e8c0', '#dcc898', '#a88c5c', '#5a4428'),
    water:  pal('#d0f0ff', '#78b8f0', '#3870c0', '#18306a'),
    flower: pal('#fff8f0', '#f89090', '#c84858', '#5a1828'),
    tree:   pal('#98d070', '#509848', '#2a6038', '#102818'),
    wood:   pal('#f0d0a0', '#c89060', '#885830', '#402010'),
    wall:   pal('#fbf6ea', '#d8ccb4', '#988870', '#40382c'),
    roof:   pal('#f8a088', '#d85848', '#902c30', '#40141c'),
    floor:  pal('#f0e0b8', '#d0b080', '#987848', '#483018'),
    void:   pal('#000000', '#000000', '#000000', '#000000'),
  };

  const buf = new Uint8ClampedArray(AW * AH * 4);

  function put(id, x, y, c) {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const ox = (id % PER_ROW) * T + x, oy = Math.floor(id / PER_ROW) * T + y;
    const i = (oy * AW + ox) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  }
  function alphaAt(id, x, y) {
    if (x < 0 || y < 0 || x >= T || y >= T) return 0;
    const ox = (id % PER_ROW) * T + x, oy = Math.floor(id / PER_ROW) * T + y;
    return buf[(oy * AW + ox) * 4 + 3];
  }
  function rect(id, x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(id, i, j, c);
  }
  function fill(id, c) { rect(id, 0, 0, T, T, c); }
  function copy(src, dst) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const so = ((Math.floor(src / PER_ROW) * T + y) * AW + (src % PER_ROW) * T + x) * 4;
      const d = ((Math.floor(dst / PER_ROW) * T + y) * AW + (dst % PER_ROW) * T + x) * 4;
      for (let k = 0; k < 4; k++) buf[d + k] = buf[so + k];
    }
  }
  // Deterministic speckle so tiles tile seamlessly and identically every run.
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  // 1 px outline in `c` around every opaque pixel, inside the tile.
  function outline(id, c) {
    const edge = [];
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      if (alphaAt(id, x, y)) continue;
      if (alphaAt(id, x - 1, y) || alphaAt(id, x + 1, y) || alphaAt(id, x, y - 1) || alphaAt(id, x, y + 1))
        edge.push([x, y]);
    }
    for (const [x, y] of edge) put(id, x, y, c);
  }

  // ---- Terrain ---------------------------------------------------------------
  function grass(id) {
    const g = P.grass;
    fill(id, g[0]);
    for (const [x, y] of [[2, 3], [10, 1], [6, 9], [13, 11], [1, 13], [9, 6]]) {
      put(id, x, y, g[1]); put(id, x + 2, y, g[1]); put(id, x + 1, y + 1, g[2]);
    }
  }
  function tallBlades(id, rowFrom, rowTo, p, transparentBg) {
    if (!transparentBg) fill(id, p[1]);
    // Clumps of blades every 4 px, two staggered rows: a dark "^" with a light tip.
    for (let band = 0; band < 2; band++) {
      const by = band === 0 ? 7 : 15, off = band === 0 ? 0 : 2;
      if (by < rowFrom || by - 6 > rowTo) continue;
      for (let cx = off; cx < T + 2; cx += 4) {
        for (let k = 0; k < 6; k++) {
          const y = by - k;
          if (y < rowFrom || y > rowTo) continue;
          const half = Math.max(0, 2 - Math.floor(k / 2));
          for (let dx = -half; dx <= half; dx++) {
            const x = cx + dx;
            if (x < 0 || x >= T) continue;
            put(id, x, y, (dx === -half || dx === half) ? p[3] : (k >= 4 ? p[0] : p[2]));
          }
        }
      }
    }
  }
  function path(id) {
    const p = P.path;
    fill(id, p[0]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const h = hash(x, y, 7) % 23;
      if (h === 0) put(id, x, y, p[2]); else if (h < 3) put(id, x, y, p[1]);
    }
  }
  function water(id, frame) {
    const p = P.water;
    fill(id, p[1]);
    for (let y = 1; y < T; y += 4) {
      for (let x = 0; x < T; x++) {
        const phase = (x + frame * 2 + (y >> 2) * 3) % 8;
        if (phase === 0 || phase === 1) put(id, x, y, p[0]);
        else if (phase === 4) put(id, x, y + 1, p[2]);
      }
    }
  }
  function flower(id, frame) {
    grass(id);
    const p = P.flower;
    for (const [cx, cy] of [[4, 4], [11, 11]]) {
      const o = frame ? 1 : 0;
      put(id, cx, cy - 1 - o, p[1]); put(id, cx, cy + 1 + o, p[1]);
      put(id, cx - 1 - o, cy, p[1]); put(id, cx + 1 + o, cy, p[1]);
      put(id, cx, cy, frame ? p[2] : p[0]);
      put(id, cx, cy + 2 + o, P.grass[2]);
    }
  }
  function ledge(id) {
    grass(id);
    const g = P.grass;
    rect(id, 0, 9, T, 1, g[3]);       // the lip
    rect(id, 0, 10, T, 3, g[2]);      // the drop face
    for (let x = 1; x < T; x += 4) put(id, x, 11, g[3]);
    rect(id, 0, 13, T, 3, g[0]);      // ground below
  }
  function treeBase(id) {
    grass(id);
    const t = P.tree, w = P.wood;
    // Lower half of the canopy (rows 0-8) and the trunk.
    for (let y = 0; y <= 8; y++) {
      const half = 7 - Math.max(0, y - 4);
      for (let x = 8 - half; x < 8 + half; x++) put(id, x, y, (x + y) % 5 === 0 ? t[2] : t[1]);
    }
    rect(id, 6, 9, 4, 6, w[2]);
    rect(id, 7, 9, 1, 6, w[1]);
    rect(id, 5, 15, 6, 1, P.grass[2]);
  }
  function treeTop(id) {
    // Upper canopy, drawn in FG over the cell above the trunk.
    const t = P.tree;
    for (let y = 4; y < T; y++) {
      const half = Math.min(7, 2 + (y - 4));
      for (let x = 8 - half; x < 8 + half; x++) {
        const light = (y < 9 && x < 8 && (x + y) % 3 === 0);
        put(id, x, y, light ? t[0] : ((x * 3 + y) % 7 === 0 ? t[2] : t[1]));
      }
    }
  }
  function fence(id) {
    grass(id);
    const w = P.wood;
    rect(id, 0, 6, T, 2, w[1]); rect(id, 0, 11, T, 2, w[1]);
    rect(id, 0, 8, T, 1, w[2]); rect(id, 0, 13, T, 1, w[2]);
    for (const x of [1, 9]) { rect(id, x, 3, 4, 12, w[1]); rect(id, x + 3, 3, 1, 12, w[2]); rect(id, x, 3, 4, 1, w[0]); }
  }
  function sign(id) {
    grass(id);
    const w = P.wood;
    rect(id, 2, 3, 12, 8, w[1]); rect(id, 2, 3, 12, 1, w[0]); rect(id, 2, 10, 12, 1, w[2]);
    for (const y of [5, 7]) rect(id, 4, y, 8, 1, w[3]);
    rect(id, 7, 11, 2, 4, w[2]);
  }

  // ---- Buildings -------------------------------------------------------------
  function wall(id) {
    const p = P.wall;
    fill(id, p[0]);
    for (let y = 3; y < T; y += 4) rect(id, 0, y, T, 1, p[1]);
    rect(id, 0, 15, T, 1, p[2]);
  }
  function windowTile(id) {
    wall(id);
    const p = P.wall, wa = P.water;
    rect(id, 3, 3, 10, 8, p[3]);
    rect(id, 4, 4, 8, 6, wa[1]);
    rect(id, 4, 4, 3, 2, wa[0]);
    rect(id, 7, 4, 1, 6, p[3]); rect(id, 4, 6, 8, 1, p[3]);
  }
  function door(id) {
    wall(id);
    const w = P.wood;
    rect(id, 3, 2, 10, 14, w[3]);
    rect(id, 4, 3, 8, 13, w[1]);
    rect(id, 4, 3, 8, 1, w[0]);
    put(id, 10, 9, w[3]);
  }
  function roofRows(id, fromRow) {
    const r = P.roof;
    for (let y = fromRow; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const course = Math.floor((y - fromRow) / 3);
        const seam = ((x + course * 2) % 4 === 0);
        put(id, x, y, ((y - fromRow) % 3 === 2) ? r[2] : (seam ? r[2] : r[1]));
      }
    }
  }
  function roofLow(id) {
    roofRows(id, 0);
    rect(id, 0, 13, T, 1, P.roof[3]);   // eave edge
    rect(id, 0, 14, T, 2, P.wall[2]);   // its shadow on the wall
  }
  function roofTop(id) {
    // Upper slope and ridge, FG with a transparent sky band on top.
    roofRows(id, 6);
    rect(id, 0, 5, T, 1, P.roof[3]);
    rect(id, 0, 6, T, 1, P.roof[0]);
  }

  // ---- Interior ----------------------------------------------------------------
  function floor(id) {
    const p = P.floor;
    fill(id, p[0]);
    for (let y = 3; y < T; y += 4) rect(id, 0, y, T, 1, p[1]);
    for (let y = 0; y < T; y += 4) put(id, ((y / 4) % 2) ? 11 : 4, y + 1, p[2]);
  }
  function wallIn(id) {
    const p = P.wall;
    fill(id, p[1]);
    rect(id, 0, 0, T, 10, p[0]);
    for (let x = 0; x < T; x += 4) rect(id, x, 0, 1, 10, p[1]);
    rect(id, 0, 10, T, 1, p[2]);
    rect(id, 0, 14, T, 2, p[2]);
  }
  function table(id) {
    floor(id);
    const w = P.wood;
    rect(id, 1, 3, 14, 7, w[1]); rect(id, 1, 3, 14, 1, w[0]); rect(id, 1, 10, 14, 2, w[2]);
    rect(id, 2, 12, 2, 3, w[2]); rect(id, 12, 12, 2, 3, w[2]);
  }
  function mat(id) {
    floor(id);
    const r = P.roof;
    rect(id, 2, 4, 12, 9, r[1]); rect(id, 3, 5, 10, 7, r[2]);
    for (let x = 4; x < 12; x += 2) put(id, x, 8, r[0]);
  }
  function shelf(id) {
    const w = P.wood, b = [P.roof[1], P.water[2], P.tree[1], P.path[2]];
    fill(id, w[2]);
    for (const y of [1, 8]) {
      rect(id, 1, y, 14, 6, w[3]);
      for (let x = 2; x < 14; x += 2) rect(id, x, y + 1 + (x % 3 === 0 ? 1 : 0), 2, 5 - (x % 3 === 0 ? 1 : 0), b[(x / 2) % 4]);
    }
  }

  // ---- Characters ----------------------------------------------------------------
  // Six frames each: down, down-walk, up, up-walk, side, side-walk. Drawn as
  // simple shapes and then outlined, front-facing as the oblique view wants.
  function character(base, c) {
    const draw = (id, dir, walk) => {
      // Head and hair.
      for (let y = 1; y <= 7; y++) {
        const inset = (y === 1 || y === 7) ? 2 : (y === 2 ? 1 : 0);
        const x0 = (dir === 'side' ? 4 : 4) + inset, x1 = (dir === 'side' ? 11 : 11) - inset;
        for (let x = x0; x <= x1; x++) {
          let col = c.skin;
          if (y <= 3) col = c.hat;
          if (dir === 'up' && y <= 6) col = c.hair;
          if (dir === 'side' && y >= 3 && y <= 6 && x >= 9) col = c.hair;
          put(id, x, y, col);
        }
      }
      if (dir === 'down') { rect(id, 3, 3, 10, 1, c.hatDark); put(id, 6, 5, c.eye); put(id, 9, 5, c.eye); }
      if (dir === 'side') { rect(id, 2, 3, 5, 1, c.hatDark); put(id, 5, 5, c.eye); }
      if (dir === 'up')   { rect(id, 4, 3, 8, 1, c.hatDark); }
      // Body.
      const bx0 = dir === 'side' ? 5 : 4, bx1 = dir === 'side' ? 10 : 11;
      rect(id, bx0, 8, bx1 - bx0 + 1, 5, c.shirt);
      rect(id, bx0, 12, bx1 - bx0 + 1, 1, c.shirtDark);
      // Arms swing on the walk frame.
      if (dir !== 'side') {
        rect(id, 3, walk ? 8 : 9, 1, 3, c.skin);
        rect(id, 12, walk ? 10 : 9, 1, 3, c.skin);
      } else {
        rect(id, walk ? 6 : 7, 9, 2, 3, c.skinDark);
      }
      // Legs.
      if (dir === 'side') {
        if (walk) { rect(id, 4, 13, 2, 2, c.legs); rect(id, 9, 13, 2, 2, c.legs); }
        else      { rect(id, 6, 13, 4, 2, c.legs); }
      } else if (walk) {
        rect(id, 5, 13, 2, 1, c.legs);             // left leg lifted
        rect(id, 9, 13, 2, 2, c.legs);
      } else {
        rect(id, 5, 13, 2, 2, c.legs); rect(id, 9, 13, 2, 2, c.legs);
      }
      outline(id, c.outline);
    };
    draw(base + 0, 'down', false);
    draw(base + 1, 'down', true);
    draw(base + 2, 'up', false);
    draw(base + 3, 'up', true);
    draw(base + 4, 'side', false);
    draw(base + 5, 'side', true);
  }

  function shadow(id) {
    const c = P.grass[3];
    for (let y = 12; y <= 15; y++) {
      const half = (y === 12 || y === 15) ? 3 : 5;
      for (let x = 8 - half; x < 8 + half; x++) put(id, x, y, c);
    }
  }

  function paintAtlas() {
    buf.fill(0);
    const outlineC = hex('#181818');
    character(ID.PLAYER, {
      skin: hex('#f8d0a8'), skinDark: hex('#d8a078'), hat: hex('#e84040'), hatDark: hex('#a02028'),
      hair: hex('#583018'), eye: outlineC, shirt: hex('#4878e0'), shirtDark: hex('#284898'),
      legs: hex('#383850'), outline: outlineC,
    });
    character(ID.NPC_A, {
      skin: hex('#f0c098'), skinDark: hex('#c89070'), hat: hex('#f0c040'), hatDark: hex('#a07818'),
      hair: hex('#f0c040'), eye: outlineC, shirt: hex('#58b060'), shirtDark: hex('#2e7038'),
      legs: hex('#6a4a30'), outline: outlineC,
    });
    character(ID.NPC_B, {
      skin: hex('#e8b890'), skinDark: hex('#b88060'), hat: hex('#303040'), hatDark: hex('#181820'),
      hair: hex('#303040'), eye: outlineC, shirt: hex('#c060c0'), shirtDark: hex('#783078'),
      legs: hex('#283048'), outline: outlineC,
    });
    character(ID.NPC_C, {
      skin: hex('#f8d8b8'), skinDark: hex('#d0a888'), hat: hex('#e8e8e8'), hatDark: hex('#a8a8a8'),
      hair: hex('#d8d8d8'), eye: outlineC, shirt: hex('#f0f0f0'), shirtDark: hex('#b0b0c0'),
      legs: hex('#505060'), outline: outlineC,
    });
    shadow(ID.SHADOW);

    grass(ID.GRASS);
    tallBlades(ID.TALL_BG, 0, 15, P.tall, false);
    tallBlades(ID.TALL_FG, 9, 15, P.tall, true);   // only the front clump: covers the lower body
    path(ID.PATH);
    water(ID.WATER, 0); water(ID.WATER + 1, 1);
    flower(ID.FLOWER, 0); flower(ID.FLOWER + 1, 1);
    ledge(ID.LEDGE);
    treeBase(ID.TREE_BASE);
    treeTop(ID.TREE_TOP);
    fence(ID.FENCE);
    sign(ID.SIGN);
    wall(ID.WALL); windowTile(ID.WINDOW); door(ID.DOOR);
    roofLow(ID.ROOF_LOW); roofTop(ID.ROOF_TOP);
    floor(ID.FLOOR); wallIn(ID.WALL_IN); table(ID.TABLE); mat(ID.MAT); shelf(ID.SHELF);
    fill(ID.VOID, P.void[0]);
    return buf;
  }

  // ---- Map -------------------------------------------------------------------
  function buildMap(F) {
    const W = 52, H = 32;
    const EMPTY = 0xFFFF;
    const ground = new Uint16Array(W * H).fill(ID.GRASS);
    const fg = new Uint16Array(W * H).fill(EMPTY);
    const flags = new Uint8Array(W * H);
    const at = (x, y) => y * W + x;
    const set = (x, y, g, f, fl) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = at(x, y);
      ground[i] = g; flags[i] = fl || 0;
      if (f !== undefined) fg[i] = f;
    };
    const area = (x0, y0, w, h, g, f, fl) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, g, f, fl);
    };
    // A tree: solid trunk cell, canopy in FG on the walkable cell above it.
    const tree = (x, y) => {
      set(x, y, ID.TREE_BASE, EMPTY, F.SOLID);
      if (y > 0) fg[at(x, y - 1)] = ID.TREE_TOP;
    };
    const signs = {};
    const sign = (x, y, text) => { set(x, y, ID.SIGN, EMPTY, F.SOLID); signs[x + ',' + y] = text; };

    // Outdoor area: x 0..39. Forest border.
    for (let x = 0; x < 40; x++) { tree(x, 0); tree(x, H - 1); }
    for (let y = 1; y < H - 1; y++) { tree(0, y); tree(39, y); }

    // Paths.
    area(19, 1, 2, H - 2, ID.PATH);
    area(1, 15, 38, 2, ID.PATH);

    // Houses: 5x4. Row 0 roof top in FG over walkable ground (you can walk
    // "behind" it), row 1 lower roof (solid), rows 2-3 walls, door warps.
    const warps = [];
    const house = (hx, hy, interiorDoor) => {
      for (let x = hx; x < hx + 5; x++) {
        fg[at(x, hy)] = ID.ROOF_TOP;                   // walkable, covered
        set(x, hy + 1, ID.ROOF_LOW, EMPTY, F.SOLID);
        set(x, hy + 2, (x - hx) % 2 ? ID.WINDOW : ID.WALL, EMPTY, F.SOLID);
        set(x, hy + 3, ID.WALL, EMPTY, F.SOLID);
      }
      const dx = hx + 2, dy = hy + 3;
      set(dx, dy, ID.DOOR, EMPTY, 0);
      area(dx, dy + 1, 1, 15 - (dy + 1), ID.PATH);    // path to the main road
      if (interiorDoor) warps.push([dx, dy, interiorDoor[0], interiorDoor[1] - 1, 1]);
      return [dx, dy];
    };

    // Interior room at x 42..50, y 3..10; everything else in the strip is void.
    area(40, 0, 12, H, ID.VOID, EMPTY, F.SOLID);
    area(42, 3, 9, 2, ID.WALL_IN, EMPTY, F.SOLID);
    area(42, 5, 9, 6, ID.FLOOR, EMPTY, 0);
    set(43, 3, ID.SHELF, EMPTY, F.SOLID); set(44, 3, ID.SHELF, EMPTY, F.SOLID);
    set(43, 4, ID.SHELF, EMPTY, F.SOLID); set(44, 4, ID.SHELF, EMPTY, F.SOLID);
    area(46, 7, 3, 1, ID.TABLE, EMPTY, F.COUNTER);
    const matX = 46, matY = 10;
    set(matX, matY, ID.MAT, EMPTY, 0);

    const doorA = house(8, 5, [matX, matY]);
    house(26, 5, null);
    house(25, 19, null);

    // Leaving through the mat puts you on the step below house A's door.
    warps.push([matX, matY, doorA[0], doorA[1] + 1, 0]);

    // Ledges (hop down only) north of the road, with gaps for the paths.
    for (let x = 2; x < 18; x++) if (x !== 10) set(x, 12, ID.LEDGE, EMPTY, F.LEDGE_DOWN);
    for (let x = 22; x < 38; x++) if (x !== 28) set(x, 12, ID.LEDGE, EMPTY, F.LEDGE_DOWN);

    // Tall grass: BG blades, FG front clump that hides the lower body.
    area(3, 19, 10, 9, ID.TALL_BG, ID.TALL_FG, F.GRASS);
    area(32, 24, 6, 6, ID.TALL_BG, ID.TALL_FG, F.GRASS);
    area(3, 2, 5, 3, ID.TALL_BG, ID.TALL_FG, F.GRASS);

    // Pond with animated water, flowers around it.
    area(14, 21, 4, 6, ID.WATER, EMPTY, F.WATER);
    for (const [x, y] of [[13, 20], [18, 20], [13, 27], [18, 27], [16, 28], [22, 3], [24, 9], [31, 9], [6, 9], [14, 9]])
      set(x, y, ID.FLOWER, EMPTY, 0);

    // Fence around the south-east yard, open at its path.
    for (let x = 23; x < 38; x++) if (x !== 27) set(x, 18, ID.FENCE, EMPTY, F.SOLID);
    for (let y = 18; y < 30; y++) set(23, y, ID.FENCE, EMPTY, F.SOLID);

    // Scattered trees (canopy overhangs the cell above: walk behind them).
    for (const [x, y] of [[15, 4], [17, 7], [34, 3], [36, 6], [3, 9], [33, 13], [35, 13], [6, 29], [10, 29], [29, 26]])
      tree(x, y);

    sign(18, 13, 'TILE TOWN\nGrid-locked since 1996.');
    sign(11, 9, 'HOME\nStep on the door to go in.');
    sign(21, 20, 'Tall grass hides your feet.\nRoofs and treetops hide everything else.');
    sign(4, 13, 'Ledges: hop down, never up.');

    return { width: W, height: H, ground, fg, flags, border: ID.TREE_BASE, warps, signs };
  }

  function build() {
    const atlas = paintAtlas();
    const map = buildMap(global.TileWorld.FLAGS);
    const D = global.TileWorld.DIR, B = global.TileWorld.BEHAVIOR;
    const actors = [
      { x: 20, y: 17, sprite: ID.PLAYER, facing: D.DOWN, behavior: B.STATIC },
      { x: 23, y: 10, sprite: ID.NPC_A, facing: D.LEFT, behavior: B.WANDER,
        text: 'I walk in straight lines.\nOne whole tile at a time.' },
      { x: 7, y: 17, sprite: ID.NPC_B, facing: D.DOWN, behavior: B.LOOK_AROUND,
        text: 'Walk north behind a roof.\nYou go under it, not through it.' },
      { x: 47, y: 6, sprite: ID.NPC_C, facing: D.DOWN, behavior: B.STATIC,
        text: 'Talk across the counter.\nThe mat by the door takes you out.' },
      { x: 30, y: 21, sprite: ID.NPC_A, facing: D.UP, behavior: B.WANDER,
        text: 'Try the Snap camera.\nThe screen slides a room at a time.' },
    ];
    return { atlas, atlasW: AW, atlasH: AH, map, actors, ids: ID };
  }

  global.TileWorldDemo = { build };
})(typeof window !== 'undefined' ? window : globalThis);
