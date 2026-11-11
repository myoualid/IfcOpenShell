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

// Sun shadows: one depth map from the key light, fitted to the scene. See the
// comment on ShadowSettings in ViewportCore.h.

#include "ViewportCore.h"

#include "CameraMath.h"
#include "Log.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>

namespace {

WGPUStringView shadowLabel(const char* s) {
    return WGPUStringView{ s, std::strlen(s) };
}

WGPUBuffer makeBuffer(WGPUDevice device, std::uint64_t size, WGPUBufferUsage usage,
                      const char* label) {
    WGPUBufferDescriptor d = {};
    d.size  = std::max<std::uint64_t>(size, 16);
    d.usage = usage;
    d.label = shadowLabel(label);
    return wgpuDeviceCreateBuffer(device, &d);
}

} // namespace

void ViewportCore::setShadows(const ShadowSettings& s) {
    shadow_settings_ = s;
    shadow_settings_.resolution = std::clamp(s.resolution, 512, 8192);
    shadow_dirty_ = true;
    line_accum_count_ = 0;
    host_->requestFrame();
}

void ViewportCore::setGround(const GroundSettings& g) {
    ground_settings_ = g;
    line_accum_count_ = 0;
    host_->requestFrame();
}

void ViewportCore::encodeGround(WGPURenderPassEncoder pass) {
    if (!ground_pipeline_ || !frame_bind_group_ || !ground_settings_.enabled
        || last_frame_uniforms_.ground_params[0] < 0.5f) {
        return;
    }
    wgpuRenderPassEncoderSetPipeline(pass, ground_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, frame_bind_group_, 0, nullptr);
    wgpuRenderPassEncoderDraw(pass, 6, 1, 0, 0);
}

