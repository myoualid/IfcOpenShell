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

// Weighted blended order-independent transparency. See the comment on
// setOrderIndependentTransparency in ViewportCore.h. The accumulation
// shader (fs_oit) and the depth writer (fs_depth_only) live in the main WGSL
// module; the resolve is below.

#include "ViewportCore.h"

#include "Log.h"

#include <cstring>

namespace {

WGPUStringView oitLabel(const char* s) {
    return WGPUStringView{ s, std::strlen(s) };
}

constexpr WGPUTextureFormat kAccumFormat  = WGPUTextureFormat_RGBA16Float;
constexpr WGPUTextureFormat kRevealFormat = WGPUTextureFormat_R8Unorm;

// Average colour = accum.rgb / accum.a, coverage = 1 - reveal, blended over
// the opaque image. Every MSAA sample gets the resolved value.
const char* OIT_RESOLVE_WGSL = R"(
@group(0) @binding(0) var t_accum:  texture_2d<f32>;
@group(0) @binding(1) var t_reveal: texture_2d<f32>;

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
    let xy = vec2<f32>(f32((vid << 1u) & 2u), f32(vid & 2u)) * 2.0 - 1.0;
    return vec4<f32>(xy, 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let p = vec2<i32>(frag.xy);
    let reveal = textureLoad(t_reveal, p, 0).r;
    if (reveal >= 0.999) { discard; }
    let a = textureLoad(t_accum, p, 0);
    return vec4<f32>(a.rgb / max(a.a, 1e-5), 1.0 - reveal);
}
)";

} // namespace

void ViewportCore::setOrderIndependentTransparency(bool on) {
    oit_enabled_ = on;
    line_accum_count_ = 0;
    host_->requestFrame();
}

bool ViewportCore::oitWanted() const {
    if (!oit_enabled_ || !oit_pipeline_ || !oit_composite_pipeline_) return false;
    for (const auto& [id, m] : models_gpu_) {
        if (!m.drawable()) continue;
        for (const auto& c : m.chunks) {
            if (c.bind_group && c.total_visible_vertices > c.opaque_visible_vertices) return true;
        }
    }
    return false;
}

