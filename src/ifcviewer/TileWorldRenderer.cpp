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

#include "TileWorldRenderer.h"

#include <algorithm>
#include <cstring>

namespace {

WGPUStringView sv(const char* s) {
    WGPUStringView v{};
    v.data   = s;
    v.length = std::strlen(s);
    return v;
}

// One instance per quad: rect (x, y, w, h) and source (u, v, flip, kind) as
// float32x4, then the debug colour as unorm8x4.
constexpr uint32_t kInstanceStride = 36;

const char* SPRITE_WGSL = R"(
struct U { screen : vec2<f32>, pad : vec2<f32> };
@group(0) @binding(0) var<uniform> u : U;
@group(0) @binding(1) var atlas : texture_2d<f32>;

struct VOut {
    @builtin(position) pos : vec4<f32>,
    @location(0) uv : vec2<f32>,
    @location(1) @interpolate(flat) kind : u32,
    @location(2) color : vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vi : u32,
           @location(0) rect : vec4<f32>,
           @location(1) src : vec4<f32>,
           @location(2) color : vec4<f32>) -> VOut {
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0));
    let c = corners[vi];
    let p = rect.xy + c * rect.zw;
    var out : VOut;
    out.pos = vec4<f32>(p.x / u.screen.x * 2.0 - 1.0, 1.0 - p.y / u.screen.y * 2.0, 0.0, 1.0);
    var lc = c;
    if (src.z > 0.5) { lc.x = 1.0 - lc.x; }
    out.uv = src.xy + lc * rect.zw;
    out.kind = u32(src.w + 0.5);
    out.color = color;
    return out;
}

@fragment
fn fs_main(in : VOut) -> @location(0) vec4<f32> {
    if (in.kind == 1u) { return in.color; }
    // Integer texel fetch: no sampler, no filtering, no bleed across tiles.
    let c = textureLoad(atlas, vec2<i32>(floor(in.uv)), 0);
    if (c.a < 0.5) { discard; }
    return vec4<f32>(c.rgb, 1.0);
}
)";

const char* BLIT_WGSL = R"(
struct B {
    offset : vec2<f32>,
    scale  : f32,
    mode   : f32,
    native : vec2<f32>,
    fade   : f32,
    lcd    : f32,
};
@group(0) @binding(0) var<uniform> b : B;
@group(0) @binding(1) var lowres : texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4<f32> {
    var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    return vec4<f32>(p[vi], 0.0, 1.0);
}

fn srgb_to_linear(c : vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

@fragment
fn fs_main(@builtin(position) frag : vec4<f32>) -> @location(0) vec4<f32> {
    let local = (frag.xy - b.offset) / b.scale;
    let q = clamp(vec2<i32>(floor(local)), vec2<i32>(0), vec2<i32>(b.native) - vec2<i32>(1));
    var c = textureLoad(lowres, q, 0).rgb;

    let m = i32(b.mode + 0.5);
    if (m != 0) {
        // Quantise to four shades by luminance, then map onto the panel tint.
        let l = dot(c, vec3<f32>(0.299, 0.587, 0.114));
        let idx = clamp(i32(l * 4.0), 0, 3);
        var dmg = array<vec3<f32>, 4>(
            vec3<f32>(0.059, 0.220, 0.059), vec3<f32>(0.188, 0.384, 0.188),
            vec3<f32>(0.545, 0.675, 0.059), vec3<f32>(0.608, 0.737, 0.059));
        var pocket = array<vec3<f32>, 4>(
            vec3<f32>(0.090, 0.090, 0.082), vec3<f32>(0.333, 0.333, 0.310),
            vec3<f32>(0.651, 0.651, 0.612), vec3<f32>(0.890, 0.886, 0.851));
        if (m == 1) { c = dmg[idx]; } else { c = pocket[idx]; }
    }

    // Warp transition: fade to white, like the originals.
    c = mix(c, vec3<f32>(1.0), clamp(b.fade, 0.0, 1.0));

    // Optional LCD grid: darken the last row/column of each enlarged pixel.
    if (b.lcd > 0.5 && b.scale >= 3.0) {
        let f = fract(local);
        let edge = 1.0 / b.scale;
        if (f.x > 1.0 - edge || f.y > 1.0 - edge) { c = c * 0.86; }
    }

    // The target view is sRGB; the low-res image holds sRGB-encoded values.
    return vec4<f32>(srgb_to_linear(c), 1.0);
}
)";

