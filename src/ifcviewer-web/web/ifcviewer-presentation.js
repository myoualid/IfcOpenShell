// This file was generated with the assistance of an AI coding tool.
//
// ifcviewer-presentation.js — camera animation, shot sequences and frame
// capture on top of ifcviewer.js. Load it after ifcviewer.js:
//
//   <script src="IfcViewerWeb.js"></script>
//   <script src="ifcviewer.js"></script>
//   <script src="ifcviewer-presentation.js"></script>
//   <script>
//     const viewer = await IfcViewer.create({ canvas, sidecarFormatVersion: 19 });
//     const P = IfcViewerPresentation.attach(viewer);
//
//     await P.flyTo({ target: [8, 10, 12], distance: 40, yaw: -60, pitch: 25, fov: 35 },
//                   { duration: 3, ease: 'inOutCubic', arc: 10 });
//
//     const seq = P.sequence([
//       { name: 'overview', duration: 6, camera: { yaw: -40 }, orbit: 30 },
//       { name: 'dive', duration: 4, camera: P.lookFrom([5, 2, 5.6], [5, 8, 5.4], 70),
//         ease: 'inOutSine', enter: v => v.setColor(ids, '#c9a27a') },
//     ]);
//     await P.play(seq);                                    // live, interruptible
//     await P.recordFrames(seq, { fps: 30, width: 3840, height: 2160 });  // PNG frames
//
//     const build = P.schedule({ tasks }, { ghost: 0.12 });     // 4D construction
//     await P.play(P.sequence([build.shot({ duration: 12, orbit: 40,
//       onDate: (d, running) => caption(d.toDateString()) })]));
//     const webm = await P.recordVideo(seq, { fps: 30 });   // real-time WebM
//     const mp4 = await P.recordMp4(seq, { fps: 30, width: 3840, height: 2160, samples: 8 });  // offline H.264
//   </script>
//
// Camera model. The viewer's camera is an orbit camera (target, distance, yaw,
// pitch) plus a vertical field of view. Between two cameras this module
// interpolates the target linearly, yaw along the shorter arc, pitch linearly,
// the field of view linearly, and the frame half-height h = distance ×
// tan(fov / 2) geometrically. Distance is then h / tan(fov / 2). Two cameras
// with the same h but different fov give a true dolly-zoom (the subject keeps
// its size while the perspective changes), which is how a long-lens
// axonometric view turns into an eye-level interior without a cut.
//
// Determinism. A sequence is a pure function of time: seek(t) puts the camera
// and every shot's state where they belong at t, whatever was shown before.
// Shots therefore set absolute state in `enter` (colours, visibility) and
// derive animated state from u in `update`. That is what lets recordFrames
// render frame n without having played frames 0 .. n-1.

