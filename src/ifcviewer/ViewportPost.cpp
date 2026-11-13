/********************************************************************************
 *                                                                              *
 * This file is part of IfcOpenShell.                                           *
 *                                                                              *
 * IfcOpenShell is free software: you can redistribute it and/or modify         *
 * it under the terms of the Lesser GNU General Public License as published by  *
 * the Free Software Foundation, either version 3.0 of the License, or          *
 * (at your option) any later version.                                          *
 *                                                                              *
 * IfcOpenShell is distributed in the hope that it will be useful,              *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of               *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the                 *
 * Lesser GNU General Public License for more details.                          *
 *                                                                              *
 * You should have received a copy of the Lesser GNU General Public License     *
 * along with this program. If not, see <http://www.gnu.org/licenses/>.         *
 *                                                                              *
 ********************************************************************************/

// This file was generated with the assistance of an AI coding tool.

// Render modes and the post-processing chain that serves them: feature edges
// and screen-space ambient occlusion over a G-buffer drawn by the pick
// pipeline. See the comment on setRenderMode in ViewportCore.h.

#include "ViewportCore.h"

#include "Log.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace {

WGPUStringView postLabel(const char* s) {
    return WGPUStringView{ s, std::strlen(s) };
}

inline float srgbToLinear(float c) {
    return (c <= 0.04045f) ? (c * (1.0f / 12.92f))
                           : std::pow((c + 0.055f) * (1.0f / 1.055f), 2.4f);
}

// Matches the WGSL `Post` struct below.
struct PostUniforms {
    float view_proj[16];
    float eye[4];          // xyz = camera position, w = 1 when orthographic
    float view_dir[4];     // xyz = unit forward; view depth = dot(p - eye, fwd)
    float edge_color[4];   // rgb = linear line colour, a = opacity
    float edge_params[4];  // x = sample offset px, y = cos(crease angle), z = plane tolerance,
                           // w = world size of one pixel (at unit depth if perspective)
    float ao_params[4];    // x = radius (world), y = intensity, z = bias (fraction of radius)
    float misc[4];         // x = 1 / accumulated line samples
};
static_assert(sizeof(PostUniforms) == (16 + 6 * 4) * sizeof(float),
              "PostUniforms must match the WGSL layout");

constexpr WGPUTextureFormat kAoFormat = WGPUTextureFormat_R8Unorm;
constexpr WGPUTextureFormat kLineAccumFormat = WGPUTextureFormat_R16Float;

// Supersampled feature lines: G-buffer samples at these sub-pixel offsets
// (pixels; sample 0 unjittered, then Halton 2,3), their line masks summed.
// Interactive frames add one sample per frame while the view holds still and
// show FXAA until kLineMinResolved samples are in; a snapshot tile takes
// kSnapshotLineSamples at once.
constexpr int kLineMinResolved     = 4;
constexpr int kSnapshotLineSamples = 8;
static_assert(ViewportCore::kLineSamples == 16, "offset table below has 16 entries");
constexpr float kLineJitter[16][2] = {
    {  0.0f,     0.0f    }, {  0.0f,    -0.1667f }, { -0.25f,    0.1667f }, {  0.25f,   -0.3889f },
    { -0.375f,  -0.0556f }, {  0.125f,   0.2778f }, { -0.125f,  -0.2778f }, {  0.375f,   0.0556f },
    { -0.4375f,  0.3889f }, {  0.0625f, -0.463f  }, { -0.1875f, -0.1296f }, {  0.3125f,  0.2037f },
    { -0.3125f, -0.3519f }, {  0.1875f,  0.0185f }, { -0.0625f,  0.3519f }, {  0.4375f, -0.2407f },
};

