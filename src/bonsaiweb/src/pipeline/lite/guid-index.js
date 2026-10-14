// Scan an IFC STEP file in one pass and emit `expressId → GlobalId` for
// every IfcRoot-derived entity. ifc-lite's MeshData carries `expressId` but
// not the GlobalId, and bonsaiweb's ElementRegistry.findEntity() keys picks
// off `guid` (that is what `byGuid()` consumes against the main-thread
// ifcopenshell instance). Without this map every selection falls through
// and the properties panel stays empty.
//
// We stay out of ifc-lite's wasm parser here on purpose: that would mean
// vendoring @ifc-lite/parser and running a second big parse just to get the
// guid column. STEP's "#N=IfcXxx('<guid>',..." shape is cheap to lift with
// a byte-level regex and we only need the first argument when it IS the
// GlobalId — which is exactly where IFC puts it for every IfcRoot subclass.
//
// The regex is deliberately loose: it matches any `#N=IFCFOO('STR',` with
// a plausible string first argument. Non-root entities whose first arg is
// a label (e.g. `IfcLabel`, `IfcText`) end up in the map too, but
// `ElementRegistry.findEntity()` only queries ids that originated from a
// geometry pick, so stray entries are harmless.

const ENTITY_RE = /#(\d+)\s*=\s*IFC[A-Z][A-Z0-9_]*\s*\(\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g;

// IFC GlobalIds are exactly 22 chars from the base64-like alphabet
// (0-9, A-Z, a-z, `_`, `$`). Anything else that happens to be a string
// first argument isn't a guid and we drop it. This also prunes IFC's
// backslash-escape sequences (which won't appear in a legal guid).
const GUID_SHAPE = /^[0-9A-Za-z_$]{22}$/;

/**
 * @param {Uint8Array} bytes raw IFC STEP file content
 * @returns {Map<number, string>} expressId → GlobalId
 */
export function buildExpressIdToGuidMap( bytes ) {

	// IFC STEP is ASCII with embedded `\X2\...\X0\` escapes for non-ASCII.
	// A naive UTF-8 decode is safe here because we only read the ASCII
	// portions that match our regex; escaped non-ASCII sequences fall inside
	// strings we never dereference.
	const text = typeof bytes === 'string'
		? bytes
		: new TextDecoder( 'latin1' ).decode( bytes );
	const map = new Map();
	ENTITY_RE.lastIndex = 0;
	let m;
	while ( ( m = ENTITY_RE.exec( text ) ) !== null ) {

		const id = Number( m[ 1 ] );
		const guid = m[ 2 ];
		if ( ! GUID_SHAPE.test( guid ) ) continue;
		// First writer wins — if an id ever appears twice (it shouldn't in a
		// valid file) we keep the first guid rather than letting a later
		// non-root label overwrite it.
		if ( ! map.has( id ) ) map.set( id, guid );

	}

	return map;

}
