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

#ifndef TILEWORLDRENDERER_H
#define TILEWORLDRENDERER_H

#include "TileWorld.h"

#include <webgpu/webgpu.h>

#include <cstdint>
#include <vector>

// Draws a tw::TileWorld in two passes:
//
//   1. Every quad of TileWorld::buildDrawList, in order, into a texture the
//      size of the native screen (160x144 by default). Texels are fetched with
//      textureLoad at integer coordinates, so there is no filtering and no
//      bleeding between atlas tiles. Alpha is 1-bit, like hardware sprites.
//   2. That texture onto the swapchain at the largest whole-number scale that
//      fits, centred, letterboxed. Every native pixel becomes an exact NxN
//      block. The palette remap (original / 4-shade green / 4-shade grey), the
//      warp fade, and the optional LCD grid happen here.
class TileWorldRenderer {
public:
    enum Palette : int { PaletteOriginal = 0, PaletteDmg = 1, PalettePocket = 2 };

    TileWorldRenderer() = default;
    ~TileWorldRenderer();
    TileWorldRenderer(const TileWorldRenderer&)            = delete;
    TileWorldRenderer& operator=(const TileWorldRenderer&) = delete;

    bool init(WGPUDevice device, WGPUQueue queue, WGPUTextureFormat target_format);
    void destroy();
    bool ready() const { return sprite_pipeline_ && blit_pipeline_; }

    // RGBA8, row-major, w*h*4 bytes, sRGB-encoded values (as a PNG would be).
    void setAtlas(const uint8_t* rgba, int w, int h);
    void setPalette(int p) { palette_ = p; }
    int  palette() const { return palette_; }
    void setLcdGrid(bool on) { lcd_grid_ = on; }
    // 0 = largest whole scale that fits the native screen (letterboxed).
    // N > 0 = every world pixel is N device pixels, and the native screen is
    // resized to cover the canvas: zooming out shows more of the map.
    void setFixedScale(int n) { fixed_scale_ = n < 0 ? 0 : (n > 16 ? 16 : n); }
    int  fixedScale() const { return fixed_scale_; }
    // What the last frame used, for hosts that place DOM over the canvas.
    struct View { int scale, offset_x, offset_y; };
    View lastView() const { return last_view_; }
    bool lcdGrid() const { return lcd_grid_; }

    // Records both passes into enc. target is the surface view.
    void encode(WGPUCommandEncoder enc, WGPUTextureView target,
                int target_w, int target_h, const tw::TileWorld& world);

private:
    void ensureLowRes(int w, int h);
    void rebuildBindGroups();

    WGPUDevice device_ = nullptr;
    WGPUQueue  queue_  = nullptr;

    WGPUShaderModule    sprite_module_   = nullptr;
    WGPUBindGroupLayout sprite_bgl_      = nullptr;
    WGPUPipelineLayout  sprite_layout_   = nullptr;
    WGPURenderPipeline  sprite_pipeline_ = nullptr;
    WGPUBindGroup       sprite_bg_       = nullptr;
    WGPUBuffer          sprite_uniforms_ = nullptr;
    WGPUBuffer          instance_buffer_ = nullptr;
    uint64_t            instance_capacity_ = 0;

    WGPUShaderModule    blit_module_   = nullptr;
    WGPUBindGroupLayout blit_bgl_      = nullptr;
    WGPUPipelineLayout  blit_layout_   = nullptr;
    WGPURenderPipeline  blit_pipeline_ = nullptr;
    WGPUBindGroup       blit_bg_       = nullptr;
    WGPUBuffer          blit_uniforms_ = nullptr;

    WGPUTexture     atlas_      = nullptr;
    WGPUTextureView atlas_view_ = nullptr;
    WGPUTexture     lowres_      = nullptr;
    WGPUTextureView lowres_view_ = nullptr;
    int lowres_w_ = 0, lowres_h_ = 0;

    int  palette_ = PaletteOriginal;
    bool lcd_grid_ = false;
    int  fixed_scale_ = 0;
    View last_view_{1, 0, 0};

    std::vector<tw::Quad> quads_;
    std::vector<uint8_t>  instance_bytes_;
};

#endif  // TILEWORLDRENDERER_H
