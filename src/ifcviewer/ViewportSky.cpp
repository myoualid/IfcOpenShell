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

// Gradient sky behind the model. See the comment on SkySettings in
// ViewportCore.h; the shader is vs_sky / fs_sky in the main WGSL module.

#include "ViewportCore.h"

#include <cstring>

namespace {
WGPUStringView skyLabel(const char* s) {
    return WGPUStringView{ s, std::strlen(s) };
}
} // namespace

void ViewportCore::setSky(const SkySettings& s) {
    sky_settings_ = s;
    line_accum_count_ = 0;
    host_->requestFrame();
}

bool ViewportCore::buildSkyPipeline() {
    if (!device_ || !main_shader_module_ || !frame_bgl_) return false;

    WGPUPipelineLayoutDescriptor pl = {};
    pl.bindGroupLayoutCount = 1;
    pl.bindGroupLayouts     = &frame_bgl_;
    pl.label                = skyLabel("ifcviewer-wgpu.sky_pipeline_layout");
    sky_pipeline_layout_ = wgpuDeviceCreatePipelineLayout(device_, &pl);

    WGPUColorTargetState target = {};
    target.format    = surface_view_format_;
    target.writeMask = WGPUColorWriteMask_All;
    WGPUFragmentState frag = {};
    frag.module      = main_shader_module_;
    frag.entryPoint  = skyLabel("fs_sky");
    frag.targetCount = 1;
    frag.targets     = &target;

    // Behind everything: never tested, never written.
    WGPUDepthStencilState depth = {};
    depth.format              = WGPUTextureFormat_Depth32Float;
    depth.depthWriteEnabled   = WGPUOptionalBool_False;
    depth.depthCompare        = WGPUCompareFunction_Always;
    depth.stencilFront.compare = WGPUCompareFunction_Always;
    depth.stencilBack.compare  = WGPUCompareFunction_Always;

    WGPURenderPipelineDescriptor rp = {};
    rp.layout             = sky_pipeline_layout_;
    rp.label              = skyLabel("ifcviewer-wgpu.sky_pipeline");
    rp.vertex.module      = main_shader_module_;
    rp.vertex.entryPoint  = skyLabel("vs_sky");
    rp.fragment           = &frag;
    rp.depthStencil       = &depth;
    rp.primitive.topology = WGPUPrimitiveTopology_TriangleList;
    rp.primitive.cullMode = WGPUCullMode_None;
    rp.multisample.count  = kViewportSampleCount;
    rp.multisample.mask   = 0xFFFFFFFFu;
    sky_pipeline_ = wgpuDeviceCreateRenderPipeline(device_, &rp);
    return sky_pipeline_ != nullptr;
}

void ViewportCore::releaseSkyResources() {
    if (sky_pipeline_)        { wgpuRenderPipelineRelease(sky_pipeline_);        sky_pipeline_ = nullptr; }
    if (sky_pipeline_layout_) { wgpuPipelineLayoutRelease(sky_pipeline_layout_); sky_pipeline_layout_ = nullptr; }
}

void ViewportCore::encodeSky(WGPURenderPassEncoder pass, const float clear_rgba[4]) {
    if (!sky_settings_.enabled || !sky_pipeline_ || !frame_bind_group_) return;
    // A transparent snapshot asked for no background at all.
    if (clear_rgba[3] < 1.0f) return;
    wgpuRenderPassEncoderSetPipeline(pass, sky_pipeline_);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, frame_bind_group_, 0, nullptr);
    wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
}
