/* tslint:disable */
/* eslint-disable */

export class GltfConversion {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    bytes: Uint8Array;
    elementCount: number;
    instanceCount: number;
    meshCount: number;
    partCount: number;
}

/**
 * Collects meshes, elements and instances, then writes one .ifcview.
 * Identical meshes are stored once and shared by their instances.
 */
export class IfcViewBuilder {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Add a selectable element and return its index.
     */
    addElement(name: string, ifcClass?: string | null, guid?: string | null, ifcId?: number | null): number;
    /**
     * Place `mesh` for `element` with a column-major 4x4 `transform`.
     */
    addInstance(mesh: number, element: number, transform: Float64Array): void;
    /**
     * Add a mesh whose triangles reference materials, as the IfcOpenShell
     * iterator returns them: `materialColors` holds 4 floats (0..1) per
     * material, `materialIds` one id per triangle. Returns the mesh id,
     * `undefined` for an empty mesh.
     */
    addMaterialMesh(positions: Float32Array, normals: Float32Array, indices: Uint32Array, material_colors: Float32Array, material_ids: Int32Array): number | undefined;
    /**
     * Add a mesh with per-vertex colours: xyz positions/normals, rgba8
     * colours, triangle-list indices. Returns the mesh id, `undefined` for
     * an empty mesh. `normals` may be empty.
     */
    addMesh(positions: Float32Array, normals: Float32Array, colors: Uint8Array, indices: Uint32Array): number | undefined;
    /**
     * Drop all meshes, elements and instances.
     */
    clear(): void;
    /**
     * Serialise to .ifcview bytes. `modelId` is the session model id
     * written in the element table (default 0); `level` the zstd level
     * (default 3; 19 matches the offline baker).
     */
    finish(modelId?: number | null, level?: number | null): Uint8Array;
    constructor();
    setGeoref(coordinateOperationMeters: Float64Array, projectLengthToMeters: number, mapUnitToMeters: number): void;
    readonly instanceCount: number;
    readonly meshCount: number;
    /**
     * Quantised vertex bytes of the unique meshes added so far.
     */
    readonly vertexBytes: number;
}

export class IfcViewSummary {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    chunkCount: number;
    elementCount: number;
    hasGeoref: boolean;
    instanceCount: number;
    meshCount: number;
    triangleCount: number;
    version: number;
    vertexCount: number;
}

/**
 * Convert glTF 2.0 / GLB bytes (e.g. a Blender export) to .ifcview.
 * `onPart(bytes)` is called with partial .ifcview files while converting,
 * each time `partVertexBytes` new vertex bytes are ready (default 4 MiB),
 * so a viewer can stream the model in.
 */
export function convertGltf(bytes: Uint8Array, onPart?: Function | null, partVertexBytes?: number | null, modelId?: number | null, level?: number | null): GltfConversion;

export function formatVersion(): number;

/**
 * Parse .ifcview bytes and summarise them (validates the layout the same
 * way the viewer does).
 */
export function inspect(data: Uint8Array): IfcViewSummary;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_gltfconversion_bytes: (a: number) => [number, number];
    readonly __wbg_get_gltfconversion_elementCount: (a: number) => number;
    readonly __wbg_get_gltfconversion_instanceCount: (a: number) => number;
    readonly __wbg_get_gltfconversion_meshCount: (a: number) => number;
    readonly __wbg_get_gltfconversion_partCount: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_chunkCount: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_elementCount: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_hasGeoref: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_instanceCount: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_meshCount: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_triangleCount: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_version: (a: number) => number;
    readonly __wbg_get_ifcviewsummary_vertexCount: (a: number) => number;
    readonly __wbg_gltfconversion_free: (a: number, b: number) => void;
    readonly __wbg_ifcviewbuilder_free: (a: number, b: number) => void;
    readonly __wbg_ifcviewsummary_free: (a: number, b: number) => void;
    readonly __wbg_set_gltfconversion_bytes: (a: number, b: number, c: number) => void;
    readonly __wbg_set_gltfconversion_elementCount: (a: number, b: number) => void;
    readonly __wbg_set_gltfconversion_instanceCount: (a: number, b: number) => void;
    readonly __wbg_set_gltfconversion_meshCount: (a: number, b: number) => void;
    readonly __wbg_set_gltfconversion_partCount: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_chunkCount: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_elementCount: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_hasGeoref: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_instanceCount: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_meshCount: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_triangleCount: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_version: (a: number, b: number) => void;
    readonly __wbg_set_ifcviewsummary_vertexCount: (a: number, b: number) => void;
    readonly convertGltf: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly formatVersion: () => number;
    readonly ifcviewbuilder_addElement: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly ifcviewbuilder_addInstance: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly ifcviewbuilder_addMaterialMesh: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => number;
    readonly ifcviewbuilder_addMesh: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly ifcviewbuilder_clear: (a: number) => void;
    readonly ifcviewbuilder_finish: (a: number, b: number, c: number) => [number, number, number, number];
    readonly ifcviewbuilder_instanceCount: (a: number) => number;
    readonly ifcviewbuilder_meshCount: (a: number) => number;
    readonly ifcviewbuilder_new: () => number;
    readonly ifcviewbuilder_setGeoref: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly ifcviewbuilder_vertexBytes: (a: number) => number;
    readonly inspect: (a: number, b: number) => [number, number, number];
    readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
    readonly rust_zstd_wasm_shim_free: (a: number) => void;
    readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
    readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
    readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