bool ViewportCore::buildShadowPipeline() {
    if (!device_ || !main_shader_module_ || !model_bgl_ || !frame_uniform_buffer_) return false;

    WGPUSamplerDescriptor sd = {};
    sd.addressModeU  = WGPUAddressMode_ClampToEdge;
    sd.addressModeV  = WGPUAddressMode_ClampToEdge;
    sd.addressModeW  = WGPUAddressMode_ClampToEdge;
    sd.magFilter     = WGPUFilterMode_Linear;
    sd.minFilter     = WGPUFilterMode_Linear;
    sd.mipmapFilter  = WGPUMipmapFilterMode_Nearest;
    sd.lodMinClamp   = 0.0f;
    sd.lodMaxClamp   = 1.0f;
    sd.compare       = WGPUCompareFunction_LessEqual;
    sd.maxAnisotropy = 1;
    sd.label         = shadowLabel("ifcviewer-wgpu.shadow_sampler");
    shadow_sampler_ = wgpuDeviceCreateSampler(device_, &sd);

    // The frame bind group samples the map; it needs one before any shadow
    // is drawn.
    ensureShadowTexture(1);

    // The shadow pass reads the frame uniform and the per-object animation
    // state, and must not bind the map it renders into, so it has its own
    // frame layout. Its bind group is built with the main one
    // (buildFrameBindGroup), since both follow the object-state buffer.
    WGPUBindGroupLayoutEntry e[2] = {};
    e[0].binding    = 0;
    e[0].visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
    e[0].buffer.type = WGPUBufferBindingType_Uniform;
    e[0].buffer.minBindingSize = sizeof(FrameUniforms);
    e[1].binding    = 1;
    e[1].visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
    e[1].buffer.type = WGPUBufferBindingType_ReadOnlyStorage;
    WGPUBindGroupLayoutDescriptor bgl = {};
    bgl.entryCount = 2;
    bgl.entries    = e;
    bgl.label      = shadowLabel("ifcviewer-wgpu.shadow_frame_bgl");
    shadow_frame_bgl_ = wgpuDeviceCreateBindGroupLayout(device_, &bgl);

    WGPUBindGroupLayout layouts[2] = { shadow_frame_bgl_, model_bgl_ };
    WGPUPipelineLayoutDescriptor pl = {};
    pl.bindGroupLayoutCount = 2;
    pl.bindGroupLayouts     = layouts;
    pl.label                = shadowLabel("ifcviewer-wgpu.shadow_pipeline_layout");
    shadow_pipeline_layout_ = wgpuDeviceCreatePipelineLayout(device_, &pl);

    WGPUFragmentState frag = {};
    frag.module      = main_shader_module_;
    frag.entryPoint  = shadowLabel("fs_shadow");
    frag.targetCount = 0;

    WGPUDepthStencilState depth = {};
    depth.format              = WGPUTextureFormat_Depth32Float;
    depth.depthWriteEnabled   = WGPUOptionalBool_True;
    depth.depthCompare        = WGPUCompareFunction_Less;
    depth.stencilFront.compare = WGPUCompareFunction_Always;
    depth.stencilBack.compare  = WGPUCompareFunction_Always;
    // Grazing faces need more offset than face-on ones.
    depth.depthBiasSlopeScale = 1.5f;

    WGPURenderPipelineDescriptor rp = {};
    rp.layout             = shadow_pipeline_layout_;
    rp.label              = shadowLabel("ifcviewer-wgpu.shadow_pipeline");
    rp.vertex.module      = main_shader_module_;
    rp.vertex.entryPoint  = shadowLabel("vs_shadow");
    rp.fragment           = &frag;
    rp.depthStencil       = &depth;
    rp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
    // IFC meshes are often single-sided; both faces must cast.
    rp.primitive.cullMode = WGPUCullMode_None;
    rp.multisample.count  = 1;
    rp.multisample.mask   = 0xFFFFFFFFu;
    shadow_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &rp);
    if (!shadow_pipeline_) return false;

    // Shadow-catching ground: the main pass's targets, blended over, depth
    // tested but not written so the edge pass ignores it.
    WGPUPipelineLayoutDescriptor gpl = {};
    gpl.bindGroupLayoutCount = 1;
    gpl.bindGroupLayouts     = &frame_bgl_;
    gpl.label                = shadowLabel("ifcviewer-wgpu.ground_pipeline_layout");
    ground_pipeline_layout_ = wgpuDeviceCreatePipelineLayout(device_, &gpl);

    WGPUBlendState blend = {};
    blend.color.srcFactor = WGPUBlendFactor_SrcAlpha;
    blend.color.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
    blend.color.operation = WGPUBlendOperation_Add;
    blend.alpha.srcFactor = WGPUBlendFactor_One;
    blend.alpha.dstFactor = WGPUBlendFactor_OneMinusSrcAlpha;
    blend.alpha.operation = WGPUBlendOperation_Add;
    WGPUColorTargetState target = {};
    target.format    = surface_view_format_;
    target.blend     = &blend;
    target.writeMask = WGPUColorWriteMask_All;
    WGPUFragmentState gfrag = {};
    gfrag.module      = main_shader_module_;
    gfrag.entryPoint  = shadowLabel("fs_ground");
    gfrag.targetCount = 1;
    gfrag.targets     = &target;
    WGPUDepthStencilState gdepth = {};
    gdepth.format              = WGPUTextureFormat_Depth32Float;
    gdepth.depthWriteEnabled   = WGPUOptionalBool_False;
    gdepth.depthCompare        = WGPUCompareFunction_Less;
    gdepth.stencilFront.compare = WGPUCompareFunction_Always;
    gdepth.stencilBack.compare  = WGPUCompareFunction_Always;
    WGPURenderPipelineDescriptor grp = {};
    grp.layout             = ground_pipeline_layout_;
    grp.label              = shadowLabel("ifcviewer-wgpu.ground_pipeline");
    grp.vertex.module      = main_shader_module_;
    grp.vertex.entryPoint  = shadowLabel("vs_ground");
    grp.fragment           = &gfrag;
    grp.depthStencil       = &gdepth;
    grp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
    grp.primitive.cullMode = WGPUCullMode_None;
    grp.multisample.count  = kViewportSampleCount;
    grp.multisample.mask   = 0xFFFFFFFFu;
    ground_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &grp);
    return true;
}

