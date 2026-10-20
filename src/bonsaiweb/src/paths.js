// Directories for files that are not JS packages: the viewer scripts, zstd,
// and the worker shim. JS packages resolve through a bundler or the page import map.

export const defaultPaths = {
	viewer: 'https://cdn.jsdelivr.net/npm/@aeco-dev/viewer@0.1.3/dist',
	zstd: 'https://cdn.jsdelivr.net/npm/@ioai/wasm-zstd@latest/dist',
	fzstd: 'https://cdn.jsdelivr.net/npm/fzstd@latest/esm',
	shim: 'https://cdn.jsdelivr.net/npm/es-module-shims@2.6.2/dist',
};