bool ViewportCore::buildOitPipelines() {
    if (!device_ || !main_shader_module_ || !pipeline_layout_) return false;

    // Accumulation: the main vertex pulling, two additive targets, depth
    // tested against the opaque half but not written.
    WGPUBlendState accum_blend = {};
    accum_blend.color = { WGPUBlendOperation_Add, WGPUBlendFactor_One, WGPUBlendFactor_One };
    accum_blend.alpha = { WGPUBlendOperation_Add, WGPUBlendFactor_One, WGPUBlendFactor_One };
    WGPUBlendState reveal_blend = {};
    reveal_blend.color = { WGPUBlendOperation_Add, WGPUBlendFactor_Zero, WGPUBlendFactor_OneMinusSrc };
    reveal_blend.alpha = { WGPUBlendOperation_Add, WGPUBlendFactor_Zero, WGPUBlendFactor_OneMinusSrc };
    WGPUColorTargetState targets[2] = {};
    targets[0].format    = kAccumFormat;
    targets[0].blend     = &accum_blend;
    targets[0].writeMask = WGPUColorWriteMask_All;
    targets[1].format    = kRevealFormat;
    targets[1].blend     = &reveal_blend;
    targets[1].writeMask = WGPUColorWriteMask_Red;
    WGPUFragmentState frag = {};
    frag.module      = main_shader_module_;
    frag.entryPoint  = oitLabel("fs_oit");
    frag.targetCount = 2;
    frag.targets     = targets;

    WGPUDepthStencilState depth = {};
    depth.format              = WGPUTextureFormat_Depth32Float;
    depth.depthWriteEnabled   = WGPUOptionalBool_False;
    depth.depthCompare        = WGPUCompareFunction_Less;
    depth.stencilFront.compare = WGPUCompareFunction_Always;
    depth.stencilBack.compare  = WGPUCompareFunction_Always;

    WGPURenderPipelineDescriptor rp = {};
    rp.layout             = pipeline_layout_;
    rp.label              = oitLabel("ifcviewer-wgpu.oit_accumulate");
    rp.vertex.module      = main_shader_module_;
    rp.vertex.entryPoint  = oitLabel("vs_main");
    rp.fragment           = &frag;
    rp.depthStencil       = &depth;
    rp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
    rp.primitive.cullMode = WGPUCullMode_None;
    rp.multisample.count  = kViewportSampleCount;
    rp.multisample.mask   = 0xFFFFFFFFu;
    oit_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &rp);
    if (!oit_pipeline_) return false;

    // Translucent depth, in the reopened main pass: no colour written.
    WGPUColorTargetState no_color = {};
    no_color.format    = surface_view_format_;
    no_color.writeMask = WGPUColorWriteMask_None;
    WGPUFragmentState dfrag = {};
    dfrag.module      = main_shader_module_;
    dfrag.entryPoint  = oitLabel("fs_depth_only");
    dfrag.targetCount = 1;
    dfrag.targets     = &no_color;
    WGPUDepthStencilState ddepth = depth;
    ddepth.depthWriteEnabled = WGPUOptionalBool_True;
    WGPURenderPipelineDescriptor drp = rp;
    drp.label        = oitLabel("ifcviewer-wgpu.oit_depth");
    drp.fragment     = &dfrag;
    drp.depthStencil = &ddepth;
    oit_depth_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &drp);
    if (!oit_depth_pipeline_) return false;

    // Resolve: a full-screen triangle into the main pass.
    WGPUShaderSourceWGSL src = {};
    src.chain.sType = WGPUSType_ShaderSourceWGSL;
    src.code        = oitLabel(OIT_RESOLVE_WGSL);
    WGPUShaderModuleDescriptor smd = {};
    smd.nextInChain = &src.chain;
    smd.label       = oitLabel("ifcviewer-wgpu.oit_resolve_wgsl");
    oit_composite_module_ = wgpuDeviceCreateShaderModule(device_, &smd);

    WGPUBindGroupLayoutEntry e[2] = {};
    for (int i = 0; i < 2; ++i) {
        e[i].binding = std::uint32_t(i);
        e[i].visibility = WGPUShaderStage_Fragment;
        e[i].texture.sampleType    = WGPUTextureSampleType_UnfilterableFloat;
        e[i].texture.viewDimension = WGPUTextureViewDimension_2D;
    }
    WGPUBindGroupLayoutDescriptor bgl = {};
    bgl.entryCount = 2;
    bgl.entries    = e;
    bgl.label      = oitLabel("ifcviewer-wgpu.oit_resolve_bgl");
    oit_composite_bgl_ = wgpuDeviceCreateBindGroupLayout(device_, &bgl);
    WGPUPipelineLayoutDescriptor pl = {};
    pl.bindGroupLayoutCount = 1;
    pl.bindGroupLayouts     = &oit_composite_bgl_;
    pl.label                = oitLabel("ifcviewer-wgpu.oit_resolve_layout");
    oit_composite_layout_ = wgpuDeviceCreatePipelineLayout(device_, &pl);

    WGPUBlendState over = {};
    over.color = { WGPUBlendOperation_Add, WGPUBlendFactor_SrcAlpha, WGPUBlendFactor_OneMinusSrcAlpha };
    over.alpha = { WGPUBlendOperation_Add, WGPUBlendFactor_One, WGPUBlendFactor_OneMinusSrcAlpha };
    WGPUColorTargetState ct = {};
    ct.format    = surface_view_format_;
    ct.blend     = &over;
    ct.writeMask = WGPUColorWriteMask_All;
    WGPUFragmentState cfrag = {};
    cfrag.module      = oit_composite_module_;
    cfrag.entryPoint  = oitLabel("fs_main");
    cfrag.targetCount = 1;
    cfrag.targets     = &ct;
    WGPUDepthStencilState cdepth = {};
    cdepth.format              = WGPUTextureFormat_Depth32Float;
    cdepth.depthWriteEnabled   = WGPUOptionalBool_False;
    cdepth.depthCompare        = WGPUCompareFunction_Always;
    cdepth.stencilFront.compare = WGPUCompareFunction_Always;
    cdepth.stencilBack.compare  = WGPUCompareFunction_Always;
    WGPURenderPipelineDescriptor crp = {};
    crp.layout             = oit_composite_layout_;
    crp.label              = oitLabel("ifcviewer-wgpu.oit_resolve");
    crp.vertex.module      = oit_composite_module_;
    crp.vertex.entryPoint  = oitLabel("vs_main");
    crp.fragment           = &cfrag;
    crp.depthStencil       = &cdepth;
    crp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
    crp.primitive.cullMode = WGPUCullMode_None;
    crp.multisample.count  = kViewportSampleCount;
    crp.multisample.mask   = 0xFFFFFFFFu;
    oit_composite_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &crp);
    return oit_composite_pipeline_ != nullptr;
}