const char* POST_WGSL = R"(
struct Post {
    view_proj:   mat4x4<f32>,
    eye:         vec4<f32>,
    view_dir:    vec4<f32>,
    edge_color:  vec4<f32>,
    edge_params: vec4<f32>,
    ao_params:   vec4<f32>,
    misc:        vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Post;
// G-buffer, from the pick pass: element id (0 = nothing drawn), world
// normal packed as n * 0.5 + 0.5, world position.
@group(0) @binding(1) var t_id:     texture_2d<u32>;
@group(0) @binding(2) var t_normal: texture_2d<f32>;
@group(0) @binding(3) var t_pos:    texture_2d<f32>;
// Half-size AO: the raw term for the blur, the blurred term for the
// composite (each pass binds the target it is not writing).
@group(0) @binding(4) var t_ao:     texture_2d<f32>;
@group(0) @binding(5) var s_ao:     sampler;

@vertex
fn vs_full(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
    let x = f32((vid << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vid & 2u) * 2.0 - 1.0;
    return vec4<f32>(x, y, 0.0, 1.0);
}

fn viewDepth(p: vec3<f32>) -> f32 {
    return dot(p - u.eye.xyz, u.view_dir.xyz);
}

fn loadNormal(p: vec2<i32>) -> vec3<f32> {
    return normalize(textureLoad(t_normal, p, 0).xyz * 2.0 - vec3<f32>(1.0));
}

// Feature edges, drawn on the nearer side of each discontinuity so a line
// is one sample wide rather than one on each side:
//   * the element changes (or the background starts) — outlines per element;
//   * the same element steps off the centre's plane — its silhouette over
//     itself; testing the plane rather than raw depth keeps grazing faces
//     clean;
//   * the surface folds by more than the crease angle (forward neighbours
//     only, so a crease is one sample wide too).
fn isEdge(p: vec2<i32>) -> bool {
    let dim = vec2<i32>(textureDimensions(t_id));
    let id_c = textureLoad(t_id, p, 0).x;
    if (id_c == 0u) { return false; }
    let pc = textureLoad(t_pos, p, 0).xyz;
    let nc = loadNormal(p);
    let dc = viewDepth(pc);
    let r = max(i32(u.edge_params.x + 0.5), 1);
    let crease_cos = u.edge_params.y;
    let plane_tol = u.edge_params.z * max(dc, 1e-3);
    var offs = array<vec2<i32>, 4>(vec2<i32>(r, 0), vec2<i32>(0, r),
                                   vec2<i32>(-r, 0), vec2<i32>(0, -r));
    var edge = false;
    for (var i = 0; i < 4; i = i + 1) {
        let q = clamp(p + offs[i], vec2<i32>(0), dim - vec2<i32>(1));
        let id_q = textureLoad(t_id, q, 0).x;
        if (id_q == 0u) { edge = true; break; }
        let pq = textureLoad(t_pos, q, 0).xyz;
        let dq = viewDepth(pq);
        if (id_q != id_c) {
            // Two elements meeting. Where one is clearly in front, the line
            // goes on its side. Where they are level (a wall standing on a
            // slab, panels butting), "nearer" flips from pixel to pixel with
            // depth noise and the line zigzags between the two sides; there
            // the higher id takes it, so the line stays on one side. Level
            // means within two pixel footprints of depth, widened for faces
            // seen at a grazing angle, and judged the same from both pixels.
            let slope = 1.0 / max(min(abs(dot(nc, u.view_dir.xyz)),
                                      abs(dot(loadNormal(q), u.view_dir.xyz))), 0.15);
            let px_world = select(u.edge_params.w * max(dc, 1e-3), u.edge_params.w, u.eye.w > 0.5);
            let level_tol = 2.0 * px_world * slope;
            if (dc < dq - level_tol || (abs(dc - dq) <= level_tol && id_c > id_q)) {
                edge = true;
                break;
            }
            continue;
        }
        if (abs(dot(pq - pc, nc)) > plane_tol && dc < dq) { edge = true; break; }
        if (i < 2 && dot(nc, loadNormal(q)) < crease_cos) { edge = true; break; }
    }
    return edge;
}

// Aliased lines straight onto the image (antialias off).
@fragment
fn fs_edges(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    if (!isEdge(vec2<i32>(frag.xy))) { discard; }
    let a = u.edge_color.a;
    return vec4<f32>(u.edge_color.rgb * a, a);
}

// Antialias on: the same test into a coverage mask (cleared to 0)...
@fragment
fn fs_edge_mask(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    if (!isEdge(vec2<i32>(frag.xy))) { discard; }
    return vec4<f32>(1.0);
}

// ...then FXAA (3.11 quality structure) over the mask alone, bound in the
// t_ao slot. The scene is already multisampled; only the lines, which come
// from the single-sample G-buffer, need smoothing. The filtered mask is the
// line's coverage.
fn maskAt(uv: vec2<f32>) -> f32 {
    return textureSampleLevel(t_ao, s_ao, uv, 0.0).r;
}

fn fxaaMask(uv: vec2<f32>, px: vec2<f32>) -> f32 {
    let m  = maskAt(uv);
    let n  = maskAt(uv + vec2<f32>(0.0, -px.y));
    let s  = maskAt(uv + vec2<f32>(0.0,  px.y));
    let e  = maskAt(uv + vec2<f32>( px.x, 0.0));
    let w  = maskAt(uv + vec2<f32>(-px.x, 0.0));
    let hi = max(m, max(max(n, s), max(e, w)));
    let lo = min(m, min(min(n, s), min(e, w)));
    let range = hi - lo;
    if (range < max(0.0312, 0.063 * hi)) { return m; }
    let ne = maskAt(uv + vec2<f32>( px.x, -px.y));
    let nw = maskAt(uv + vec2<f32>(-px.x, -px.y));
    let se = maskAt(uv + vec2<f32>( px.x,  px.y));
    let sw = maskAt(uv + vec2<f32>(-px.x,  px.y));

    // Sub-pixel aliasing: how far the centre is from its neighbourhood.
    var sub = (2.0 * (n + s + e + w) + ne + nw + se + sw) / 12.0;
    sub = smoothstep(0.0, 1.0, clamp(abs(sub - m) / range, 0.0, 1.0));
    let blend_sub = sub * sub * 0.75;

    // Edge orientation, and which side of it the centre blends toward.
    let horz = 2.0 * abs(n + s - 2.0 * m) + abs(ne + se - 2.0 * e) + abs(nw + sw - 2.0 * w);
    let vert = 2.0 * abs(e + w - 2.0 * m) + abs(ne + nw - 2.0 * n) + abs(se + sw - 2.0 * s);
    let is_h = horz >= vert;
    let p_lum = select(e, s, is_h);
    let n_lum = select(w, n, is_h);
    let p_grad = abs(p_lum - m);
    let n_grad = abs(n_lum - m);
    var step_len = select(px.x, px.y, is_h);
    var opp = p_lum;
    var grad = p_grad;
    if (p_grad < n_grad) { step_len = -step_len; opp = n_lum; grad = n_grad; }

    // Walk along the edge both ways to its ends.
    var uv_edge = uv;
    if (is_h) { uv_edge.y = uv_edge.y + step_len * 0.5; } else { uv_edge.x = uv_edge.x + step_len * 0.5; }
    let edge_step = select(vec2<f32>(0.0, px.y), vec2<f32>(px.x, 0.0), is_h);
    let edge_lum = (m + opp) * 0.5;
    let thresh = grad * 0.25;
    var steps = array<f32, 10>(1.0, 1.5, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 4.0);
    var puv = uv_edge + edge_step * steps[0];
    var p_delta = maskAt(puv) - edge_lum;
    var p_end = abs(p_delta) >= thresh;
    for (var i = 1; i < 10 && !p_end; i = i + 1) {
        puv = puv + edge_step * steps[i];
        p_delta = maskAt(puv) - edge_lum;
        p_end = abs(p_delta) >= thresh;
    }
    if (!p_end) { puv = puv + edge_step * 8.0; }
    var nuv = uv_edge - edge_step * steps[0];
    var n_delta = maskAt(nuv) - edge_lum;
    var n_end = abs(n_delta) >= thresh;
    for (var i = 1; i < 10 && !n_end; i = i + 1) {
        nuv = nuv - edge_step * steps[i];
        n_delta = maskAt(nuv) - edge_lum;
        n_end = abs(n_delta) >= thresh;
    }
    if (!n_end) { nuv = nuv - edge_step * 8.0; }
    let p_dist = select(puv.y - uv.y, puv.x - uv.x, is_h);
    let n_dist = select(uv.y - nuv.y, uv.x - nuv.x, is_h);
    var shortest = n_dist;
    var delta_sign = n_delta >= 0.0;
    if (p_dist <= n_dist) { shortest = p_dist; delta_sign = p_delta >= 0.0; }
    var blend_edge = 0.0;
    if (delta_sign != (m - edge_lum >= 0.0)) {
        blend_edge = 0.5 - shortest / (p_dist + n_dist);
    }
    let b = max(blend_sub, blend_edge);
    var fuv = uv;
    if (is_h) { fuv.y = fuv.y + step_len * b; } else { fuv.x = fuv.x + step_len * b; }
    return maskAt(fuv);
}

// Supersampled lines: each jittered sample's mask is added into the
// accumulator (additive blend), and the resolve divides by the count.
@fragment
fn fs_edge_accum(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    return vec4<f32>(textureLoad(t_ao, vec2<i32>(frag.xy), 0).r);
}

@fragment
fn fs_edge_resolve(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let cov = textureLoad(t_ao, vec2<i32>(frag.xy), 0).r * u.misc.x;
    if (cov <= 0.002) { discard; }
    let a = pow(min(cov, 1.0), 1.0 / 2.2) * u.edge_color.a;
    return vec4<f32>(u.edge_color.rgb * a, a);
}

@fragment
fn fs_edge_aa(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let px = 1.0 / vec2<f32>(textureDimensions(t_ao));
    let cov = fxaaMask(frag.xy * px, px);
    if (cov <= 0.002) { discard; }
    // Coverage is blended in linear light, where half-covered black over
    // white reads as a pale grey; lift it perceptually (as text renderers
    // do) so a smoothed line keeps the weight of the aliased one.
    let a = pow(cov, 1.0 / 2.2) * u.edge_color.a;
    return vec4<f32>(u.edge_color.rgb * a, a);
}

// Hemisphere SSAO at half resolution. Samples are spread over a
// cosine-weighted hemisphere around the normal, rotated per pixel by
// interleaved gradient noise (the blur removes the pattern). A sample is
// occluded when the surface stored where it projects is in front of it by
// more than the bias, weighted down when that surface is far outside the
// radius so distant occluders do not halo.
@fragment
fn fs_ao(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let dim = vec2<i32>(textureDimensions(t_id));
    let p = min(vec2<i32>(frag.xy) * 2, dim - vec2<i32>(1));
    if (textureLoad(t_id, p, 0).x == 0u) { return vec4<f32>(1.0); }
    let P = textureLoad(t_pos, p, 0).xyz;
    let N = loadNormal(p);
    let dP = viewDepth(P);
    let radius = u.ao_params.x;
    let bias = u.ao_params.z * radius;
    let up = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(N.z) > 0.9);
    let T = normalize(cross(up, N));
    let B = cross(N, T);
    let noise = fract(52.9829189 * fract(dot(frag.xy, vec2<f32>(0.06711056, 0.00583715))));
    let fdim = vec2<f32>(dim);
    let K = 12;
    var occ = 0.0;
    for (var i = 0; i < K; i = i + 1) {
        let fi = (f32(i) + 0.5) / f32(K);
        let phi = 6.2831853 * fract(f32(i) * 0.6180339 + noise);
        let rad = sqrt(fi);
        let dir = vec3<f32>(rad * cos(phi), rad * sin(phi), sqrt(1.0 - fi));
        let scale = mix(0.15, 1.0, fract(fi * 5.0 + noise));
        let S = P + (T * dir.x + B * dir.y + N * dir.z) * (radius * scale);
        let clip = u.view_proj * vec4<f32>(S, 1.0);
        if (clip.w <= 1e-5) { continue; }
        let ndc = clip.xy / clip.w;
        let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
        if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) { continue; }
        let q = vec2<i32>(uv * fdim);
        if (textureLoad(t_id, q, 0).x == 0u) { continue; }
        let dQ = viewDepth(textureLoad(t_pos, q, 0).xyz);
        if (dQ < viewDepth(S) - bias) {
            occ = occ + smoothstep(0.0, 1.0, radius / max(abs(dP - dQ), 1e-4));
        }
    }
    let ao = clamp(1.0 - u.ao_params.y * occ / f32(K), 0.0, 1.0);
    return vec4<f32>(ao, 0.0, 0.0, 1.0);
}

