# Viewer redraw after a resize or window move

## Background

The viewer (`@aeco-dev/viewer`) renders on demand. Each `raf_tick_c` call
draws a frame only when something asked for one.

- Input (mouse, keyboard) and API calls such as `setBackground()` ask for a
  frame.
- Each tick reads the canvas CSS size. When it changes, the tick reconfigures
  the WebGPU surface, which writes `canvas.width`/`height` and clears the
  bitmap. The viewer then draws the new size in that same tick.
- Moving the window can also clear the bitmap. The browser fires no event for
  a window move, so the viewer cannot see it.

## What the host does (`src/tool/Viewer.js`)

In `onFrame`, compare `screenX` and `screenY` with the previous frame and call
`api.requestRedraw()` when either changed:

```js
onFrame( api ) {
	if ( x === screenX && y === screenY ) return;
	x = screenX; y = screenY;
	api.requestRedraw();
}
```

- These are plain property reads with no layout work, so the check costs a
  few microseconds per frame.
- Do not also compare `canvas.width`/`height`. The viewer already redraws on
  resize, so a size check draws every resize twice.
- `requestRedraw()` calls within one frame coalesce into a single draw. Use it
  for any other case the viewer cannot see, such as DOM re-parenting.

## History

Viewer 0.1.0 did not redraw after reconfiguring the surface and had no redraw
call. The host set a private byte in the native app struct
(`HEAPU8[_app_ptr + 16]`) whenever `canvas.width`/`height` or the window
position changed. That drew one frame late, so every resize presented one
blank frame, and the offset could move in any later build.

Measured on the sample model over 60 resizes, from the `viewportResized`
callback to the first draw:

| Build | Delay | Blank frames |
|---|---|---|
| 0.1.0 + byte-16 hack | ~17 ms (1 frame) | 60 of 60 |
| redraw build | same frame | 0 |