void ViewportCore::releaseOitTextures() {
    if (oit_composite_group_)  { wgpuBindGroupRelease(oit_composite_group_);    oit_composite_group_ = nullptr; }
    WGPUTextureView* views[4] = { &oit_accum_msaa_view_, &oit_accum_view_,
                                  &oit_reveal_msaa_view_, &oit_reveal_view_ };
    WGPUTexture* texes[4] = { &oit_accum_msaa_, &oit_accum_, &oit_reveal_msaa_, &oit_reveal_ };
    for (int i = 0; i < 4; ++i) {
        if (*views[i]) { wgpuTextureViewRelease(*views[i]); *views[i] = nullptr; }
        if (*texes[i]) { wgpuTextureRelease(*texes[i]);     *texes[i] = nullptr; }
    }
    oit_w_ = oit_h_ = 0;
}

void ViewportCore::releaseOitResources() {
    releaseOitTextures();
    if (oit_composite_pipeline_) { wgpuRenderPipelineRelease(oit_composite_pipeline_); oit_composite_pipeline_ = nullptr; }
    if (oit_composite_layout_)   { wgpuPipelineLayoutRelease(oit_composite_layout_);   oit_composite_layout_ = nullptr; }
    if (oit_composite_bgl_)      { wgpuBindGroupLayoutRelease(oit_composite_bgl_);     oit_composite_bgl_ = nullptr; }
    if (oit_composite_module_)   { wgpuShaderModuleRelease(oit_composite_module_);     oit_composite_module_ = nullptr; }
    if (oit_depth_pipeline_)     { wgpuRenderPipelineRelease(oit_depth_pipeline_);     oit_depth_pipeline_ = nullptr; }
    if (oit_pipeline_)           { wgpuRenderPipelineRelease(oit_pipeline_);           oit_pipeline_ = nullptr; }
}

void ViewportCore::ensureOitTextures(int w, int h) {
    if (w == oit_w_ && h == oit_h_ && oit_composite_group_) return;
    releaseOitTextures();
    auto make = [&](WGPUTextureFormat fmt, std::uint32_t samples, WGPUTextureUsage usage,
                    const char* label, WGPUTexture& tex, WGPUTextureView& view) {
        WGPUTextureDescriptor d = {};
        d.usage         = usage;
        d.dimension     = WGPUTextureDimension_2D;
        d.size          = { std::uint32_t(w), std::uint32_t(h), 1 };
        d.format        = fmt;
        d.mipLevelCount = 1;
        d.sampleCount   = samples;
        d.label         = oitLabel(label);
        tex  = wgpuDeviceCreateTexture(device_, &d);
        view = wgpuTextureCreateView(tex, nullptr);
    };
    const auto att = WGPUTextureUsage_RenderAttachment;
    const auto att_bind = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
    make(kAccumFormat,  kViewportSampleCount, att, "ifcviewer-wgpu.oit_accum_msaa",
         oit_accum_msaa_, oit_accum_msaa_view_);
    make(kAccumFormat,  1, att_bind, "ifcviewer-wgpu.oit_accum", oit_accum_, oit_accum_view_);
    make(kRevealFormat, kViewportSampleCount, att, "ifcviewer-wgpu.oit_reveal_msaa",
         oit_reveal_msaa_, oit_reveal_msaa_view_);
    make(kRevealFormat, 1, att_bind, "ifcviewer-wgpu.oit_reveal", oit_reveal_, oit_reveal_view_);

    WGPUBindGroupEntry be[2] = {};
    be[0].binding = 0; be[0].textureView = oit_accum_view_;
    be[1].binding = 1; be[1].textureView = oit_reveal_view_;
    WGPUBindGroupDescriptor bgd = {};
    bgd.layout     = oit_composite_bgl_;
    bgd.entryCount = 2;
    bgd.entries    = be;
    bgd.label      = oitLabel("ifcviewer-wgpu.oit_resolve_group");
    oit_composite_group_ = wgpuDeviceCreateBindGroup(device_, &bgd);
    oit_w_ = w;
    oit_h_ = h;
}