// 5x5 depth-aware blur of the raw AO, still at half resolution. Neighbours
// on another surface (by view depth) or on the background barely count, so
// occlusion does not bleed across silhouettes.
@fragment
fn fs_ao_blur(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let dim = vec2<i32>(textureDimensions(t_id));
    let dim_ao = vec2<i32>(textureDimensions(t_ao));
    let p = vec2<i32>(frag.xy);
    let pf = min(p * 2, dim - vec2<i32>(1));
    if (textureLoad(t_id, pf, 0).x == 0u) { return vec4<f32>(1.0); }
    let dc = viewDepth(textureLoad(t_pos, pf, 0).xyz);
    let tol = 0.02 * max(dc, 1e-3);
    var sum = 0.0;
    var wsum = 0.0;
    for (var y = -2; y <= 2; y = y + 1) {
        for (var x = -2; x <= 2; x = x + 1) {
            let q = clamp(p + vec2<i32>(x, y), vec2<i32>(0), dim_ao - vec2<i32>(1));
            let qf = min(q * 2, dim - vec2<i32>(1));
            if (textureLoad(t_id, qf, 0).x == 0u) { continue; }
            let dq = viewDepth(textureLoad(t_pos, qf, 0).xyz);
            let w = exp(-abs(dq - dc) / tol);
            sum = sum + textureLoad(t_ao, q, 0).x * w;
            wsum = wsum + w;
        }
    }
    return vec4<f32>(select(1.0, sum / wsum, wsum > 0.0), 0.0, 0.0, 1.0);
}

