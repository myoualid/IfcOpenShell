// Package-root URLs. This file stays in src/ on purpose: the esbuild bundles
// live in build/, so `../` is the BonsaiWeb root from either import.meta.url.
// Moving it deeper breaks one of those two.
// The path is built at runtime so the bundler does not rewrite it into an asset.
export function fromRoot( path ) {

	const relative = '..' + '/' + String( path ).replace( /^\//, '' );
	return new URL( relative, import.meta.url );

}