void ViewportCore::encodeOitAccumulate(WGPUCommandEncoder enc) {
    ensureOitTextures(msaa_w_, msaa_h_);

    WGPURenderPassColorAttachment c[2] = {};
    c[0].view          = oit_accum_msaa_view_;
    c[0].resolveTarget = oit_accum_view_;
    c[0].loadOp        = WGPULoadOp_Clear;
    c[0].storeOp       = WGPUStoreOp_Discard;
    c[0].clearValue    = { 0.0, 0.0, 0.0, 0.0 };
    c[0].depthSlice    = WGPU_DEPTH_SLICE_UNDEFINED;
    c[1] = c[0];
    c[1].view          = oit_reveal_msaa_view_;
    c[1].resolveTarget = oit_reveal_view_;
    c[1].clearValue    = { 1.0, 1.0, 1.0, 1.0 };

    WGPURenderPassDepthStencilAttachment d = {};
    d.view            = depth_view_;
    d.depthReadOnly   = true;
    d.stencilReadOnly = true;
    d.depthLoadOp     = WGPULoadOp_Undefined;
    d.depthStoreOp    = WGPUStoreOp_Undefined;
    d.stencilLoadOp   = WGPULoadOp_Undefined;
    d.stencilStoreOp  = WGPUStoreOp_Undefined;

    WGPURenderPassDescriptor pd = {};
    pd.colorAttachmentCount   = 2;
    pd.colorAttachments       = c;
    pd.depthStencilAttachment = &d;
    pd.label                  = oitLabel("ifcviewer-wgpu.oit_accumulate_pass");
    WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &pd);
    wgpuRenderPassEncoderSetPipeline(pass, oit_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, frame_bind_group_, 0, nullptr);
    for (const auto& [id, m] : models_gpu_) {
        if (!m.drawable()) continue;
        for (const auto& ch : m.chunks) {
            if (!ch.bind_group) continue;
            const std::uint32_t n = ch.total_visible_vertices - ch.opaque_visible_vertices;
            if (n == 0) continue;
            wgpuRenderPassEncoderSetBindGroup(pass, 1, ch.bind_group, 0, nullptr);
            wgpuRenderPassEncoderDraw(pass, n, 1, ch.opaque_visible_vertices, 0);
        }
    }
    wgpuRenderPassEncoderEnd(pass);
    wgpuRenderPassEncoderRelease(pass);
}

void ViewportCore::encodeOitResolve(WGPURenderPassEncoder pass) {
    wgpuRenderPassEncoderSetPipeline(pass, oit_composite_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, oit_composite_group_, 0, nullptr);
    wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);

    wgpuRenderPassEncoderSetPipeline(pass, oit_depth_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, frame_bind_group_, 0, nullptr);
    for (const auto& [id, m] : models_gpu_) {
        if (!m.drawable()) continue;
        for (const auto& ch : m.chunks) {
            if (!ch.bind_group) continue;
            const std::uint32_t n = ch.total_visible_vertices - ch.opaque_visible_vertices;
            if (n == 0) continue;
            wgpuRenderPassEncoderSetBindGroup(pass, 1, ch.bind_group, 0, nullptr);
            wgpuRenderPassEncoderDraw(pass, n, 1, ch.opaque_visible_vertices, 0);
        }
    }
}