// Multiply the blurred AO over the drawn surface (premultiplied black-over:
// dst * ao on an opaque target). The background is left alone.
@fragment
fn fs_ao_composite(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let p = vec2<i32>(frag.xy);
    if (textureLoad(t_id, p, 0).x == 0u) { discard; }
    let uv = frag.xy / vec2<f32>(textureDimensions(t_id));
    let ao = textureSampleLevel(t_ao, s_ao, uv, 0.0).x;
    return vec4<f32>(0.0, 0.0, 0.0, 1.0 - ao);
}
)";

} // namespace

// ---------------------------------------------------------------------------
// Settings and presets
// ---------------------------------------------------------------------------

void ViewportCore::setShading(const ShadingSettings& s) {
    shading_ = s;
    line_accum_count_ = 0;
    host_->requestFrame();
}

void ViewportCore::setEdges(const EdgeSettings& e) {
    edge_settings_ = e;
    line_accum_count_ = 0;
    edges_enabled_ = e.enabled;
    host_->requestFrame();
}

void ViewportCore::setAmbientOcclusion(const AoSettings& a) {
    ao_settings_ = a;
    line_accum_count_ = 0;
    host_->requestFrame();
}

void ViewportCore::setRenderMode(RenderMode mode) {
    ShadingSettings sh;   // defaults: model colours, legacy lighting
    EdgeSettings    ed;   // defaults: soft depth edges
    AoSettings      ao;   // defaults: off
    switch (mode) {
    case RenderMode::Shaded:
    case RenderMode::Xray:
        break;
    case RenderMode::ShadedEdges:
        ed.mode    = EdgeMode::Feature;
        ed.opacity = 0.8f;
        break;
    case RenderMode::Technical:
        sh.surface = SurfaceStyle::Technical;
        sh.base_color[0] = sh.base_color[1] = sh.base_color[2] = 1.0f;
        ed.mode = EdgeMode::Feature;
        break;
    case RenderMode::Clay:
        sh.surface = SurfaceStyle::Clay;
        sh.base_color[0] = sh.base_color[1] = sh.base_color[2] = 0.86f;
        sh.linear   = true;
        sh.tone_map = ToneMap::Aces;
        sh.exposure = 1.0f;
        sh.key_intensity     = 1.2f;
        sh.fill_intensity    = 0.2f;
        sh.ambient_intensity = 0.8f;
        ao.enabled   = true;
        ao.intensity = 1.5f;
        break;
    }
    shading_       = sh;
    edge_settings_ = ed;
    edges_enabled_ = ed.enabled;
    ao_settings_   = ao;
    render_mode_   = mode;
    line_accum_count_ = 0;
    if ((mode == RenderMode::Xray) != xrayActive()) toggleXray();
    host_->requestFrame();
}

// ---------------------------------------------------------------------------
// Pipelines and targets
// ---------------------------------------------------------------------------