void ViewportCore::releaseShadowResources() {
    for (auto& [id, m] : models_gpu_) {
        for (auto& c : m.chunks) {
            if (c.shadow_bind_group) { wgpuBindGroupRelease(c.shadow_bind_group); c.shadow_bind_group = nullptr; }
        }
    }
    if (ground_pipeline_)         { wgpuRenderPipelineRelease(ground_pipeline_);        ground_pipeline_ = nullptr; }
    if (ground_pipeline_layout_)  { wgpuPipelineLayoutRelease(ground_pipeline_layout_); ground_pipeline_layout_ = nullptr; }
    if (shadow_pipeline_)         { wgpuRenderPipelineRelease(shadow_pipeline_);        shadow_pipeline_ = nullptr; }
    if (shadow_frame_bind_group_) { wgpuBindGroupRelease(shadow_frame_bind_group_);     shadow_frame_bind_group_ = nullptr; }
    if (shadow_pipeline_layout_)  { wgpuPipelineLayoutRelease(shadow_pipeline_layout_); shadow_pipeline_layout_ = nullptr; }
    if (shadow_frame_bgl_)        { wgpuBindGroupLayoutRelease(shadow_frame_bgl_);      shadow_frame_bgl_ = nullptr; }
    if (shadow_sampler_)          { wgpuSamplerRelease(shadow_sampler_);                shadow_sampler_ = nullptr; }
    if (shadow_view_)             { wgpuTextureViewRelease(shadow_view_);               shadow_view_ = nullptr; }
    if (shadow_texture_)          { wgpuTextureRelease(shadow_texture_);                shadow_texture_ = nullptr; }
    shadow_size_  = 0;
    shadow_dirty_ = true;
    shadow_key_.clear();
}

void ViewportCore::ensureShadowTexture(int size) {
    if (size == shadow_size_ && shadow_texture_) return;
    if (shadow_view_)    { wgpuTextureViewRelease(shadow_view_); shadow_view_ = nullptr; }
    if (shadow_texture_) { wgpuTextureRelease(shadow_texture_);  shadow_texture_ = nullptr; }

    WGPUTextureDescriptor td = {};
    td.size          = { std::uint32_t(size), std::uint32_t(size), 1 };
    td.mipLevelCount = 1;
    td.sampleCount   = 1;
    td.dimension     = WGPUTextureDimension_2D;
    td.format        = WGPUTextureFormat_Depth32Float;
    td.usage         = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
    td.label         = shadowLabel("ifcviewer-wgpu.shadow_map");
    shadow_texture_ = wgpuDeviceCreateTexture(device_, &td);
    shadow_view_    = wgpuTextureCreateView(shadow_texture_, nullptr);
    shadow_size_    = size;
    shadow_dirty_   = true;
    shadow_key_.clear();
    // The frame bind group holds the old view.
    if (frame_bind_group_) buildFrameBindGroup();
}

void ViewportCore::updateShadowState() {
    if (!shadow_settings_.enabled || !shadow_pipeline_) return;
    ensureShadowTexture(shadow_settings_.resolution);

    Eigen::Vector3f L(shading_.key_dir[0], shading_.key_dir[1], shading_.key_dir[2]);
    if (L.squaredNorm() <= 0.0f) L = Eigen::Vector3f(0.0f, 0.0f, 1.0f);
    L.normalize();

    // Everything the map depends on. Equal to the last map's: nothing to do.
    std::vector<float> key = {
        L.x(), L.y(), L.z(), float(shadow_size_),
        float(scene_epoch_ & 0xFFFFFFu), float(scene_epoch_ >> 24),
        float(section_planes_.size()),
    };
    for (const SectionPlane& p : section_planes_) {
        key.insert(key.end(), { p.n.x(), p.n.y(), p.n.z(), p.d });
    }
    if (!shadow_dirty_ && key == shadow_key_) return;
    shadow_key_   = key;
    shadow_dirty_ = true;

    // Bounds of every visible instance. Hidden ones neither cast nor need
    // room in the map.
    Eigen::Vector3f mn = Eigen::Vector3f::Constant(std::numeric_limits<float>::infinity());
    Eigen::Vector3f mx = -mn;
    for (const auto& [id, m] : models_gpu_) {
        if (!m.drawable()) continue;
        for (const auto& ci : m.cull_instances) {
            if (visibility_.isHidden(ci.object_id)) continue;
            mn = mn.cwiseMin(Eigen::Vector3f(ci.aabb_min[0], ci.aabb_min[1], ci.aabb_min[2]));
            mx = mx.cwiseMax(Eigen::Vector3f(ci.aabb_max[0], ci.aabb_max[1], ci.aabb_max[2]));
        }
    }
    if (!(mn.x() <= mx.x())) { shadow_texel_world_ = 0.0f; return; }
    for (int i = 0; i < 3; ++i) { shadow_scene_min_[i] = mn[i]; shadow_scene_max_[i] = mx[i]; }

    const Eigen::Vector3f centre = 0.5f * (mn + mx);
    const float radius = std::max(0.5f * (mx - mn).norm(), 0.01f);
    const Eigen::Vector3f up = std::abs(L.z()) > 0.99f ? Eigen::Vector3f(0.0f, 1.0f, 0.0f)
                                                        : Eigen::Vector3f(0.0f, 0.0f, 1.0f);
    const Eigen::Matrix4f view = lookAtRH(centre + L * (2.0f * radius), centre, up);

    // Tight box around the eight corners in light space.
    Eigen::Vector3f lmn = Eigen::Vector3f::Constant(std::numeric_limits<float>::infinity());
    Eigen::Vector3f lmx = -lmn;
    for (int i = 0; i < 8; ++i) {
        const Eigen::Vector4f c((i & 1) ? mx.x() : mn.x(), (i & 2) ? mx.y() : mn.y(),
                                (i & 4) ? mx.z() : mn.z(), 1.0f);
        const Eigen::Vector3f v = (view * c).head<3>();
        lmn = lmn.cwiseMin(v);
        lmx = lmx.cwiseMax(v);
    }
    const float pad = 0.01f * radius;
    const float l = lmn.x() - pad, r = lmx.x() + pad;
    const float b = lmn.y() - pad, t = lmx.y() + pad;
    // Right-handed view: the scene lies at negative z.
    const float near_d = -lmx.z() - pad;
    const float far_d  = -lmn.z() + pad;
    Eigen::Matrix4f z_remap = Eigen::Matrix4f::Identity();
    z_remap(2, 2) = 0.5f;
    z_remap(2, 3) = 0.5f;
    const Eigen::Matrix4f vp = z_remap * orthoGL(l, r, b, t, near_d, far_d) * view;
    std::memcpy(shadow_light_vp_, vp.data(), sizeof(shadow_light_vp_));

    shadow_texel_world_ = std::max(r - l, t - b) / float(shadow_size_);
    // One texel of world depth, in the map's 0..1 depth units.
    shadow_depth_bias_  = shadow_texel_world_ / std::max(far_d - near_d, 1e-3f);
}