WGPUShaderModule makeModule(WGPUDevice device, const char* code, const char* label) {
    WGPUShaderSourceWGSL src = {};
    src.chain.sType = WGPUSType_ShaderSourceWGSL;
    src.code        = sv(code);
    WGPUShaderModuleDescriptor desc = {};
    desc.nextInChain = &src.chain;
    desc.label       = sv(label);
    return wgpuDeviceCreateShaderModule(device, &desc);
}

WGPUBindGroupLayout makeUniformTextureLayout(WGPUDevice device, const char* label,
                                            uint64_t min_uniform) {
    WGPUBindGroupLayoutEntry e[2] = {};
    e[0].binding    = 0;
    e[0].visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
    e[0].buffer.type = WGPUBufferBindingType_Uniform;
    e[0].buffer.minBindingSize = min_uniform;
    e[1].binding    = 1;
    e[1].visibility = WGPUShaderStage_Fragment;
    e[1].texture.sampleType    = WGPUTextureSampleType_Float;
    e[1].texture.viewDimension = WGPUTextureViewDimension_2D;
    WGPUBindGroupLayoutDescriptor d = {};
    d.entryCount = 2;
    d.entries    = e;
    d.label      = sv(label);
    return wgpuDeviceCreateBindGroupLayout(device, &d);
}

WGPUBuffer makeBuffer(WGPUDevice device, WGPUBufferUsage usage, uint64_t size, const char* label) {
    WGPUBufferDescriptor d = {};
    d.usage = usage | WGPUBufferUsage_CopyDst;
    d.size  = size;
    d.label = sv(label);
    return wgpuDeviceCreateBuffer(device, &d);
}

WGPUTextureView makeView(WGPUTexture tex) {
    WGPUTextureViewDescriptor d = {};
    d.format          = WGPUTextureFormat_RGBA8Unorm;
    d.dimension       = WGPUTextureViewDimension_2D;
    d.mipLevelCount   = 1;
    d.arrayLayerCount = 1;
    d.aspect          = WGPUTextureAspect_All;
    return wgpuTextureCreateView(tex, &d);
}

}  // namespace

TileWorldRenderer::~TileWorldRenderer() { destroy(); }