bool ViewportCore::buildPostPipelines() {
    WGPUBindGroupLayoutEntry e[6] = {};
    e[0].binding = 0;
    e[0].visibility = WGPUShaderStage_Fragment;
    e[0].buffer.type = WGPUBufferBindingType_Uniform;
    e[0].buffer.minBindingSize = sizeof(PostUniforms);
    const WGPUTextureSampleType sample_types[4] = {
        WGPUTextureSampleType_Uint,               // id
        WGPUTextureSampleType_UnfilterableFloat,  // normal
        WGPUTextureSampleType_UnfilterableFloat,  // position (RGBA32F)
        WGPUTextureSampleType_Float,              // AO, sampled bilinearly
    };
    for (int i = 0; i < 4; ++i) {
        e[1 + i].binding = std::uint32_t(1 + i);
        e[1 + i].visibility = WGPUShaderStage_Fragment;
        e[1 + i].texture.sampleType    = sample_types[i];
        e[1 + i].texture.viewDimension = WGPUTextureViewDimension_2D;
    }
    e[5].binding = 5;
    e[5].visibility = WGPUShaderStage_Fragment;
    e[5].sampler.type = WGPUSamplerBindingType_Filtering;

    WGPUBindGroupLayoutDescriptor bgl_desc = {};
    bgl_desc.entryCount = 6;
    bgl_desc.entries    = e;
    bgl_desc.label      = postLabel("ifcviewer-wgpu.post_bgl");
    post_bgl_ = wgpuDeviceCreateBindGroupLayout(device_, &bgl_desc);

    WGPUPipelineLayoutDescriptor pl_desc = {};
    pl_desc.bindGroupLayoutCount = 1;
    pl_desc.bindGroupLayouts     = &post_bgl_;
    pl_desc.label                = postLabel("ifcviewer-wgpu.post_pipeline_layout");
    post_pipeline_layout_ = wgpuDeviceCreatePipelineLayout(device_, &pl_desc);

    WGPUShaderSourceWGSL wgsl_src = {};
    wgsl_src.chain.sType = WGPUSType_ShaderSourceWGSL;
    wgsl_src.code        = postLabel(POST_WGSL);
    WGPUShaderModuleDescriptor sm_desc = {};
    sm_desc.nextInChain = &wgsl_src.chain;
    sm_desc.label       = postLabel("ifcviewer-wgpu.post_wgsl");
    post_shader_module_ = wgpuDeviceCreateShaderModule(device_, &sm_desc);

    // Premultiplied over, as the depth-edge pass: identical darkening on an
    // opaque target, and coverage that survives a transparent clear.
    WGPUBlendState over = {};
    over.color.srcFactor = WGPUBlendFactor_One;
    over.color.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
    over.color.operation = WGPUBlendOperation_Add;
    over.alpha = over.color;

    auto make = [&](const char* entry, WGPUTextureFormat format, bool blend,
                    const char* label) -> WGPURenderPipeline {
        WGPUColorTargetState target = {};
        target.format    = format;
        target.blend     = blend ? &over : nullptr;
        target.writeMask = WGPUColorWriteMask_All;
        WGPUFragmentState frag = {};
        frag.module      = post_shader_module_;
        frag.entryPoint  = postLabel(entry);
        frag.targetCount = 1;
        frag.targets     = &target;
        WGPURenderPipelineDescriptor rp = {};
        rp.layout             = post_pipeline_layout_;
        rp.label              = postLabel(label);
        rp.vertex.module      = post_shader_module_;
        rp.vertex.entryPoint  = postLabel("vs_full");
        rp.fragment           = &frag;
        rp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
        rp.primitive.cullMode = WGPUCullMode_None;
        rp.multisample.count  = 1;
        rp.multisample.mask   = 0xFFFFFFFFu;
        return wgpuDeviceCreateRenderPipeline(device_, &rp);
    };
    feature_edge_pipeline_ = make("fs_edges", surface_view_format_, true,
                                  "ifcviewer-wgpu.feature_edge_pipeline");
    edge_mask_pipeline_    = make("fs_edge_mask", kAoFormat, false, "ifcviewer-wgpu.edge_mask_pipeline");
    edge_aa_pipeline_      = make("fs_edge_aa", surface_view_format_, true,
                                  "ifcviewer-wgpu.edge_aa_pipeline");
    edge_resolve_pipeline_ = make("fs_edge_resolve", surface_view_format_, true,
                                  "ifcviewer-wgpu.edge_resolve_pipeline");
    {
        // Additive into the float accumulator.
        WGPUBlendState add = {};
        add.color.srcFactor = WGPUBlendFactor_One;
        add.color.dstFactor = WGPUBlendFactor_One;
        add.color.operation = WGPUBlendOperation_Add;
        add.alpha = add.color;
        WGPUColorTargetState target = {};
        target.format    = kLineAccumFormat;
        target.blend     = &add;
        target.writeMask = WGPUColorWriteMask_All;
        WGPUFragmentState frag = {};
        frag.module      = post_shader_module_;
        frag.entryPoint  = postLabel("fs_edge_accum");
        frag.targetCount = 1;
        frag.targets     = &target;
        WGPURenderPipelineDescriptor rp = {};
        rp.layout             = post_pipeline_layout_;
        rp.label              = postLabel("ifcviewer-wgpu.edge_accum_pipeline");
        rp.vertex.module      = post_shader_module_;
        rp.vertex.entryPoint  = postLabel("vs_full");
        rp.fragment           = &frag;
        rp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
        rp.primitive.cullMode = WGPUCullMode_None;
        rp.multisample.count  = 1;
        rp.multisample.mask   = 0xFFFFFFFFu;
        edge_accum_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &rp);
    }
    // One frame-uniform copy per line sample: the G-buffer pass binds the
    // jittered copy, so the main pass and the sample share an encoder.
    for (int i = 0; i < kLineSamples; ++i) {
        WGPUBufferDescriptor jb = {};
        jb.size  = sizeof(FrameUniforms);
        jb.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
        jb.label = postLabel("ifcviewer-wgpu.line_sample_uniforms");
        line_sample_uniforms_[i] = wgpuDeviceCreateBuffer(device_, &jb);
    }
    ao_pipeline_           = make("fs_ao", kAoFormat, false, "ifcviewer-wgpu.ao_pipeline");
    ao_blur_pipeline_      = make("fs_ao_blur", kAoFormat, false, "ifcviewer-wgpu.ao_blur_pipeline");
    ao_composite_pipeline_ = make("fs_ao_composite", surface_view_format_, true,
                                  "ifcviewer-wgpu.ao_composite_pipeline");

    WGPUBufferDescriptor ub = {};
    ub.size  = sizeof(PostUniforms);
    ub.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
    ub.label = postLabel("ifcviewer-wgpu.post_uniforms");
    post_uniform_buffer_ = wgpuDeviceCreateBuffer(device_, &ub);

    WGPUSamplerDescriptor sd = {};
    sd.minFilter     = WGPUFilterMode_Linear;
    sd.magFilter     = WGPUFilterMode_Linear;
    sd.mipmapFilter  = WGPUMipmapFilterMode_Nearest;
    sd.addressModeU  = WGPUAddressMode_ClampToEdge;
    sd.addressModeV  = WGPUAddressMode_ClampToEdge;
    sd.addressModeW  = WGPUAddressMode_ClampToEdge;
    sd.lodMinClamp   = 0.0f;
    sd.lodMaxClamp   = 0.0f;
    sd.maxAnisotropy = 1;
    sd.label         = postLabel("ifcviewer-wgpu.post_sampler");
    post_sampler_ = wgpuDeviceCreateSampler(device_, &sd);

    return feature_edge_pipeline_ && edge_mask_pipeline_ && edge_aa_pipeline_
        && edge_accum_pipeline_ && edge_resolve_pipeline_ && line_sample_uniforms_[0]
        && ao_pipeline_ && ao_blur_pipeline_
        && ao_composite_pipeline_ && post_uniform_buffer_ && post_sampler_;
}

void ViewportCore::releasePostResources() {
    WGPURenderPipeline* pipelines[8] = { &feature_edge_pipeline_, &edge_mask_pipeline_,
                                         &edge_aa_pipeline_, &edge_accum_pipeline_,
                                         &edge_resolve_pipeline_, &ao_pipeline_,
                                         &ao_blur_pipeline_, &ao_composite_pipeline_ };
    for (WGPURenderPipeline* p : pipelines) {
        if (*p) { wgpuRenderPipelineRelease(*p); *p = nullptr; }
    }
    if (post_uniform_buffer_)  { wgpuBufferRelease(post_uniform_buffer_);            post_uniform_buffer_ = nullptr; }
    for (WGPUBuffer& b : line_sample_uniforms_) {
        if (b) { wgpuBufferRelease(b); b = nullptr; }
    }
    if (post_sampler_)         { wgpuSamplerRelease(post_sampler_);                  post_sampler_ = nullptr; }
    if (post_shader_module_)   { wgpuShaderModuleRelease(post_shader_module_);       post_shader_module_ = nullptr; }
    if (post_pipeline_layout_) { wgpuPipelineLayoutRelease(post_pipeline_layout_);   post_pipeline_layout_ = nullptr; }
    if (post_bgl_)             { wgpuBindGroupLayoutRelease(post_bgl_);              post_bgl_ = nullptr; }
}

