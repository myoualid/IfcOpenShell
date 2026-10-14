# Viewer goes blank after a resize or window move

## Symptom

After resizing the viewport or moving the browser window, the 3D view goes
blank. It comes back only after clicking inside the viewer.

## Cause

The viewer (`vendor/@ifcopenshell/viewer`) renders on demand. Each
`raf_tick_c` call draws a frame only when a "redraw needed" flag in the native
app struct is set, then clears it.

- Input (mouse, keyboard) and API calls such as `setBackground()` set the flag.
- Each tick also reads the canvas CSS size. When it changes, the tick
  reconfigures the WebGPU surface, which writes `canvas.width`/`height` and
  **clears the bitmap**. That path does not set the flag.
- Moving the window can also clear the bitmap, and the browser fires no event
  for a window move.

The result is a cleared canvas with nothing scheduled to draw into it.

## What `IfcViewer.create()` exposes

There is no `resize()`, `redraw()` or `invalidate()` method. The only hook is
`opts.onFrame(api)`, which runs after every tick.

## Workaround (`src/viewer/host.js`)

In `onFrame`, compare `screenX`, `screenY`, `canvas.width` and `canvas.height`
with the previous frame. If any of them changed, set the redraw flag so the
next tick draws:

```js
const REDRAW_FLAG = 16; // byte offset into the native app struct
module.HEAPU8[module._app_ptr + REDRAW_FLAG] |= 1;
```

- `canvas.width`/`height` change exactly when the surface was reconfigured,
  so a resize is caught at the moment the bitmap is cleared.
- `screenX`/`screenY` catch window moves.
- These are plain property reads with no layout work, so the check costs
  nothing. An extra frame is requested only when something changed.

### Verified in the browser

- `setBackground()` sets byte 16 to 1, and the next tick draws and clears it to 0.
- With the check disabled, resizing the viewport leaves it blank, which
  reproduces the bug.
- With the check enabled, the view redraws at the new size without input.

## Why this needs an upstream fix

Byte 16 is a private struct offset, not a public API. Any change to the
native app struct in a future viewer build can move it. If that happens, the
write silently does nothing, or corrupts a different field.

### Request

Either of these would remove the workaround:

1. **Mark the frame dirty whenever the tick reconfigures the surface**, inside
   the viewer itself. The resize case then fixes itself.
2. **Expose a public redraw call**, for example `api.requestRedraw()` backed by an
   exported `ifcv_request_redraw_c()`. Hosts need it for cases the viewer
   cannot see, such as window moves, tab or occlusion changes, and DOM
   re-parenting.

With option 2, the host code shrinks to:

```js
onFrame( api ) {
	if ( x === screenX && y === screenY && w === canvas.width && h === canvas.height ) return;
	x = screenX; y = screenY; w = canvas.width; h = canvas.height;
	api.requestRedraw();
}
```