bool TileWorldRenderer::init(WGPUDevice device, WGPUQueue queue, WGPUTextureFormat target_format) {
    device_ = device;
    queue_  = queue;
    if (!device_ || !queue_) return false;

    sprite_uniforms_ = makeBuffer(device_, WGPUBufferUsage_Uniform, 16, "tileworld.sprite_uniforms");
    blit_uniforms_   = makeBuffer(device_, WGPUBufferUsage_Uniform, 32, "tileworld.blit_uniforms");

    sprite_module_ = makeModule(device_, SPRITE_WGSL, "tileworld.sprite_wgsl");
    blit_module_   = makeModule(device_, BLIT_WGSL, "tileworld.blit_wgsl");
    sprite_bgl_ = makeUniformTextureLayout(device_, "tileworld.sprite_bgl", 16);
    blit_bgl_   = makeUniformTextureLayout(device_, "tileworld.blit_bgl", 32);

    {
        WGPUPipelineLayoutDescriptor d = {};
        d.bindGroupLayoutCount = 1;
        d.bindGroupLayouts     = &sprite_bgl_;
        sprite_layout_ = wgpuDeviceCreatePipelineLayout(device_, &d);
        d.bindGroupLayouts     = &blit_bgl_;
        blit_layout_ = wgpuDeviceCreatePipelineLayout(device_, &d);
    }

    // ---- Sprite pipeline: instanced quads into the RGBA8 low-res target. ----
    {
        WGPUVertexAttribute attrs[3] = {};
        attrs[0].format = WGPUVertexFormat_Float32x4; attrs[0].offset = 0;  attrs[0].shaderLocation = 0;
        attrs[1].format = WGPUVertexFormat_Float32x4; attrs[1].offset = 16; attrs[1].shaderLocation = 1;
        attrs[2].format = WGPUVertexFormat_Unorm8x4;  attrs[2].offset = 32; attrs[2].shaderLocation = 2;
        WGPUVertexBufferLayout vbl = {};
        vbl.arrayStride    = kInstanceStride;
        vbl.stepMode       = WGPUVertexStepMode_Instance;
        vbl.attributeCount = 3;
        vbl.attributes     = attrs;

        WGPUBlendState blend = {};
        blend.color.srcFactor = WGPUBlendFactor_SrcAlpha;
        blend.color.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
        blend.color.operation = WGPUBlendOperation_Add;
        blend.alpha.srcFactor = WGPUBlendFactor_One;
        blend.alpha.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
        blend.alpha.operation = WGPUBlendOperation_Add;
        WGPUColorTargetState ct = {};
        ct.format    = WGPUTextureFormat_RGBA8Unorm;
        ct.blend     = &blend;
        ct.writeMask = WGPUColorWriteMask_All;
        WGPUFragmentState frag = {};
        frag.module      = sprite_module_;
        frag.entryPoint  = sv("fs_main");
        frag.targetCount = 1;
        frag.targets     = &ct;

        WGPURenderPipelineDescriptor d = {};
        d.label              = sv("tileworld.sprite_pipeline");
        d.layout             = sprite_layout_;
        d.vertex.module      = sprite_module_;
        d.vertex.entryPoint  = sv("vs_main");
        d.vertex.bufferCount = 1;
        d.vertex.buffers     = &vbl;
        d.fragment           = &frag;
        d.primitive.topology = WGPUPrimitiveTopology_TriangleList;
        d.primitive.cullMode = WGPUCullMode_None;
        d.multisample.count  = 1;
        d.multisample.mask   = 0xFFFFFFFFu;
        sprite_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &d);
    }

    // ---- Blit pipeline: low-res -> swapchain, integer scaled. ---------------
    {
        WGPUColorTargetState ct = {};
        ct.format    = target_format;
        ct.writeMask = WGPUColorWriteMask_All;
        WGPUFragmentState frag = {};
        frag.module      = blit_module_;
        frag.entryPoint  = sv("fs_main");
        frag.targetCount = 1;
        frag.targets     = &ct;
        WGPURenderPipelineDescriptor d = {};
        d.label              = sv("tileworld.blit_pipeline");
        d.layout             = blit_layout_;
        d.vertex.module      = blit_module_;
        d.vertex.entryPoint  = sv("vs_main");
        d.fragment           = &frag;
        d.primitive.topology = WGPUPrimitiveTopology_TriangleList;
        d.primitive.cullMode = WGPUCullMode_None;
        d.multisample.count  = 1;
        d.multisample.mask   = 0xFFFFFFFFu;
        blit_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &d);
    }

    // A 1x1 placeholder keeps the bind group valid until a real atlas arrives.
    const uint8_t magenta[4] = {255, 0, 255, 255};
    setAtlas(magenta, 1, 1);
    ensureLowRes(160, 144);
    return ready();
}

void TileWorldRenderer::destroy() {
    auto relBG  = [](WGPUBindGroup& x)       { if (x) { wgpuBindGroupRelease(x); x = nullptr; } };
    auto relBuf = [](WGPUBuffer& x)          { if (x) { wgpuBufferRelease(x); x = nullptr; } };
    auto relTex = [](WGPUTexture& x)         { if (x) { wgpuTextureRelease(x); x = nullptr; } };
    auto relTV  = [](WGPUTextureView& x)     { if (x) { wgpuTextureViewRelease(x); x = nullptr; } };
    auto relRP  = [](WGPURenderPipeline& x)  { if (x) { wgpuRenderPipelineRelease(x); x = nullptr; } };
    auto relPL  = [](WGPUPipelineLayout& x)  { if (x) { wgpuPipelineLayoutRelease(x); x = nullptr; } };
    auto relBGL = [](WGPUBindGroupLayout& x) { if (x) { wgpuBindGroupLayoutRelease(x); x = nullptr; } };
    auto relSM  = [](WGPUShaderModule& x)    { if (x) { wgpuShaderModuleRelease(x); x = nullptr; } };
    relBG(sprite_bg_); relBG(blit_bg_);
    relRP(sprite_pipeline_); relRP(blit_pipeline_);
    relPL(sprite_layout_); relPL(blit_layout_);
    relBGL(sprite_bgl_); relBGL(blit_bgl_);
    relSM(sprite_module_); relSM(blit_module_);
    relBuf(sprite_uniforms_); relBuf(blit_uniforms_); relBuf(instance_buffer_);
    relTV(atlas_view_); relTex(atlas_);
    relTV(lowres_view_); relTex(lowres_);
    instance_capacity_ = 0;
    lowres_w_ = lowres_h_ = 0;
    device_ = nullptr;
    queue_  = nullptr;
}