(function (root) {
  'use strict';

  const EASE = {
    linear:     function (t) { return t; },
    inQuad:     function (t) { return t * t; },
    outQuad:    function (t) { return t * (2 - t); },
    inOutSine:  function (t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outCubic:   function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutQuint: function (t) { return t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2; },
    outExpo:    function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
  };

  // ---- MP4 muxer ---------------------------------------------------------

  // A minimal ISO-BMFF writer for one H.264 track at a constant frame rate:
  // ftyp, mdat with every sample in order, then moov. `samples` are
  // length-prefixed AVC access units ({ data, key }), `avcC` the decoder
  // configuration record WebCodecs reports.
  function muxMp4(samples, avcC, width, height, fps) {
    const u8 = function (v) { return [v & 255]; };
    const u16 = function (v) { return [(v >>> 8) & 255, v & 255]; };
    const u32 = function (v) { return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; };
    const zeros = function (n) { return new Array(n).fill(0); };
    const str = function (t) { return Array.from(t).map(function (c) { return c.charCodeAt(0); }); };
    const cat = function (parts) {
      let n = 0;
      parts.forEach(function (p) { n += p.length; });
      const out = new Uint8Array(n);
      let at = 0;
      parts.forEach(function (p) { out.set(p, at); at += p.length; });
      return out;
    };
    const box = function (type, parts) {
      const body = cat(parts.map(function (p) { return p instanceof Uint8Array ? p : Uint8Array.from(p); }));
      return cat([Uint8Array.from(u32(body.length + 8).concat(str(type))), body]);
    };
    const full = function (type, version, flags, parts) {
      return box(type, [[version & 255, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]].concat(parts));
    };
    const flat = function (list) { return [].concat.apply([], list); };
    const matrix = flat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0),
                         u32(0), u32(0), u32(0x40000000)]);

    const timescale = Math.round(fps * 1000);
    const delta = 1000;
    const n = samples.length;
    const durMedia = n * delta;
    const durMovie = Math.round(n * 1000 / fps);

    const ftyp = box('ftyp', [str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41')]);
    const mdat = box('mdat', [cat(samples.map(function (x) { return x.data; }))]);

    const avc1 = box('avc1', [zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(width), u16(height),
                              u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18),
                              u16(0xffff), box('avcC', [avcC])]);
    const keys = [];
    samples.forEach(function (x, i) { if (x.key) keys.push(i + 1); });
    const stbl = box('stbl', [
      full('stsd', 0, 0, [u32(1), avc1]),
      full('stts', 0, 0, [u32(1), u32(n), u32(delta)]),
      full('stss', 0, 0, [u32(keys.length), flat(keys.map(u32))]),
      full('stsc', 0, 0, [u32(1), u32(1), u32(n), u32(1)]),
      full('stsz', 0, 0, [u32(0), u32(n), flat(samples.map(function (x) { return u32(x.data.length); }))]),
      full('stco', 0, 0, [u32(1), u32(ftyp.length + 8)]),
    ]);
    const minf = box('minf', [
      full('vmhd', 0, 1, [u16(0), zeros(6)]),
      box('dinf', [full('dref', 0, 0, [u32(1), full('url ', 0, 1, [])])]),
      stbl,
    ]);
    const mdia = box('mdia', [
      full('mdhd', 0, 0, [u32(0), u32(0), u32(timescale), u32(durMedia), u16(0x55c4), u16(0)]),
      full('hdlr', 0, 0, [u32(0), str('vide'), zeros(12), str('VideoHandler'), [0]]),
      minf,
    ]);
    const trak = box('trak', [
      full('tkhd', 0, 3, [u32(0), u32(0), u32(1), u32(0), u32(durMovie), zeros(8), u16(0), u16(0),
                          u16(0), u16(0), matrix, u32(width * 65536), u32(height * 65536)]),
      mdia,
    ]);
    const moov = box('moov', [
      full('mvhd', 0, 0, [u32(0), u32(0), u32(1000), u32(durMovie), u32(0x10000), u16(0x100), zeros(10),
                          matrix, zeros(24), u32(2)]),
      trak,
    ]);
    return cat([ftyp, mdat, moov]);
  }

  function easing(e) {
    if (typeof e === 'function') return e;
    const f = EASE[e || 'inOutCubic'];
    if (!f) throw new Error('unknown ease: ' + e + ' (expected one of ' + Object.keys(EASE).join(', ') + ')');
    return f;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function wrap180(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  const D2R = Math.PI / 180;

  function halfHeight(c) { return c.distance * Math.tan(c.fov * 0.5 * D2R); }

  // Interpolate two full cameras. `arc` lifts pitch by up to `arc` degrees at
  // mid-flight; `orbit` adds that many degrees of yaw across the move.
  function interpolate(a, b, u, o) {
    o = o || {};
    const fov = lerp(a.fov, b.fov, u);
    const ha = halfHeight(a), hb = halfHeight(b);
    const h = ha > 0 && hb > 0 ? ha * Math.pow(hb / ha, u) : lerp(ha, hb, u);
    const dyaw = wrap180(b.yaw - a.yaw);
    return {
      target: [lerp(a.target[0], b.target[0], u), lerp(a.target[1], b.target[1], u),
               lerp(a.target[2], b.target[2], u)],
      fov: fov,
      distance: h / Math.tan(fov * 0.5 * D2R),
      yaw: a.yaw + dyaw * u + (o.orbit || 0) * u,
      pitch: Math.max(-89.9, Math.min(89.9, lerp(a.pitch, b.pitch, u) + (o.arc || 0) * Math.sin(Math.PI * u))),
    };
  }

  function merge(base, partial) {
    const c = {
      target: (partial && partial.target) ? partial.target.slice() : base.target.slice(),
      distance: base.distance, yaw: base.yaw, pitch: base.pitch, fov: base.fov,
    };
    if (partial) {
      ['distance', 'yaw', 'pitch', 'fov'].forEach(function (k) { if (partial[k] !== undefined) c[k] = +partial[k]; });
      // keepFraming: change fov but keep the subject's size (dolly-zoom endpoint)
      if (partial.keepFraming && partial.fov !== undefined && partial.distance === undefined) {
        c.distance = halfHeight(base) / Math.tan(c.fov * 0.5 * D2R);
      }
    }
    return c;
  }

  // Orbit parameters for an eye looking at a target (the viewer's convention:
  // eye = target + d·(cos p·cos y, cos p·sin y, sin p)).
  function lookFrom(eye, target, fov) {
    const dx = eye[0] - target[0], dy = eye[1] - target[1], dz = eye[2] - target[2];
    const d = Math.max(1e-3, Math.hypot(dx, dy, dz));
    const c = { target: target.slice(), distance: d, yaw: Math.atan2(dy, dx) / D2R,
                pitch: Math.asin(Math.max(-1, Math.min(1, dz / d))) / D2R };
    if (fov !== undefined) c.fov = fov;
    return c;
  }

  // A long-lens camera that frames a box from a direction: an axonometric look
  // in perspective. `fov` small (5-12°) reads as near-orthographic.
  function frameBox(min, max, yaw, pitch, fov, padding) {
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = (min[2] + max[2]) / 2;
    const r = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) * (padding || 1.1);
    fov = fov || 10;
    return { target: [cx, cy, cz], yaw: yaw, pitch: pitch, fov: fov,
             distance: r / Math.sin(fov * 0.5 * D2R) };
  }

  function attach(viewer) {
    if (!viewer || typeof viewer.getCamera !== 'function') throw new Error('attach(viewer): not a viewer');
    if (typeof viewer.setFov !== 'function') {
      throw new Error('this ifcviewer.js has no setFov — rebuild IfcViewerWeb with the fov exports');
    }
    const canvas = viewer.canvas ? viewer.canvas() : document.getElementById('viewer-canvas');
    let playing = null;   // { stop() }

    function current() {
      const c = viewer.getCamera();
      return { target: c.target, distance: c.distance, yaw: c.yaw, pitch: c.pitch, fov: c.fov };
    }

    function apply(c) {
      viewer.setCamera({ target: c.target, distance: c.distance, yaw: c.yaw, pitch: c.pitch, fov: c.fov });
    }

    // Resolve after n drawn frames (falls back to rAF when no frame hook). A
    // hidden page draws no frames at all, so a timer (default 250 ms a frame
    // + 500 ms) settles the promise anyway rather than hanging the caller.
    function frames(n, timeoutMs) {
      n = n || 1;
      return new Promise(function (resolve) {
        let settled = false, off = null;
        function done() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (off) off();
          resolve();
        }
        const timer = setTimeout(done, timeoutMs > 0 ? timeoutMs : 250 * n + 500);
        if (viewer.requestRedraw) viewer.requestRedraw();
        let left = n;
        if (typeof viewer.onFrame === 'function') {
          off = viewer.onFrame(function () { if (--left <= 0) done(); });
        } else {
          (function step() { if (--left <= 0) done(); else requestAnimationFrame(step); })();
        }
      });
    }

    // ---- Sequences -------------------------------------------------------

    // shots: [{ name, duration (s), hold (s, static tail), camera (partial,
    // merged onto the previous shot's end camera), ease, arc, orbit,
    // enter(viewer, ctx), update(viewer, u, ctx), leave(viewer, ctx) }]
    // options.start: the camera the first shot starts from (default: the
    // camera at the moment the sequence is first sought).
    function sequence(shots, options) {
      options = options || {};
      const list = shots.map(function (s, i) {
        if (!(s.duration > 0)) throw new Error('shot ' + (s.name || i) + ': duration must be > 0');
        return Object.assign({ name: 'shot ' + (i + 1), hold: 0 }, s);
      });
      let compiled = null;
      let active = -1;
      const ctx = { viewer: viewer, data: options.data || {} };

      function compile() {
        let cam = options.start ? merge(current(), options.start) : current();
        let t = 0;
        compiled = list.map(function (s) {
          const from = cam;
          const to = typeof s.camera === 'function' ? merge(from, s.camera(from)) : merge(from, s.camera);
          // `to` is where the eased move lands; a turntable `orbit` keeps
          // turning linearly on top of it for the whole shot, so the next shot
          // starts from `end`.
          const end = s.orbit ? Object.assign({}, to, { yaw: to.yaw + s.orbit }) : to;
          const out = { shot: s, t0: t, t1: t + s.duration, from: from, to: to, end: end };
          cam = end;
          t += s.duration;
          return out;
        });
      }

      const seq = {
        shots: list,
        get duration() { return list.reduce(function (a, s) { return a + s.duration; }, 0); },
        reset: function () { compiled = null; active = -1; },
        // Put the scene where it belongs at time t (seconds).
        seek: function (t) {
          if (!compiled) compile();
          const total = seq.duration;
          t = Math.max(0, Math.min(total, t));
          let i = compiled.findIndex(function (c) { return t < c.t1; });
          if (i < 0) i = compiled.length - 1;
          const c = compiled[i];
          if (i !== active) {
            if (active >= 0 && compiled[active].shot.leave) compiled[active].shot.leave(viewer, ctx);
            active = i;
            if (c.shot.enter) c.shot.enter(viewer, ctx);
          }
          const moving = c.shot.duration - (c.shot.hold || 0);
          const raw = moving > 0 ? clamp01((t - c.t0) / moving) : 1;
          const u = easing(c.shot.ease)(raw);
          const orbitU = c.shot.orbit ? clamp01((t - c.t0) / c.shot.duration) : 0;
          const cam = interpolate(c.from, c.to, u, { arc: c.shot.arc });
          if (c.shot.orbit) cam.yaw += c.shot.orbit * orbitU;
          apply(cam);
          if (c.shot.update) c.shot.update(viewer, u, ctx, raw);
          return { index: i, name: c.shot.name, u: u };
        },
        // Shot start times, for chapter markers / scrubbers.
        markers: function () {
          if (!compiled) compile();
          return compiled.map(function (c) { return { name: c.shot.name, t: c.t0 }; });
        },
      };
      return seq;
    }

    // Play a sequence in real time. Resolves true when it ran to the end,
    // false when stopped or interrupted by the user (pointer / wheel / key on
    // the canvas when `interruptible`, default true).
    function play(seq, o) {
      o = o || {};
      stop();
      const speed = o.speed > 0 ? o.speed : 1;
      const from = o.from || 0;
      return new Promise(function (resolve) {
        let raf = 0;
        let start = null;
        let done = false;
        function finish(ok) {
          if (done) return;
          done = true;
          cancelAnimationFrame(raf);
          detach();
          playing = null;
          resolve(ok);
        }
        function onInput() { finish(false); }
        function detach() {
          if (!canvas) return;
          ['pointerdown', 'wheel', 'keydown'].forEach(function (e) { canvas.removeEventListener(e, onInput); });
        }
        if (canvas && o.interruptible !== false) {
          ['pointerdown', 'wheel', 'keydown'].forEach(function (e) {
            canvas.addEventListener(e, onInput, { passive: true });
          });
        }
        seq.reset();
        function tick(now) {
          if (start === null) start = now;
          const t = from + (now - start) / 1000 * speed;
          const st = seq.seek(o.loop ? t % seq.duration : t);
          if (o.onTick) o.onTick(t, st);
          if (!o.loop && t >= seq.duration) { finish(true); return; }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);
        playing = { stop: function () { finish(false); } };
      });
    }

    function stop() { if (playing) playing.stop(); }

    function flyTo(camera, o) {
      o = o || {};
      return play(sequence([{ name: 'flyTo', duration: o.duration || 2, camera: camera, ease: o.ease,
                              arc: o.arc, orbit: o.orbit }]), o);
    }

    // Continuous turntable around the current target; returns stop().
    function turntable(o) {
      o = o || {};
      const speed = o.degPerSec || 6;
      let last = null, raf = 0;
      function tick(now) {
        if (last !== null) viewer.setCamera({ yaw: viewer.getCamera().yaw + speed * (now - last) / 1000 });
        last = now;
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
      return function () { cancelAnimationFrame(raf); };
    }

    // ---- Camera paths ----------------------------------------------------

    // A shot that flies a smooth curve through several cameras instead of a
    // straight eased move: a Catmull-Rom spline through each key's target,
    // yaw (the short way round), pitch, field of view and log frame size,
    // so the speed carries through the keys without stopping. Keys are full
    // cameras (getCamera(), P.lookFrom, P.frameBox); a key's `at` (0..1)
    // places it in the shot, otherwise they are evenly spaced. `o` is any
    // shot option (duration, ease (default inOutSine), enter, update, ...).
    // The shot ends on the last key, so the next shot starts there.
    function path(keys, o) {
      o = o || {};
      if (!keys || keys.length < 2) throw new Error('path: needs at least two cameras');
      const k = [];
      keys.forEach(function (c, i) { k.push(merge(i ? k[i - 1] : c, c)); });
      for (let i = 1; i < k.length; i++) k[i].yaw = k[i - 1].yaw + wrap180(k[i].yaw - k[i - 1].yaw);
      const n = k.length;
      const at = keys.map(function (c, i) { return c.at !== undefined ? +c.at : i / (n - 1); });
      const pts = k.map(function (c) {
        return [c.target[0], c.target[1], c.target[2], Math.log(halfHeight(c)), c.yaw, c.pitch, c.fov];
      });
      const cr = function (p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      };
      function cameraAt(u) {
        u = clamp01(u);
        let i = 0;
        while (i < n - 2 && u > at[i + 1]) i++;
        const span = at[i + 1] - at[i];
        const t = span > 0 ? clamp01((u - at[i]) / span) : 1;
        const a = pts[Math.max(i - 1, 0)], b = pts[i], c = pts[i + 1], d = pts[Math.min(i + 2, n - 1)];
        const v = b.map(function (_, j) { return cr(a[j], b[j], c[j], d[j], t); });
        const fov = Math.max(1, Math.min(120, v[6]));
        return {
          target: [v[0], v[1], v[2]],
          fov: fov,
          distance: Math.exp(v[3]) / Math.tan(fov * 0.5 * D2R),
          yaw: v[4],
          pitch: Math.max(-89.9, Math.min(89.9, v[5])),
        };
      }
      const own = o.update;
      return Object.assign({ name: 'path', duration: 8, ease: 'inOutSine' }, o, {
        camera: k[n - 1],
        cameraAt: cameraAt,
        update: function (v, u, ctx, raw) {
          apply(cameraAt(u));
          if (own) own(v, u, ctx, raw);
        },
      });
    }

    // ---- Scene helpers (call from enter/update) --------------------------

    // Lift federated models apart: model i moves up by i × gap × u (federation
    // units, metres by default). sourceIds in stacking order, lowest first.
    function explode(sourceIds, gap, u, base) {
      base = base || 0;
      sourceIds.forEach(function (sid, i) {
        if (sid === null || sid === undefined) return;
        const dz = Math.max(0, i - base) * gap * u;
        if (dz === 0) viewer.clearModelTransform(sid);
        else viewer.setModelTransform(sid, { a: [0, 0, 0], b: [0, 0, dz] });
      });
    }

    // Cross-fade a set of objects to a colour at alpha a (0..1). a >= 1 with
    // no colour restores the model's own colours.
    function tint(ids, color, a) {
      if (!ids || !ids.length) return;
      if (color === null || (a >= 1 && !color)) { viewer.setColor(ids, null); return; }
      const hex = color.replace('#', '').slice(0, 6);
      const alpha = Math.round(Math.max(0.02, Math.min(1, a === undefined ? 1 : a)) * 255);
      viewer.setColor(ids, '#' + hex + alpha.toString(16).padStart(2, '0'));
    }

    // ---- 4D construction -------------------------------------------------

    // Load a construction schedule into the viewer and get shots that play it.
    // data: { tasks: [...] } or the task list itself; each task is
    //   { name, start, finish, kind, effect, color, ids | guids }
    // as viewer.setSchedule takes them (start / finish: Dates, date strings
    // or days). options: { ghost, dropHeight }.
    // Returns
    //   start, finish        the schedule's span (days)
    //   at(t)                show the building at t
    //   activeAt(t)          the tasks running at t (for captions)
    //   dateOf(days)         a Date (or the plain number for numeric schedules)
    //   shot(o)              a sequence shot that runs the schedule from o.from
    //                        to o.to (default: the whole span) over o.duration
    //                        seconds; o.onDate(date, tasks) runs every frame,
    //                        o.camera / o.orbit / o.ease work as in any shot
    //                        (ease defaults to linear, so time runs evenly).
    // Like every shot, it is a pure function of time, so recordFrames renders
    // it frame by frame.
    function schedule(data, options) {
      const raw = Array.isArray(data) ? data : (data && data.tasks) || [];
      const tasks = raw.map(function (t) {
        return Object.assign({}, t, { ids: t.ids || t.guids || [] });
      });
      const numeric = tasks.every(function (t) { return typeof t.start === 'number'; });
      const toDays = function (t) {
        if (typeof t === 'number') return t;
        const ms = (t instanceof Date ? t : new Date(t)).getTime();
        if (!isFinite(ms)) throw new Error('bad schedule date: ' + t);
        return ms / 86400000;
      };
      const span = viewer.setSchedule(tasks, options);
      const spans = tasks.map(function (t) { return [toDays(t.start), toDays(t.finish)]; });
      const api = {
        tasks: tasks,
        start: span.start,
        finish: span.finish,
        dateOf: function (d) { return numeric ? d : new Date(d * 86400000); },
        at: function (t) { viewer.setScheduleTime(toDays(t)); },
        activeAt: function (t) {
          const d = toDays(t);
          return tasks.filter(function (task, i) { return d >= spans[i][0] && d < spans[i][1]; });
        },
        shot: function (o) {
          o = o || {};
          const from = o.from !== undefined ? toDays(o.from) : span.start;
          const to = o.to !== undefined ? toDays(o.to) : span.finish;
          const own = o.update;
          return Object.assign({ name: 'construction', duration: 8, ease: 'linear' }, o, {
            update: function (v, u, ctx, rawU) {
              const d = from + (to - from) * u;
              v.setScheduleTime(d);
              if (o.onDate) o.onDate(api.dateOf(d), api.activeAt(d));
              if (own) own(v, u, ctx, rawU);
            },
          });
        },
      };
      return api;
    }

    // ---- Capture ---------------------------------------------------------

    // One frame of a sequence at time t as a 2D canvas: seek, let it settle,
    // snapshot (o.width, o.height, o.scale, o.samples, o.timeoutMs), then
    // o.overlay(ctx, info) draws on top. info: { t, frame, frames, shot, u,
    // width, height }. Used by recordFrames and recordMp4.
    async function frameCanvas(seq, t, o, info) {
      const st = seq.seek(t);
      await frames(o.settleFrames || 2);
      const blob = await viewer.snapshot({ width: o.width, height: o.height, scale: o.scale,
                                           samples: o.samples, timeoutMs: o.timeoutMs || 30000 });
      const bm = await createImageBitmap(blob);
      const c = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(bm.width, bm.height)
        : Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height });
      const ctx = c.getContext('2d');
      ctx.drawImage(bm, 0, 0);
      if (bm.close) bm.close();
      if (o.overlay) {
        ctx.save();
        o.overlay(ctx, Object.assign({ t: t, shot: st.name, u: st.u, width: c.width, height: c.height }, info));
        ctx.restore();
      }
      return c;
    }

    function canvasBlob(c, type, quality) {
      if (c.convertToBlob) return c.convertToBlob({ type: type, quality: quality });
      return new Promise(function (r) { c.toBlob(r, type, quality); });
    }

    // A caption block for overlays: title, subtitle and an optional small
    // line above them, in a corner of the frame. Sizes follow the frame
    // height, so the same call reads alike at 1080p and 4K.
    //   o: { title, subtitle, kicker, corner ('bottom-left' default,
    //        'bottom-right', 'top-left', 'top-right'), color, background,
    //        font (a family, default Georgia, serif) }
    function caption(ctx, o) {
      o = o || {};
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const u = H / 1080;
      const pad = 28 * u, margin = 48 * u;
      const family = o.font || 'Georgia, "Times New Roman", serif';
      const lines = [];
      if (o.kicker)   lines.push({ text: String(o.kicker).toUpperCase(), size: 18 * u, font: '600 ' + 18 * u + 'px system-ui, sans-serif', gap: 10 * u, alpha: 0.7 });
      if (o.title)    lines.push({ text: String(o.title), size: 44 * u, font: 44 * u + 'px ' + family, gap: 8 * u, alpha: 1 });
      if (o.subtitle) lines.push({ text: String(o.subtitle), size: 24 * u, font: 24 * u + 'px system-ui, sans-serif', gap: 0, alpha: 0.8 });
      if (!lines.length) return;
      let w = 0, h = 0;
      lines.forEach(function (l) { ctx.font = l.font; w = Math.max(w, ctx.measureText(l.text).width); h += l.size + l.gap; });
      const bw = w + 2 * pad, bh = h + 2 * pad;
      const corner = o.corner || 'bottom-left';
      const x = corner.indexOf('right') >= 0 ? W - margin - bw : margin;
      const y = corner.indexOf('top') >= 0 ? margin : H - margin - bh;
      ctx.fillStyle = o.background || 'rgba(20, 18, 16, 0.55)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 10 * u); else ctx.rect(x, y, bw, bh);
      ctx.fill();
      ctx.fillStyle = o.color || '#ffffff';
      ctx.textBaseline = 'top';
      let cy = y + pad;
      lines.forEach(function (l) {
        ctx.font = l.font;
        ctx.globalAlpha = l.alpha;
        ctx.fillText(l.text, x + pad, cy);
        cy += l.size + l.gap;
      });
      ctx.globalAlpha = 1;
    }

    // Render every frame of a sequence through the snapshot path and hand it
    // over as a PNG (or the given type). Deterministic: frame n is seek(n/fps).
    // o.dir: a FileSystemDirectoryHandle (asked for with showDirectoryPicker
    // when omitted and available); otherwise the blobs are returned.
    // o.samples: anti-aliasing renders per frame (see viewer.snapshot).
    // o.overlay(ctx, info): draws captions, dates or legends onto each frame
    // (see frameCanvas and caption).
    async function recordFrames(seq, o) {
      o = o || {};
      stop();
      const fps = o.fps || 30;
      const total = Math.max(1, Math.round(seq.duration * fps) + 1);
      let dir = o.dir;
      if (dir === undefined && o.toDisk !== false && typeof window !== 'undefined' && window.showDirectoryPicker) {
        dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      }
      const prefix = o.prefix || 'frame_';
      const type = o.type || 'image/png';
      const ext = type === 'image/jpeg' ? '.jpg' : type === 'image/webp' ? '.webp' : '.png';
      const blobs = [];
      const from = o.fromFrame || 0, to = Math.min(total, o.toFrame || total);
      seq.reset();
      for (let i = from; i < to; i++) {
        if (o.signal && o.signal.aborted) break;
        let blob;
        if (o.overlay) {
          const c = await frameCanvas(seq, i / fps, o, { frame: i, frames: total });
          blob = await canvasBlob(c, type, o.quality);
        } else {
          seq.seek(i / fps);
          await frames(o.settleFrames || 2);
          blob = await viewer.snapshot({ width: o.width, height: o.height, scale: o.scale, type: type,
                                         quality: o.quality, samples: o.samples,
                                         timeoutMs: o.timeoutMs || 30000 });
        }
        if (dir) {
          const fh = await dir.getFileHandle(prefix + String(i).padStart(5, '0') + ext, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        } else {
          blobs.push(blob);
        }
        if (o.onProgress) o.onProgress(i + 1 - from, to - from);
      }
      return dir ? { frames: to - from, fps: fps, dir: dir.name } : blobs;
    }

    // Offline MP4 (H.264) of a sequence, frame by frame through the snapshot
    // path, so it is deterministic and any size: nothing is dropped however
    // slow a frame is. Needs WebCodecs (Chromium, Safari 17+). Options: fps,
    // width, height (rounded down to even), samples, overlay, bitrate (default
    // 20 Mb/s), keyInterval (seconds, default 2), onProgress(done, total),
    // signal (an AbortSignal). Resolves to a 'video/mp4' Blob.
    // When the output is the canvas's own pixel size and samples <= 1, each
    // frame is taken straight from the drawn canvas (no snapshot readback,
    // no PNG round trip), so recording runs close to the viewer's frame
    // rate. Other sizes and multi-sample frames go through the snapshot path.
    async function recordMp4(seq, o) {
      o = o || {};
      if (typeof VideoEncoder === 'undefined') {
        throw new Error('recordMp4: WebCodecs VideoEncoder is not available in this browser');
      }
      stop();
      const fps = o.fps || 30;
      const total = Math.max(1, Math.round(seq.duration * fps) + 1);
      const cv = canvas || { width: 1920, height: 1080 };
      const even = function (v) { return Math.max(2, Math.floor(v / 2) * 2); };
      const width = even(o.width || (o.height ? o.height * cv.width / cv.height : cv.width));
      const height = even(o.height || width * cv.height / cv.width);
      const fo = Object.assign({}, o, { width: width, height: height });
      const live = canvas && typeof viewer.onFrame === 'function' && !(o.samples > 1)
                && width === canvas.width && height === canvas.height;
      let liveCtx = null;
      if (live) {
        const lc = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width: width, height: height });
        liveCtx = lc.getContext('2d');
      }
      // A WebGPU canvas keeps its image only until the frame is presented,
      // so it is copied inside the frame callback, in the task that drew it.
      function grabNextFrame(skip) {
        return new Promise(function (resolve) {
          let left = skip;
          const off = viewer.onFrame(function () {
            if (left-- > 0) return;
            off();
            liveCtx.drawImage(canvas, 0, 0);
            resolve();
          });
          if (viewer.requestRedraw) viewer.requestRedraw();
        });
      }

      const bitrate = o.bitrate || 20e6;
      const codecs = ['avc1.640034', 'avc1.640033', 'avc1.4d0034', 'avc1.42003e', 'avc1.42001f'];
      let config = null;
      for (const codec of codecs) {
        const c = { codec: codec, width: width, height: height, bitrate: bitrate, framerate: fps,
                    avc: { format: 'avc' } };
        const r = await VideoEncoder.isConfigSupported(c).catch(function () { return null; });
        if (r && r.supported) { config = c; break; }
      }
      if (!config) throw new Error('recordMp4: no H.264 encoder for ' + width + 'x' + height);

      const samples = [];
      let avcC = null, failure = null;
      const enc = new VideoEncoder({
        output: function (chunk, meta) {
          if (meta && meta.decoderConfig && meta.decoderConfig.description) {
            avcC = new Uint8Array(meta.decoderConfig.description);
          }
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          samples.push({ data: data, key: chunk.type === 'key', ts: chunk.timestamp });
        },
        error: function (e) { failure = e; },
      });
      enc.configure(config);
      const keyEvery = Math.max(1, Math.round((o.keyInterval || 2) * fps));
      seq.reset();
      for (let i = 0; i < total; i++) {
        if (failure) throw failure;
        if (o.signal && o.signal.aborted) break;
        let c;
        if (live) {
          // Draw the frame on the canvas itself, then copy it as drawn.
          const st = seq.seek(i / fps);
          await grabNextFrame(o.settleFrames > 0 ? o.settleFrames - 1 : 0);
          if (o.overlay) {
            liveCtx.save();
            o.overlay(liveCtx, { t: i / fps, shot: st.name, u: st.u, width: width, height: height,
                                 frame: i, frames: total });
            liveCtx.restore();
          }
          c = liveCtx.canvas;
        } else {
          c = await frameCanvas(seq, i / fps, fo, { frame: i, frames: total });
        }
        const frame = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / fps),
                                          duration: Math.round(1e6 / fps) });
        enc.encode(frame, { keyFrame: i % keyEvery === 0 });
        frame.close();
        while (enc.encodeQueueSize > 2) await new Promise(function (r) { setTimeout(r, 1); });
        if (o.onProgress) o.onProgress(i + 1, total);
      }
      await enc.flush();
      enc.close();
      if (failure) throw failure;
      if (!avcC) throw new Error('recordMp4: the encoder gave no decoder configuration');
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].ts <= samples[i - 1].ts) throw new Error('recordMp4: reordered frames are not supported');
      }
      return new Blob([muxMp4(samples, avcC, width, height, fps)], { type: 'video/mp4' });
    }

    // Real-time capture of the canvas while the sequence plays. Resolves to a
    // video Blob (WebM by default). Quality follows the canvas size, so size
    // the canvas to the output first (e.g. 1920 × 1080 CSS px at dpr 1).
    async function recordVideo(seq, o) {
      o = o || {};
      if (!canvas || !canvas.captureStream || typeof MediaRecorder === 'undefined') {
        throw new Error('recordVideo: canvas capture is not available in this browser');
      }
      const fps = o.fps || 30;
      const types = [o.mimeType, 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .filter(Boolean);
      const mimeType = types.find(function (t) { return MediaRecorder.isTypeSupported(t); });
      const stream = canvas.captureStream(fps);
      const rec = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: o.bitsPerSecond || 16e6 });
      const chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(function (r) { rec.onstop = r; });
      seq.reset();
      seq.seek(0);
      await frames(3);
      rec.start(250);
      await play(seq, { interruptible: false });
      await frames(2);
      rec.stop();
      await stopped;
      stream.getTracks().forEach(function (t) { t.stop(); });
      return new Blob(chunks, { type: mimeType || 'video/webm' });
    }

    return {
      viewer: viewer,
      camera: current,
      setCamera: apply,
      sequence: sequence,
      play: play,
      stop: stop,
      flyTo: flyTo,
      path: path,
      turntable: turntable,
      explode: explode,
      tint: tint,
      schedule: schedule,
      caption: caption,
      frameCanvas: frameCanvas,
      frames: frames,
      recordFrames: recordFrames,
      recordVideo: recordVideo,
      recordMp4: recordMp4,
      lookFrom: lookFrom,
      frameBox: frameBox,
      interpolate: interpolate,
      ease: EASE,
    };
  }

  root.IfcViewerPresentation = {
    attach: attach,
    lookFrom: lookFrom,
    frameBox: frameBox,
    interpolate: interpolate,
    ease: EASE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
