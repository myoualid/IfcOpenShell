// CDN URLs for files that are not JS packages: the viewer scripts, zstd,
// and the worker shim. JS packages resolve through a bundler or the page import map.

const viewer = 'https://cdn.jsdelivr.net/npm/@aeco-dev/viewer@0.1.3/dist/';
const zstd = 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist/';
const fzstd = 'https://cdn.jsdelivr.net/npm/fzstd@latest/esm/';
const shim = 'https://cdn.jsdelivr.net/npm/es-module-shims@2.6.2/dist/';

export const assets = {
	viewerScripts: [ `${ viewer }IfcViewerWeb.js`, `${ viewer }ifcviewer.js` ],
	zstdModule: `${ zstd }index.js`,
	zstdWasm: `${ zstd }wasm-zstd.wasm`,
	fzstdModule: `${ fzstd }index.mjs`,
	shim: `${ shim }es-module-shims.wasm.js`,
};