void TileWorldRenderer::setAtlas(const uint8_t* rgba, int w, int h) {
    if (!device_ || !rgba || w <= 0 || h <= 0) return;
    if (atlas_view_) { wgpuTextureViewRelease(atlas_view_); atlas_view_ = nullptr; }
    if (atlas_)      { wgpuTextureRelease(atlas_); atlas_ = nullptr; }

    WGPUTextureDescriptor td = {};
    td.usage         = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst;
    td.dimension     = WGPUTextureDimension_2D;
    td.format        = WGPUTextureFormat_RGBA8Unorm;
    td.size          = { uint32_t(w), uint32_t(h), 1 };
    td.mipLevelCount = 1;
    td.sampleCount   = 1;
    td.label         = sv("tileworld.atlas");
    atlas_ = wgpuDeviceCreateTexture(device_, &td);

    WGPUTexelCopyTextureInfo dst = {};
    dst.texture = atlas_;
    dst.aspect  = WGPUTextureAspect_All;
    WGPUTexelCopyBufferLayout layout = {};
    layout.bytesPerRow  = uint32_t(w) * 4;
    layout.rowsPerImage = uint32_t(h);
    WGPUExtent3D extent = { uint32_t(w), uint32_t(h), 1 };
    wgpuQueueWriteTexture(queue_, &dst, rgba, size_t(w) * size_t(h) * 4, &layout, &extent);

    atlas_view_ = makeView(atlas_);
    rebuildBindGroups();
}

void TileWorldRenderer::ensureLowRes(int w, int h) {
    if (lowres_ && w == lowres_w_ && h == lowres_h_) return;
    if (lowres_view_) { wgpuTextureViewRelease(lowres_view_); lowres_view_ = nullptr; }
    if (lowres_)      { wgpuTextureRelease(lowres_); lowres_ = nullptr; }
    WGPUTextureDescriptor td = {};
    td.usage         = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_RenderAttachment;
    td.dimension     = WGPUTextureDimension_2D;
    td.format        = WGPUTextureFormat_RGBA8Unorm;
    td.size          = { uint32_t(w), uint32_t(h), 1 };
    td.mipLevelCount = 1;
    td.sampleCount   = 1;
    td.label         = sv("tileworld.lowres");
    lowres_ = wgpuDeviceCreateTexture(device_, &td);
    lowres_view_ = makeView(lowres_);
    lowres_w_ = w;
    lowres_h_ = h;
    rebuildBindGroups();
}

void TileWorldRenderer::rebuildBindGroups() {
    if (!device_) return;
    if (sprite_bgl_ && atlas_view_) {
        if (sprite_bg_) wgpuBindGroupRelease(sprite_bg_);
        WGPUBindGroupEntry e[2] = {};
        e[0].binding = 0; e[0].buffer = sprite_uniforms_; e[0].size = 16;
        e[1].binding = 1; e[1].textureView = atlas_view_;
        WGPUBindGroupDescriptor d = {};
        d.layout = sprite_bgl_; d.entryCount = 2; d.entries = e;
        sprite_bg_ = wgpuDeviceCreateBindGroup(device_, &d);
    }
    if (blit_bgl_ && lowres_view_) {
        if (blit_bg_) wgpuBindGroupRelease(blit_bg_);
        WGPUBindGroupEntry e[2] = {};
        e[0].binding = 0; e[0].buffer = blit_uniforms_; e[0].size = 32;
        e[1].binding = 1; e[1].textureView = lowres_view_;
        WGPUBindGroupDescriptor d = {};
        d.layout = blit_bgl_; d.entryCount = 2; d.entries = e;
        blit_bg_ = wgpuDeviceCreateBindGroup(device_, &d);
    }
}