void ViewportCore::encodeShadowPassIfDirty(WGPUCommandEncoder enc) {
    if (!shadow_settings_.enabled || !shadow_pipeline_ || !shadow_dirty_
        || shadow_size_ <= 1 || !shadow_frame_bind_group_) {
        return;
    }
    shadow_dirty_ = false;

    // Casters: every visible opaque instance of every resident chunk, at full
    // detail. Transparent ones (glass, ghosted elements) let the sun through.
    std::vector<ModelGpuData::VisibleDrawGpu> draws;
    std::vector<std::uint32_t> prefix;
    for (auto& [id, m] : models_gpu_) {
        for (std::size_t chunk_idx = 0; chunk_idx < m.chunks.size(); ++chunk_idx) {
            auto& c = m.chunks[chunk_idx];
            c.shadow_vertex_count = 0;
            if (c.shadow_bind_group) { wgpuBindGroupRelease(c.shadow_bind_group); c.shadow_bind_group = nullptr; }
            if (!m.drawable() || !c.is_resident || !c.vertex_slice.valid() || !c.index_slice.valid()
                || !m.mesh_storage || !m.instance_storage
                || m.cull_instances.size() != m.instances.size()) {
                continue;
            }
            draws.clear();
            prefix.assign(1, 0u);
            for (std::uint32_t i : c.instance_ids) {
                const auto& ci = m.cull_instances[i];
                if (ci.mesh_id >= m.meshes.size() || visibility_.isHidden(ci.object_id)) continue;
                // Hidden and ghosted schedule phases cast nothing.
                const std::uint8_t phase = schedulePhase(ci.object_id);
                if (phase == kPhaseHidden || phase == kPhaseGhost) continue;
                const bool transparent = ci.color_override_rgba8 != 0u
                    ? ((ci.color_override_rgba8 >> 24) & 0xFFu) < 255u
                    : (ci.mesh_id < m.mesh_has_alpha.size() && m.mesh_has_alpha[ci.mesh_id] != 0);
                if (transparent) continue;
                ModelGpuData::VisibleDrawGpu d;
                d.mesh_id       = ci.mesh_id;
                d.instance_idx  = i;
                d.ebo_first_u32 = m.instance_ebo_first_u32[i];
                d.base_vertex   = m.instance_base_vertex[i];
                draws.push_back(d);
                prefix.push_back(prefix.back() + m.meshes[ci.mesh_id].index_count);
            }
            if (draws.empty()) continue;

            if (c.shadow_draws_capacity < draws.size()) {
                if (c.shadow_draws_buffer)  wgpuBufferRelease(c.shadow_draws_buffer);
                if (c.shadow_prefix_buffer) wgpuBufferRelease(c.shadow_prefix_buffer);
                c.shadow_draws_capacity = draws.size();
                const auto usage = WGPUBufferUsage_Storage | WGPUBufferUsage_CopyDst;
                c.shadow_draws_buffer = makeBuffer(device_,
                    c.shadow_draws_capacity * sizeof(ModelGpuData::VisibleDrawGpu), usage,
                    "model.chunk.shadow_draws");
                c.shadow_prefix_buffer = makeBuffer(device_,
                    (c.shadow_draws_capacity + 1) * sizeof(std::uint32_t), usage,
                    "model.chunk.shadow_prefix");
            }
            if (!c.shadow_uniform) {
                c.shadow_uniform = makeBuffer(device_, 16,
                    WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst, "model.chunk.shadow_uniform");
            }
            wgpuQueueWriteBuffer(queue_, c.shadow_draws_buffer, 0, draws.data(),
                                 draws.size() * sizeof(ModelGpuData::VisibleDrawGpu));
            wgpuQueueWriteBuffer(queue_, c.shadow_prefix_buffer, 0, prefix.data(),
                                 prefix.size() * sizeof(std::uint32_t));
            const std::uint32_t um[4] = { std::uint32_t(draws.size()), prefix.back(), prefix.back(),
                                          std::uint32_t(draws.size()) };
            wgpuQueueWriteBuffer(queue_, c.shadow_uniform, 0, um, sizeof(um));
            c.shadow_vertex_count = prefix.back();

            WGPUBindGroupEntry entries[7] = {};
            entries[0].binding = 0;
            entries[0].buffer  = c.vertex_slice.buffer;
            entries[0].offset  = c.vertex_slice.offset;
            entries[0].size    = c.vertex_slice.size;
            entries[1].binding = 1;
            entries[1].buffer  = m.mesh_storage;
            entries[1].size    = WGPU_WHOLE_SIZE;
            entries[2].binding = 2;
            entries[2].buffer  = m.instance_storage;
            entries[2].size    = WGPU_WHOLE_SIZE;
            entries[3].binding = 3;
            entries[3].buffer  = c.index_slice.buffer;
            entries[3].offset  = c.index_slice.offset;
            entries[3].size    = c.index_slice.size;
            entries[4].binding = 4;
            entries[4].buffer  = c.shadow_draws_buffer;
            entries[4].size    = WGPU_WHOLE_SIZE;
            entries[5].binding = 5;
            entries[5].buffer  = c.shadow_prefix_buffer;
            entries[5].size    = WGPU_WHOLE_SIZE;
            entries[6].binding = 6;
            entries[6].buffer  = c.shadow_uniform;
            entries[6].size    = 16;
            WGPUBindGroupDescriptor desc = {};
            desc.layout     = model_bgl_;
            desc.entryCount = 7;
            desc.entries    = entries;
            desc.label      = shadowLabel("ifcviewer-wgpu.chunk_shadow_bind_group");
            c.shadow_bind_group = wgpuDeviceCreateBindGroup(device_, &desc);
        }
    }

    WGPURenderPassDepthStencilAttachment depth = {};
    depth.view            = shadow_view_;
    depth.depthLoadOp     = WGPULoadOp_Clear;
    depth.depthStoreOp    = WGPUStoreOp_Store;
    depth.depthClearValue = 1.0f;
    depth.stencilLoadOp   = WGPULoadOp_Undefined;
    depth.stencilStoreOp  = WGPUStoreOp_Undefined;
    depth.stencilReadOnly = true;
    WGPURenderPassDescriptor pd = {};
    pd.depthStencilAttachment = &depth;
    pd.label = shadowLabel("ifcviewer-wgpu.shadow_pass");
    WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(enc, &pd);
    wgpuRenderPassEncoderSetPipeline(pass, shadow_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, shadow_frame_bind_group_, 0, nullptr);
    for (const auto& [id, m] : models_gpu_) {
        for (const auto& c : m.chunks) {
            if (!c.shadow_bind_group || c.shadow_vertex_count == 0) continue;
            wgpuRenderPassEncoderSetBindGroup(pass, 1, c.shadow_bind_group, 0, nullptr);
            wgpuRenderPassEncoderDraw(pass, c.shadow_vertex_count, 1, 0, 0);
        }
    }
    wgpuRenderPassEncoderEnd(pass);
    wgpuRenderPassEncoderRelease(pass);
}
