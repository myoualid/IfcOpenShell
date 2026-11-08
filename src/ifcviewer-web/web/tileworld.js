// This file was generated with the assistance of an AI coding tool.
//
// tileworld.js: JavaScript wrapper for the viewer's 2D tile-world mode.
//
// Load after IfcViewerWeb.js and ifcviewer.js, then:
//
//   const viewer = await IfcViewer.create({ canvas, sidecarFormatVersion: 19 });
//   await viewer.ready;
//   const world = TileWorld.attach(viewer);
//   world.setScreen(160, 144, 16);
//   world.setAtlas(rgbaBytes, 256, 256);
//   world.setMap({ width, height, ground, fg, flags, border });
//   world.spawn(5, 5, 0, TileWorld.DIR.DOWN);   // actor 0 is the player
//   world.enable(true);
//
// While enabled, the viewer draws the tile world instead of the 3D scene and
// the keyboard drives the player (arrows/WASD, Z/Space/Enter = A, X/Shift = B).
// The simulation, collision, camera and draw order all live in C++
// (src/ifcviewer/TileWorld.h); this file only marshals data.
(function (global) {
  'use strict';

  const FLAGS = Object.freeze({
    SOLID: 1, GRASS: 2, LEDGE_DOWN: 4, LEDGE_LEFT: 8, LEDGE_RIGHT: 16, WATER: 32, COUNTER: 64,
  });
  const DIR = Object.freeze({ DOWN: 0, UP: 1, LEFT: 2, RIGHT: 3 });
  const BEHAVIOR = Object.freeze({ STATIC: 0, WANDER: 1, LOOK_AROUND: 2 });
  const EVENT = Object.freeze({ STEP_ENDED: 1, ENTERED_GRASS: 2, BUMPED: 3, WARPED: 4, INTERACT: 5 });
  const OPTION = Object.freeze({
    camera: 0, clamp: 1, palette: 2, lcd: 3, debugCollision: 4, spriteLift: 5, shadowTile: 6, paused: 7,
    nativeKeys: 8, zoom: 9,
  });
  const EMPTY = 0xFFFF;
  const BUTTON = Object.freeze({ UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, A: 16, B: 32 });

  function attach(viewer) {
    const M = viewer.module;
    if (!M || !M._tw_enable_c) {
      throw new Error('This IfcViewerWeb build has no tile-world exports (_tw_enable_c)');
    }

    // Copy a typed array into the wasm heap. The heap view is taken after
    // malloc, because a malloc can grow (and so detach) the old buffer.
    function withHeap(typed, fn) {
      const bytes = typed.byteLength;
      const ptr = M._malloc(Math.max(4, bytes));
      new Uint8Array(M.HEAPU8.buffer, ptr, bytes)
        .set(new Uint8Array(typed.buffer, typed.byteOffset, bytes));
      try { return fn(ptr); } finally { M._free(ptr); }
    }

    const stateBuf = new Int32Array(10);

    const api = {
      enable(on) { M._tw_enable_c(on ? 1 : 0); },

      // Native resolution and tile size (8 or 16). 160x144 is ten by nine 16 px cells.
      setScreen(w, h, tilePx) { M._tw_set_screen_c(w | 0, h | 0, tilePx | 0); },

      // rgba: Uint8Array or Uint8ClampedArray, w*h*4, straight sRGB values.
      // Tile id n sits at column n % (w / tile), row floor(n / (w / tile)).
      setAtlas(rgba, w, h) {
        withHeap(rgba, (p) => M._tw_set_atlas_c(p, w | 0, h | 0));
      },

      // ground/fg: Uint16Array (fg uses 0xFFFF for empty), flags: Uint8Array.
      // border: tile id drawn outside the map.
      setMap(map) {
        const n = map.width * map.height;
        const ground = map.ground instanceof Uint16Array ? map.ground : Uint16Array.from(map.ground);
        const fg = map.fg ? (map.fg instanceof Uint16Array ? map.fg : Uint16Array.from(map.fg))
                          : new Uint16Array(n).fill(EMPTY);
        const flags = map.flags instanceof Uint8Array ? map.flags : Uint8Array.from(map.flags);
        if (ground.length !== n || fg.length !== n || flags.length !== n) {
          throw new Error('setMap: every layer must be width*height long');
        }
        withHeap(ground, (g) => withHeap(fg, (f) => withHeap(flags, (fl) =>
          M._tw_set_map_c(map.width, map.height, g, f, fl, map.border | 0))));
      },

      setCell(x, y, ground, fg, flags) {
        M._tw_set_cell_c(x, y, ground, fg === undefined ? EMPTY : fg, flags | 0);
      },

      // Tiles base..base+frames-1 cycle every periodFrames (60 per second).
      // Show only cells inside (x, y, w, h); the rest draws as borderTile.
      // Pass w = 0 to show the whole map.
      setRegion(x, y, w, h, borderTile) { M._tw_set_region_c(x | 0, y | 0, w | 0, h | 0, borderTile | 0); },

      animateTile(base, frames, periodFrames) { M._tw_set_tile_anim_c(base, frames, periodFrames); },

      // spriteBase: first of six atlas tiles (down, down-walk, up, up-walk,
      // side, side-walk; right is side mirrored). Returns the actor index.
      spawn(x, y, spriteBase, facing, behavior) {
        return M._tw_spawn_actor_c(x, y, spriteBase, facing | 0, behavior | 0);
      },
      clearActors() { M._tw_clear_actors_c(); },
      addWarp(sx, sy, dx, dy, facing) { M._tw_add_warp_c(sx, sy, dx, dy, facing | 0); },
      clearWarps() { M._tw_clear_warps_c(); },
      teleport(x, y, facing) { M._tw_teleport_c(x, y, facing | 0); },
      // Move an actor (not the player) to a cell, stopped, with a new
      // behaviour; WANDER roams within `radius` cells of that cell.
      placeActor(index, x, y, facing, behavior, radius) {
        M._tw_place_actor_c(index, x, y, facing | 0, behavior | 0, radius | 0);
      },
      setButtons(bits) { M._tw_set_buttons_c(bits | 0); },

      // Every actor: { x, y, px, py, facing } (cell and pixel position).
      actors(max = 256) {
        const buf = new Int32Array(max * 5);
        let n = 0;
        withHeap(buf, (p) => {
          n = M._tw_get_actors_c(p, max);
          buf.set(new Int32Array(M.HEAPU8.buffer, p, max * 5));
        });
        const out = [];
        for (let i = 0; i < n; i++) {
          out.push({ x: buf[i * 5], y: buf[i * 5 + 1], px: buf[i * 5 + 2], py: buf[i * 5 + 3], facing: buf[i * 5 + 4] });
        }
        return out;
      },

      // Last frame's mapping from world pixels to canvas backing-store pixels:
      // canvas = offset + (world - cam) * scale.
      view() {
        const buf = new Int32Array(8);
        withHeap(buf, (p) => { M._tw_get_view_c(p); buf.set(new Int32Array(M.HEAPU8.buffer, p, 8)); });
        return { scale: buf[0], offsetX: buf[1], offsetY: buf[2], screenW: buf[3], screenH: buf[4],
                 tile: buf[5], mapW: buf[6], mapH: buf[7] };
      },

      // name: one of TileWorld.OPTION's keys. Booleans become 0/1.
      setOption(name, value) {
        const key = OPTION[name];
        if (key === undefined) throw new Error('Unknown tile-world option: ' + name);
        M._tw_set_option_c(key, typeof value === 'boolean' ? (value ? 1 : 0) : (value | 0));
      },

      // Call once per animation frame. `events` holds everything since the
      // previous call (the simulation runs at 60 Hz, independent of RAF).
      state() {
        withHeap(stateBuf, (p) => {
          M._tw_get_state_c(p);
          stateBuf.set(new Int32Array(M.HEAPU8.buffer, p, 10));
        });
        const s = stateBuf;
        const mask = s[8] >>> 0;
        const events = [];
        for (const [name, bit] of Object.entries(EVENT)) if (mask & (1 << bit)) events.push(name);
        return {
          x: s[0], y: s[1], facing: s[2], moving: s[3] !== 0,
          camX: s[4], camY: s[5], cellFlags: s[6], steps: s[7],
          events, talkedTo: s[9],
        };
      },
    };
    return api;
  }

  global.TileWorld = { attach, FLAGS, DIR, BEHAVIOR, EVENT, OPTION, EMPTY, BUTTON };
})(typeof window !== 'undefined' ? window : globalThis);