void TileWorldRenderer::encode(WGPUCommandEncoder enc, WGPUTextureView target,
                               int target_w, int target_h, const tw::TileWorld& world) {
    if (!ready() || target_w <= 0 || target_h <= 0) return;
    const int sw = world.screenW(), sh = world.screenH();
    ensureLowRes(sw, sh);

    // ---- Instances ----------------------------------------------------------
    world.buildDrawList(quads_);
    const uint64_t bytes = uint64_t(quads_.size()) * kInstanceStride;
    if (bytes > instance_capacity_) {
        if (instance_buffer_) wgpuBufferRelease(instance_buffer_);
        instance_capacity_ = std::max<uint64_t>(bytes * 2, 64 * 1024);
        instance_buffer_ = makeBuffer(device_, WGPUBufferUsage_Vertex, instance_capacity_,
                                      "tileworld.instances");
    }
    instance_bytes_.resize(size_t(bytes));
    uint8_t* p = instance_bytes_.data();
    for (const tw::Quad& q : quads_) {
        const float f[8] = { float(q.x), float(q.y), float(q.w), float(q.h),
                             float(q.u), float(q.v), float(q.flip_x), float(q.kind) };
        std::memcpy(p, f, 32);
        std::memcpy(p + 32, &q.rgba, 4);
        p += kInstanceStride;
    }
    if (bytes) wgpuQueueWriteBuffer(queue_, instance_buffer_, 0, instance_bytes_.data(), size_t(bytes));

    const float su[4] = { float(sw), float(sh), 0.0f, 0.0f };
    wgpuQueueWriteBuffer(queue_, sprite_uniforms_, 0, su, sizeof(su));

    // Largest whole-number scale that fits; 1x (cropped) if the canvas is tiny.
    const int scale = fixed_scale_ > 0 ? fixed_scale_
                                       : std::max(1, std::min(target_w / sw, target_h / sh));
    const int out_w = sw * scale, out_h = sh * scale;
    const int off_x = (target_w - out_w) / 2, off_y = (target_h - out_h) / 2;
    last_view_ = View{scale, off_x, off_y};
    const float bu[8] = { float(off_x), float(off_y), float(scale), float(palette_),
                          float(sw), float(sh), world.fade(), lcd_grid_ ? 1.0f : 0.0f };
    wgpuQueueWriteBuffer(queue_, blit_uniforms_, 0, bu, sizeof(bu));

    // ---- Pass 1: the native-resolution frame. -------------------------------
    {
        WGPURenderPassColorAttachment color = {};
        color.view       = lowres_view_;
        color.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
        color.loadOp     = WGPULoadOp_Clear;
        color.storeOp    = WGPUStoreOp_Store;
        color.clearValue = { 1.0, 1.0, 1.0, 1.0 };
        WGPURenderPassDescriptor d = {};
        d.colorAttachmentCount = 1;
        d.colorAttachments     = &color;
        d.label = sv("tileworld.sprite_pass");
        WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &d);
        if (!quads_.empty()) {
            wgpuRenderPassEncoderSetPipeline(pass, sprite_pipeline_);
            wgpuRenderPassEncoderSetBindGroup(pass, 0, sprite_bg_, 0, nullptr);
            wgpuRenderPassEncoderSetVertexBuffer(pass, 0, instance_buffer_, 0, bytes);
            wgpuRenderPassEncoderDraw(pass, 6, uint32_t(quads_.size()), 0, 0);
        }
        wgpuRenderPassEncoderEnd(pass);
        wgpuRenderPassEncoderRelease(pass);
    }

    // ---- Pass 2: integer upscale onto the swapchain. ------------------------
    {
        WGPURenderPassColorAttachment color = {};
        color.view       = target;
        color.depthSlice = WGPU_DEPTH_SLICE_UNDEFINED;
        color.loadOp     = WGPULoadOp_Clear;
        color.storeOp    = WGPUStoreOp_Store;
        color.clearValue = { 0.008, 0.008, 0.010, 1.0 };  // letterbox, linear
        WGPURenderPassDescriptor d = {};
        d.colorAttachmentCount = 1;
        d.colorAttachments     = &color;
        d.label = sv("tileworld.blit_pass");
        WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &d);
        const int vx = std::max(0, off_x), vy = std::max(0, off_y);
        const int vw = std::min(out_w, target_w), vh = std::min(out_h, target_h);
        wgpuRenderPassEncoderSetViewport(pass, float(vx), float(vy), float(vw), float(vh), 0.0f, 1.0f);
        wgpuRenderPassEncoderSetPipeline(pass, blit_pipeline_);
        wgpuRenderPassEncoderSetBindGroup(pass, 0, blit_bg_, 0, nullptr);
        wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
        wgpuRenderPassEncoderEnd(pass);
        wgpuRenderPassEncoderRelease(pass);
    }
}