void ViewportCore::ensureAoTextures(int w, int h) {
    const int aw = std::max(1, (w + 1) / 2);
    const int ah = std::max(1, (h + 1) / 2);
    if (aw == ao_w_ && ah == ao_h_ && ao_view_[0] && edge_mask_texture_
        && wgpuTextureGetWidth(edge_mask_texture_) == std::uint32_t(std::max(1, w))
        && wgpuTextureGetHeight(edge_mask_texture_) == std::uint32_t(std::max(1, h))) return;
    releaseAoTextures();
    for (int i = 0; i < 2; ++i) {
        WGPUTextureDescriptor desc = {};
        desc.usage         = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
        desc.dimension     = WGPUTextureDimension_2D;
        desc.size.width    = std::uint32_t(aw);
        desc.size.height   = std::uint32_t(ah);
        desc.size.depthOrArrayLayers = 1;
        desc.format        = kAoFormat;
        desc.mipLevelCount = 1;
        desc.sampleCount   = 1;
        desc.label         = postLabel(i == 0 ? "ifcviewer-wgpu.ao_raw" : "ifcviewer-wgpu.ao_blurred");
        ao_texture_[i] = wgpuDeviceCreateTexture(device_, &desc);
        ao_view_[i]    = wgpuTextureCreateView(ao_texture_[i], nullptr);
    }
    ao_w_ = aw;
    ao_h_ = ah;

    // Full-size line coverage mask for the antialiased feature edges.
    WGPUTextureDescriptor desc = {};
    desc.usage         = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
    desc.dimension     = WGPUTextureDimension_2D;
    desc.size.width    = std::uint32_t(std::max(1, w));
    desc.size.height   = std::uint32_t(std::max(1, h));
    desc.size.depthOrArrayLayers = 1;
    desc.format        = kAoFormat;
    desc.mipLevelCount = 1;
    desc.sampleCount   = 1;
    desc.label         = postLabel("ifcviewer-wgpu.edge_mask");
    edge_mask_texture_ = wgpuDeviceCreateTexture(device_, &desc);
    edge_mask_view_    = wgpuTextureCreateView(edge_mask_texture_, nullptr);

    // Sum of the jittered samples' masks.
    desc.format = kLineAccumFormat;
    desc.label  = postLabel("ifcviewer-wgpu.line_accum");
    line_accum_texture_ = wgpuDeviceCreateTexture(device_, &desc);
    line_accum_view_    = wgpuTextureCreateView(line_accum_texture_, nullptr);
    line_accum_count_   = 0;
}

void ViewportCore::releaseAoTextures() {
    for (int i = 0; i < 2; ++i) {
        if (ao_view_[i])    { wgpuTextureViewRelease(ao_view_[i]); ao_view_[i] = nullptr; }
        if (ao_texture_[i]) { wgpuTextureRelease(ao_texture_[i]);  ao_texture_[i] = nullptr; }
    }
    if (edge_mask_view_)    { wgpuTextureViewRelease(edge_mask_view_); edge_mask_view_ = nullptr; }
    if (edge_mask_texture_) { wgpuTextureRelease(edge_mask_texture_);  edge_mask_texture_ = nullptr; }
    if (line_accum_view_)    { wgpuTextureViewRelease(line_accum_view_); line_accum_view_ = nullptr; }
    if (line_accum_texture_) { wgpuTextureRelease(line_accum_texture_);  line_accum_texture_ = nullptr; }
    line_accum_count_ = 0;
    ao_w_ = ao_h_ = 0;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

bool ViewportCore::gbufferWanted() const {
    const bool feature = edges_enabled_ && edge_settings_.mode == EdgeMode::Feature;
    return (feature || ao_settings_.enabled)
        && feature_edge_pipeline_ && pick_pipeline_
        && pick_color_view_ && pick_normal_view_ && pick_position_view_ && pick_depth_view_
        && ao_view_[0] && ao_view_[1] && edge_mask_view_ && line_accum_view_
        && frame_bind_group_ && !models_gpu_.empty();
}

void ViewportCore::encodeGBufferPass(WGPUCommandEncoder enc, WGPUBindGroup frame_group) {
    // The pick pass, as encodePickReadbackToStaging draws it, minus the copy.
    WGPURenderPassColorAttachment color[3] = {};
    color[0].view       = pick_color_view_;
    color[0].clearValue = { 0.0, 0.0, 0.0, 0.0 };
    color[1].view       = pick_normal_view_;
    color[1].clearValue = { 0.5, 0.5, 0.5, 0.0 };
    color[2].view       = pick_position_view_;
    color[2].clearValue = { 0.0, 0.0, 0.0, 0.0 };
    for (auto& c : color) {
        c.loadOp     = WGPULoadOp_Clear;
        c.storeOp    = WGPUStoreOp_Store;
        c.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
    }
    WGPURenderPassDepthStencilAttachment depth = {};
    depth.view            = pick_depth_view_;
    depth.depthLoadOp     = WGPULoadOp_Clear;
    depth.depthStoreOp    = WGPUStoreOp_Store;
    depth.depthClearValue = 1.0f;
    depth.stencilLoadOp   = WGPULoadOp_Undefined;
    depth.stencilStoreOp  = WGPUStoreOp_Undefined;
    depth.stencilReadOnly = true;

    WGPURenderPassDescriptor pass_desc = {};
    pass_desc.colorAttachmentCount   = 3;
    pass_desc.colorAttachments       = color;
    pass_desc.depthStencilAttachment = &depth;
    pass_desc.label                  = postLabel("ifcviewer-wgpu.gbuffer_pass");

    WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &pass_desc);
    wgpuRenderPassEncoderSetPipeline(pass, pick_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, frame_group, 0, nullptr);
    for (const auto& [session_model_id, m] : models_gpu_) {
        if (!m.drawable()) continue;
        for (const auto& c : m.chunks) {
            if (!c.bind_group || c.total_visible_vertices == 0) continue;
            wgpuRenderPassEncoderSetBindGroup(pass, 1, c.bind_group, 0, nullptr);
            wgpuRenderPassEncoderDraw(pass, c.total_visible_vertices, 1, 0, 0);
        }
    }
    wgpuRenderPassEncoderEnd(pass);
    wgpuRenderPassEncoderRelease(pass);
}

