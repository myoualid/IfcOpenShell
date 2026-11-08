/* @ts-self-types="./ifcview_wasm.d.ts" */

export class GltfConversion {
    static __wrap(ptr) {
        const obj = Object.create(GltfConversion.prototype);
        obj.__wbg_ptr = ptr;
        GltfConversionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GltfConversionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gltfconversion_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get bytes() {
        const ret = wasm.__wbg_get_gltfconversion_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get elementCount() {
        const ret = wasm.__wbg_get_gltfconversion_elementCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get instanceCount() {
        const ret = wasm.__wbg_get_gltfconversion_instanceCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get meshCount() {
        const ret = wasm.__wbg_get_gltfconversion_meshCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get partCount() {
        const ret = wasm.__wbg_get_gltfconversion_partCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {Uint8Array} arg0
     */
    set bytes(arg0) {
        const ptr0 = passArray8ToWasm0(arg0, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.__wbg_set_gltfconversion_bytes(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} arg0
     */
    set elementCount(arg0) {
        wasm.__wbg_set_gltfconversion_elementCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set instanceCount(arg0) {
        wasm.__wbg_set_gltfconversion_instanceCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set meshCount(arg0) {
        wasm.__wbg_set_gltfconversion_meshCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set partCount(arg0) {
        wasm.__wbg_set_gltfconversion_partCount(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) GltfConversion.prototype[Symbol.dispose] = GltfConversion.prototype.free;

/**
 * Collects meshes, elements and instances, then writes one .ifcview.
 * Identical meshes are stored once and shared by their instances.
 */
export class IfcViewBuilder {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IfcViewBuilderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ifcviewbuilder_free(ptr, 0);
    }
    /**
     * Add a selectable element and return its index.
     * @param {string} name
     * @param {string | null} [ifcClass]
     * @param {string | null} [guid]
     * @param {number | null} [ifcId]
     * @returns {number}
     */
    addElement(name, ifcClass, guid, ifcId) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(ifcClass) ? 0 : passStringToWasm0(ifcClass, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(guid) ? 0 : passStringToWasm0(guid, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len2 = WASM_VECTOR_LEN;
        const ret = wasm.ifcviewbuilder_addElement(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, isLikeNone(ifcId) ? Number.MAX_SAFE_INTEGER : (ifcId) >> 0);
        return ret >>> 0;
    }
    /**
     * Place `mesh` for `element` with a column-major 4x4 `transform`.
     * @param {number} mesh
     * @param {number} element
     * @param {Float64Array} transform
     */
    addInstance(mesh, element, transform) {
        const ptr0 = passArrayF64ToWasm0(transform, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ifcviewbuilder_addInstance(this.__wbg_ptr, mesh, element, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Add a mesh whose triangles reference materials, as the IfcOpenShell
     * iterator returns them: `materialColors` holds 4 floats (0..1) per
     * material, `materialIds` one id per triangle. Returns the mesh id,
     * `undefined` for an empty mesh.
     * @param {Float32Array} positions
     * @param {Float32Array} normals
     * @param {Uint32Array} indices
     * @param {Float32Array} material_colors
     * @param {Int32Array} material_ids
     * @returns {number | undefined}
     */
    addMaterialMesh(positions, normals, indices, material_colors, material_ids) {
        const ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(normals, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArrayF32ToWasm0(material_colors, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray32ToWasm0(material_ids, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.ifcviewbuilder_addMaterialMesh(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * Add a mesh with per-vertex colours: xyz positions/normals, rgba8
     * colours, triangle-list indices. Returns the mesh id, `undefined` for
     * an empty mesh. `normals` may be empty.
     * @param {Float32Array} positions
     * @param {Float32Array} normals
     * @param {Uint8Array} colors
     * @param {Uint32Array} indices
     * @returns {number | undefined}
     */
    addMesh(positions, normals, colors, indices) {
        const ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF32ToWasm0(normals, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(colors, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray32ToWasm0(indices, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ret = wasm.ifcviewbuilder_addMesh(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * Drop all meshes, elements and instances.
     */
    clear() {
        wasm.ifcviewbuilder_clear(this.__wbg_ptr);
    }
    /**
     * Serialise to .ifcview bytes. `modelId` is the session model id
     * written in the element table (default 0); `level` the zstd level
     * (default 3; 19 matches the offline baker).
     * @param {number | null} [modelId]
     * @param {number | null} [level]
     * @returns {Uint8Array}
     */
    finish(modelId, level) {
        const ret = wasm.ifcviewbuilder_finish(this.__wbg_ptr, isLikeNone(modelId) ? Number.MAX_SAFE_INTEGER : (modelId) >>> 0, isLikeNone(level) ? Number.MAX_SAFE_INTEGER : (level) >> 0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get instanceCount() {
        const ret = wasm.ifcviewbuilder_instanceCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get meshCount() {
        const ret = wasm.ifcviewbuilder_meshCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.ifcviewbuilder_new();
        this.__wbg_ptr = ret;
        IfcViewBuilderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float64Array} coordinateOperationMeters
     * @param {number} projectLengthToMeters
     * @param {number} mapUnitToMeters
     */
    setGeoref(coordinateOperationMeters, projectLengthToMeters, mapUnitToMeters) {
        const ptr0 = passArrayF64ToWasm0(coordinateOperationMeters, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.ifcviewbuilder_setGeoref(this.__wbg_ptr, ptr0, len0, projectLengthToMeters, mapUnitToMeters);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Quantised vertex bytes of the unique meshes added so far.
     * @returns {number}
     */
    get vertexBytes() {
        const ret = wasm.ifcviewbuilder_vertexBytes(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) IfcViewBuilder.prototype[Symbol.dispose] = IfcViewBuilder.prototype.free;

export class IfcViewSummary {
    static __wrap(ptr) {
        const obj = Object.create(IfcViewSummary.prototype);
        obj.__wbg_ptr = ptr;
        IfcViewSummaryFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IfcViewSummaryFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_ifcviewsummary_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get chunkCount() {
        const ret = wasm.__wbg_get_ifcviewsummary_chunkCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get elementCount() {
        const ret = wasm.__wbg_get_ifcviewsummary_elementCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {boolean}
     */
    get hasGeoref() {
        const ret = wasm.__wbg_get_ifcviewsummary_hasGeoref(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get instanceCount() {
        const ret = wasm.__wbg_get_ifcviewsummary_instanceCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get meshCount() {
        const ret = wasm.__wbg_get_ifcviewsummary_meshCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get triangleCount() {
        const ret = wasm.__wbg_get_ifcviewsummary_triangleCount(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get version() {
        const ret = wasm.__wbg_get_ifcviewsummary_version(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get vertexCount() {
        const ret = wasm.__wbg_get_ifcviewsummary_vertexCount(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set chunkCount(arg0) {
        wasm.__wbg_set_ifcviewsummary_chunkCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set elementCount(arg0) {
        wasm.__wbg_set_ifcviewsummary_elementCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {boolean} arg0
     */
    set hasGeoref(arg0) {
        wasm.__wbg_set_ifcviewsummary_hasGeoref(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set instanceCount(arg0) {
        wasm.__wbg_set_ifcviewsummary_instanceCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set meshCount(arg0) {
        wasm.__wbg_set_ifcviewsummary_meshCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set triangleCount(arg0) {
        wasm.__wbg_set_ifcviewsummary_triangleCount(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set version(arg0) {
        wasm.__wbg_set_ifcviewsummary_version(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set vertexCount(arg0) {
        wasm.__wbg_set_ifcviewsummary_vertexCount(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) IfcViewSummary.prototype[Symbol.dispose] = IfcViewSummary.prototype.free;

/**
 * Convert glTF 2.0 / GLB bytes (e.g. a Blender export) to .ifcview.
 * `onPart(bytes)` is called with partial .ifcview files while converting,
 * each time `partVertexBytes` new vertex bytes are ready (default 4 MiB),
 * so a viewer can stream the model in.
 * @param {Uint8Array} bytes
 * @param {Function | null} [onPart]
 * @param {number | null} [partVertexBytes]
 * @param {number | null} [modelId]
 * @param {number | null} [level]
 * @returns {GltfConversion}
 */
export function convertGltf(bytes, onPart, partVertexBytes, modelId, level) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.convertGltf(ptr0, len0, isLikeNone(onPart) ? 0 : addToExternrefTable0(onPart), !isLikeNone(partVertexBytes), isLikeNone(partVertexBytes) ? 0 : partVertexBytes, isLikeNone(modelId) ? Number.MAX_SAFE_INTEGER : (modelId) >>> 0, isLikeNone(level) ? Number.MAX_SAFE_INTEGER : (level) >> 0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return GltfConversion.__wrap(ret[0]);
}

/**
 * @returns {number}
 */
export function formatVersion() {
    const ret = wasm.formatVersion();
    return ret >>> 0;
}

/**
 * Parse .ifcview bytes and summarise them (validates the layout the same
 * way the viewer does).
 * @param {Uint8Array} data
 * @returns {IfcViewSummary}
 */
export function inspect(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.inspect(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return IfcViewSummary.__wrap(ret[0]);
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_new_from_slice_9a868026ffa4208a: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ifcview_wasm_bg.js": import0,
    };
}

const GltfConversionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gltfconversion_free(ptr, 1));
const IfcViewBuilderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ifcviewbuilder_free(ptr, 1));
const IfcViewSummaryFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_ifcviewsummary_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ifcview_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