void ViewportCore::encodePostPasses(WGPUCommandEncoder enc, WGPUTextureView view,
                                    const Eigen::Matrix4f& vp, bool interactive) {
    if (!gbufferWanted() || !view) return;


    const bool feature    = edges_enabled_ && edge_settings_.mode == EdgeMode::Feature;
    const bool supersample = feature && edge_settings_.antialias;

    // Which line samples this call adds. Interactive: one per frame while
    // everything the lines depend on holds still (the frame uniforms carry
    // the camera, section planes and shading; the epoch the scene), restarting
    // on any change. A snapshot tile takes its samples all at once — and
    // leaves the accumulator holding the tile, so the canvas starts over.
    int first = 0, count = 0;
    if (supersample && interactive) {
        const bool still = line_accum_count_ > 0
            && line_accum_epoch_ == scene_epoch_
            && std::memcmp(&line_accum_frame_, &last_frame_uniforms_, sizeof(FrameUniforms)) == 0;
        if (!still) {
            line_accum_count_ = 0;
            line_accum_epoch_ = scene_epoch_;
            line_accum_frame_ = last_frame_uniforms_;
        }
        first = line_accum_count_;
        count = line_accum_count_ < kLineSamples ? 1 : 0;
    } else if (supersample) {
        count = kSnapshotLineSamples;
        line_accum_count_ = 0;
    }
    const int resolved = interactive ? line_accum_count_ + count : count;
    if (supersample && interactive && resolved < kLineSamples) host_->requestFrame();

    // Frame bind group whose uniforms carry sample i's jittered projection.
    auto sampleGroup = [&](int i) -> WGPUBindGroup {
        FrameUniforms fu = last_frame_uniforms_;
        Eigen::Matrix4f jitter = Eigen::Matrix4f::Identity();
        jitter(0, 3) =  2.0f * kLineJitter[i][0] / float(std::max(1, pick_w_));
        jitter(1, 3) = -2.0f * kLineJitter[i][1] / float(std::max(1, pick_h_));
        const Eigen::Matrix4f jvp = jitter * vp;
        std::memcpy(fu.view_proj, jvp.data(), sizeof(fu.view_proj));
        wgpuQueueWriteBuffer(queue_, line_sample_uniforms_[i], 0, &fu, sizeof(fu));
        WGPUBindGroupEntry e[5] = {};
        e[0].binding = 0; e[0].buffer = line_sample_uniforms_[i]; e[0].size = sizeof(FrameUniforms);
        e[1].binding = 1; e[1].buffer = selection_flags_buffer_;  e[1].size = WGPU_WHOLE_SIZE;
        e[2].binding = 2; e[2].buffer = hit_flags_buffer_;        e[2].size = WGPU_WHOLE_SIZE;
        e[3].binding = 3; e[3].textureView = shadow_view_;
        e[4].binding = 4; e[4].sampler     = shadow_sampler_;
        WGPUBindGroupDescriptor bg = {};
        bg.layout     = frame_bgl_;
        bg.entryCount = 5;
        bg.entries    = e;
        bg.label      = postLabel("ifcviewer-wgpu.line_sample_frame_group");
        return wgpuDeviceCreateBindGroup(device_, &bg);
    };

    // Camera from the view matrix, so a snapshot tile's swapped-in camera
    // is the one used. Right-handed look-at: the camera looks down -Z.
    Eigen::Matrix4f v, p;
    buildViewProj(v, p);
    const Eigen::Matrix3f R = v.block<3, 3>(0, 0);
    const Eigen::Vector3f eye = -R.transpose() * v.block<3, 1>(0, 3);
    const Eigen::Vector3f fwd = -R.row(2).transpose();

    const float dpr = std::max(1.0f, host_->dpr());
    const EdgeSettings& es = edge_settings_;
    const AoSettings&   ao = ao_settings_;
    PostUniforms u = {};
    std::memcpy(u.view_proj, vp.data(), sizeof(u.view_proj));
    u.eye[0] = eye.x(); u.eye[1] = eye.y(); u.eye[2] = eye.z();
    u.view_dir[0] = fwd.x(); u.view_dir[1] = fwd.y(); u.view_dir[2] = fwd.z();
    for (int i = 0; i < 3; ++i) u.edge_color[i] = srgbToLinear(es.color[i]);
    u.edge_color[3]  = std::min(std::max(es.opacity, 0.0f), 1.0f);
    u.edge_params[0] = std::max(1.0f, es.width_px * dpr);
    u.edge_params[1] = std::cos(std::min(std::max(es.crease_deg, 0.0f), 180.0f)
                                * 3.14159265f / 180.0f);
    u.edge_params[2] = 0.002f;
    // World size of one image pixel. A snapshot tile's crop scales the
    // projection by image height / tile height, so the pixel is the image's.
    {
        const float img_h = float(std::max(1, pick_h_)) * std::max(ndc_crop_(1, 1), 1e-6f);
        const float tan_half = std::tan(camera_fov_y_deg_ * 0.5f * 3.14159265f / 180.0f);
        u.eye[3] = projection_ortho_ ? 1.0f : 0.0f;
        u.edge_params[3] = 2.0f * tan_half * (projection_ortho_ ? camera_distance_ : 1.0f) / img_h;
    }
    // An unset radius follows the view: interiors get tight contact shadows,
    // a whole site still reads at a distance.
    u.ao_params[0] = ao.radius > 0.0f ? ao.radius
                                      : std::min(std::max(camera_distance_ * 0.03f, 0.15f), 3.0f);
    u.ao_params[1] = ao.intensity;
    u.ao_params[2] = ao.bias;
    u.misc[0] = 1.0f / float(std::max(1, resolved));
    wgpuQueueWriteBuffer(queue_, post_uniform_buffer_, 0, &u, sizeof(u));

    // Bind groups name per-pixel attachments that are replaced on resize, so
    // they are made per frame. The AO slot always holds the texture the pass
    // is not rendering to.
    auto makeGroup = [&](WGPUTextureView ao_view) -> WGPUBindGroup {
        WGPUBindGroupEntry be[6] = {};
        be[0].binding = 0; be[0].buffer = post_uniform_buffer_; be[0].size = sizeof(PostUniforms);
        be[1].binding = 1; be[1].textureView = pick_color_view_;
        be[2].binding = 2; be[2].textureView = pick_normal_view_;
        be[3].binding = 3; be[3].textureView = pick_position_view_;
        be[4].binding = 4; be[4].textureView = ao_view;
        be[5].binding = 5; be[5].sampler = post_sampler_;
        WGPUBindGroupDescriptor bg = {};
        bg.layout     = post_bgl_;
        bg.entryCount = 6;
        bg.entries    = be;
        bg.label      = postLabel("ifcviewer-wgpu.post_bind_group");
        return wgpuDeviceCreateBindGroup(device_, &bg);
    };
    // A cleared target clears to `clear` (AO: 1 = unoccluded; mask: 0).
    auto fullscreen = [&](WGPUTextureView target, bool load, WGPURenderPipeline pipeline,
                          WGPUBindGroup group, const char* label, double clear = 1.0) {
        WGPURenderPassColorAttachment color = {};
        color.view       = target;
        color.loadOp     = load ? WGPULoadOp_Load : WGPULoadOp_Clear;
        color.storeOp    = WGPUStoreOp_Store;
        color.clearValue = { clear, clear, clear, clear };
        color.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
        WGPURenderPassDescriptor pd = {};
        pd.colorAttachmentCount = 1;
        pd.colorAttachments     = &color;
        pd.label                = postLabel(label);
        WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &pd);
        wgpuRenderPassEncoderSetPipeline(pass, pipeline);
        wgpuRenderPassEncoderSetBindGroup(pass, 0, group, 0, nullptr);
        wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
        wgpuRenderPassEncoderEnd(pass);
        wgpuRenderPassEncoderRelease(pass);
    };

    WGPUBindGroup reads_raw     = makeGroup(ao_view_[0]);
    WGPUBindGroup reads_blurred = makeGroup(ao_view_[1]);
    WGPUBindGroup reads_mask    = makeGroup(edge_mask_view_);
    WGPUBindGroup reads_accum   = makeGroup(line_accum_view_);
    auto encodeAo = [&]() {
        fullscreen(ao_view_[0], false, ao_pipeline_, reads_blurred, "ifcviewer-wgpu.ao_pass");
        fullscreen(ao_view_[1], false, ao_blur_pipeline_, reads_raw, "ifcviewer-wgpu.ao_blur_pass");
        fullscreen(view, true, ao_composite_pipeline_, reads_blurred, "ifcviewer-wgpu.ao_composite_pass");
    };

    if (!supersample) {
        encodeGBufferPass(enc, frame_bind_group_);
        if (ao.enabled) encodeAo();
    } else {
        // Each sample: jittered G-buffer, its line mask, added to the sum.
        // AO runs once, off the first sample drawn (sample 0 is unjittered).
        for (int i = first; i < first + count; ++i) {
            WGPUBindGroup group = sampleGroup(i);
            encodeGBufferPass(enc, group);
            wgpuBindGroupRelease(group);
            if (i == first && ao.enabled) encodeAo();
            fullscreen(edge_mask_view_, false, edge_mask_pipeline_, reads_blurred,
                       "ifcviewer-wgpu.edge_mask_pass", 0.0);
            WGPURenderPassColorAttachment acc = {};
            acc.view       = line_accum_view_;
            acc.loadOp     = (i == 0) ? WGPULoadOp_Clear : WGPULoadOp_Load;
            acc.storeOp    = WGPUStoreOp_Store;
            acc.clearValue = { 0.0, 0.0, 0.0, 0.0 };
            acc.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
            WGPURenderPassDescriptor pd = {};
            pd.colorAttachmentCount = 1;
            pd.colorAttachments     = &acc;
            pd.label                = postLabel("ifcviewer-wgpu.line_accum_pass");
            WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &pd);
            wgpuRenderPassEncoderSetPipeline(pass, edge_accum_pipeline_);
            wgpuRenderPassEncoderSetBindGroup(pass, 0, reads_mask, 0, nullptr);
            wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
            wgpuRenderPassEncoderEnd(pass);
            wgpuRenderPassEncoderRelease(pass);
        }
        // Converged with AO on: the G-buffer still has to be current for it.
        if (count == 0 && ao.enabled) {
            WGPUBindGroup group = sampleGroup(0);
            encodeGBufferPass(enc, group);
            wgpuBindGroupRelease(group);
            encodeAo();
        }
        line_accum_count_ = interactive ? resolved : 0;
    }

    // Lines last, so occlusion never greys them.
    if (feature) {
        if (supersample && (resolved >= kLineMinResolved || !interactive)) {
            fullscreen(view, true, edge_resolve_pipeline_, reads_accum, "ifcviewer-wgpu.edge_resolve_pass");
        } else if (supersample) {
            fullscreen(view, true, edge_aa_pipeline_, reads_mask, "ifcviewer-wgpu.edge_aa_pass");
        } else {
            fullscreen(view, true, feature_edge_pipeline_, reads_blurred, "ifcviewer-wgpu.feature_edge_pass");
        }
    }
    wgpuBindGroupRelease(reads_raw);
    wgpuBindGroupRelease(reads_blurred);
    wgpuBindGroupRelease(reads_mask);
    wgpuBindGroupRelease(reads_accum);
}
