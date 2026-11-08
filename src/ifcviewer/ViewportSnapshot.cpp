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

// Offscreen viewport snapshots: ViewportCore::requestSnapshot and the job
// that streams, tiles, reads back and delivers the image. See the comment on
// requestSnapshot in ViewportCore.h for the design.

#include "ViewportCore.h"

#include "Log.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace {

constexpr float kPi = 3.14159265358979323846f;

// Map callbacks fire from the JS event loop on web and from
// wgpuInstanceProcessEvents on wgpu-native (see kAsyncCbMode in
// ViewportCore.cpp).
constexpr WGPUCallbackMode kSnapshotCbMode =
#if defined(__EMSCRIPTEN__)
    WGPUCallbackMode_AllowSpontaneous;
#else
    WGPUCallbackMode_AllowProcessEvents;
#endif

// CPU time spent encoding tiles per frame before yielding to the browser.
constexpr std::int64_t kTileBudgetMs = 40;
// Residency that has not moved for this long, with nothing loading, will not
// move: the view wants more than the geometry budget holds.
constexpr std::int64_t kStreamingStallMs = 1500;

WGPUStringView snapshotLabel(const char* s) {
    return WGPUStringView{ s, std::strlen(s) };
}

inline float srgbToLinear(float c) {
    return (c <= 0.04045f) ? (c * (1.0f / 12.92f))
                           : std::pow((c + 0.055f) * (1.0f / 1.055f), 2.4f);
}

inline std::uint8_t linearToSrgb8(float l) {
    l = std::min(std::max(l, 0.0f), 1.0f);
    const float s = (l <= 0.0031308f) ? l * 12.92f
                                      : 1.055f * std::pow(l, 1.0f / 2.4f) - 0.055f;
    return std::uint8_t(std::lround(s * 255.0f));
}

// The target holds premultiplied colour, sRGB-encoded by the texture format.
// Straight alpha divides in linear space; opaque and empty pixels (nearly all
// of them) skip the maths.
void unpremultiplyRow(const std::uint8_t* src, std::uint8_t* dst, int width, bool bgra) {
    static float lut[256];
    static bool lut_ready = false;
    if (!lut_ready) {
        for (int i = 0; i < 256; ++i) lut[i] = srgbToLinear(float(i) / 255.0f);
        lut_ready = true;
    }
    const int ri = bgra ? 2 : 0;
    const int bi = bgra ? 0 : 2;
    for (int x = 0; x < width; ++x) {
        const std::uint8_t* s = src + x * 4;
        std::uint8_t*       d = dst + x * 4;
        const std::uint8_t a = s[3];
        if (a == 255) {
            d[0] = s[ri]; d[1] = s[1]; d[2] = s[bi]; d[3] = 255;
        } else if (a == 0) {
            d[0] = d[1] = d[2] = d[3] = 0;
        } else {
            const float inv = 255.0f / float(a);
            d[0] = linearToSrgb8(lut[s[ri]] * inv);
            d[1] = linearToSrgb8(lut[s[1]]  * inv);
            d[2] = linearToSrgb8(lut[s[bi]] * inv);
            d[3] = a;
        }
    }
}

} // namespace

void ViewportCore::requestSnapshot(const SnapshotRequest& request) {
    if (request.width < 1 || request.height < 1
        || request.width > kMaxSnapshotDim || request.height > kMaxSnapshotDim) {
        Log::warn() << "[snapshot] rejected " << request.width << "x" << request.height
                    << " (each side must be 1.." << kMaxSnapshotDim << ")";
        host_->onSnapshotDone(request.token, false, request.width, request.height);
        return;
    }
    snapshot_queue_.push_back(request);
    host_->requestFrame();
}

void ViewportCore::countWantedMissingChunks(std::uint32_t& missing,
                                            std::uint32_t& loading) const {
    missing = loading = 0;
    for (const auto& [session_model_id, m] : models_gpu_) {
        if (!m.drawable()) continue;
        for (const auto& c : m.chunks) {
            if (c.contribution_visible_count == 0 || c.is_resident) continue;
            ++missing;
            if (c.is_loading) ++loading;
        }
    }
}

void ViewportCore::enterSnapshotCamera(const SnapshotJob& job, const Eigen::Matrix4f& crop) {
    saved_camera_[0] = camera_target_[0];
    saved_camera_[1] = camera_target_[1];
    saved_camera_[2] = camera_target_[2];
    saved_camera_[3] = camera_distance_;
    saved_camera_[4] = camera_yaw_deg_;
    saved_camera_[5] = camera_pitch_deg_;
    saved_ortho_     = projection_ortho_;
    camera_target_[0] = job.target[0];
    camera_target_[1] = job.target[1];
    camera_target_[2] = job.target[2];
    camera_distance_  = job.distance;
    camera_yaw_deg_   = job.yaw;
    camera_pitch_deg_ = job.pitch;
    projection_ortho_ = job.ortho;
    aspect_override_  = float(job.request.width) / float(job.request.height);
    ndc_crop_         = crop;
}

void ViewportCore::leaveSnapshotCamera() {
    camera_target_[0] = saved_camera_[0];
    camera_target_[1] = saved_camera_[1];
    camera_target_[2] = saved_camera_[2];
    camera_distance_  = saved_camera_[3];
    camera_yaw_deg_   = saved_camera_[4];
    camera_pitch_deg_ = saved_camera_[5];
    projection_ortho_ = saved_ortho_;
    aspect_override_  = 0.0f;
    ndc_crop_         = Eigen::Matrix4f::Identity();
}

bool ViewportCore::stepSnapshot() {
    if (!snapshot_job_) {
        if (snapshot_queue_.empty()) return false;
        auto job = std::make_unique<SnapshotJob>();
        job->request = snapshot_queue_.front();
        snapshot_queue_.erase(snapshot_queue_.begin());

        const SnapshotRequest& r = job->request;
        const float* bg = r.use_view_background ? background_color_.data() : r.background;
        const float a = std::min(std::max(bg[3], 0.0f), 1.0f);
        job->clear_rgba[0] = srgbToLinear(bg[0]) * a;
        job->clear_rgba[1] = srgbToLinear(bg[1]) * a;
        job->clear_rgba[2] = srgbToLinear(bg[2]) * a;
        job->clear_rgba[3] = a;
        job->target[0] = camera_target_[0];
        job->target[1] = camera_target_[1];
        job->target[2] = camera_target_[2];
        job->distance  = camera_distance_;
        job->yaw       = camera_yaw_deg_;
        job->pitch     = camera_pitch_deg_;
        job->ortho     = projection_ortho_;
        job->started.start();
        job->since_progress.start();
        snapshot_job_ = std::move(job);
        Log::info() << "[snapshot] " << r.width << "x" << r.height << " started";
    }

    SnapshotJob& job = *snapshot_job_;
    host_->requestFrame();

    // Fire any map completions (wgpu-native; web already ran them) and hand
    // the mapped rows over before deciding anything else.
    wgpuInstanceProcessEvents(instance_);
    deliverSnapshotBands(job);

    const int W = job.request.width;
    const int H = job.request.height;
    const float focal_px =
        0.5f * float(H) / std::tan(camera_fov_y_deg_ * 0.5f * kPi / 180.0f);

    switch (job.phase) {
    case SnapshotJob::Phase::Streaming: {
        // Cull the whole image at its own resolution so streaming fetches
        // what the snapshot will draw (finer LODs than the canvas wants).
        enterSnapshotCamera(job, Eigen::Matrix4f::Identity());
        Eigen::Matrix4f v, p;
        buildViewProj(v, p);
        cullScene(p * v, focal_px, /*interactive=*/false);
        leaveSnapshotCamera();
        driveStreamingLoads();

        std::uint32_t missing = 0, loading = 0;
        countWantedMissingChunks(missing, loading);
        if (missing != job.last_missing || loading > 0) {
            job.last_missing = missing;
            job.since_progress.start();
        }
        const bool timed_out = job.started.elapsed() >= job.request.timeout_ms;
        const bool stalled   = job.since_progress.elapsed() >= kStreamingStallMs;
        if (missing == 0 || timed_out || stalled) {
            if (missing > 0) {
                Log::warn() << "[snapshot] drawing with " << missing
                            << " wanted chunk(s) not resident ("
                            << (timed_out ? "timed out" : "geometry budget full") << ")";
            }
            job.phase = SnapshotJob::Phase::Rendering;
        }
        return true;
    }
    case SnapshotJob::Phase::Rendering: {
        // The tiles are the canvas's size so they draw into the viewport's
        // own attachments. A resize mid-job changes those: lay out again and
        // start over (rows already delivered are simply delivered again).
        if (job.tile_w != configured_w_ || job.tile_h != configured_h_) {
            releaseSnapshotTiles(job);
            if (!layoutSnapshotTiles(job)) {
                finishSnapshot(false);
                return false;
            }
        }
        Stopwatch budget;
        budget.start();
        const int total = job.cols * job.rows;
        while (job.next_tile < total && !job.failed) {
            renderSnapshotTile(job);
            if (budget.elapsed() >= kTileBudgetMs) break;
        }
        if (job.failed) {
            finishSnapshot(false);
            return false;
        }
        if (job.next_tile >= total) job.phase = SnapshotJob::Phase::Finishing;
        return true;
    }
    case SnapshotJob::Phase::Finishing: {
        // The viewport's attachments are free again; draw the canvas while
        // the last rows map.
        const bool all_done = std::all_of(job.bands.begin(), job.bands.end(),
            [](const SnapshotBand& b) { return b.delivered; });
        if (all_done || job.failed) finishSnapshot(!job.failed);
        return false;
    }
    }
    return false;
}

bool ViewportCore::layoutSnapshotTiles(SnapshotJob& job) {
    const int W = job.request.width;
    const int H = job.request.height;
    job.tile_w = configured_w_;
    job.tile_h = configured_h_;
    // Overlap wide enough for the edge pass's neighbours and the selection
    // halo's dilation, both of which read across the tile border.
    job.margin  = 16 * std::max(1, int(host_->dpr()));
    job.inner_w = job.tile_w - 2 * job.margin;
    job.inner_h = job.tile_h - 2 * job.margin;
    if (job.inner_w < 16 || job.inner_h < 16) {
        Log::warn() << "[snapshot] viewport " << job.tile_w << "x" << job.tile_h
                    << " is too small to render tiles from";
        return false;
    }
    job.cols      = (W + job.inner_w - 1) / job.inner_w;
    job.rows      = (H + job.inner_h - 1) / job.inner_h;
    job.next_tile = 0;
    job.band_bpr  = (std::uint32_t(W) * 4u + 255u) / 256u * 256u;

    WGPUTextureDescriptor desc = {};
    desc.usage         = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_CopySrc;
    desc.dimension     = WGPUTextureDimension_2D;
    desc.size.width    = std::uint32_t(job.tile_w);
    desc.size.height   = std::uint32_t(job.tile_h);
    desc.size.depthOrArrayLayers = 1;
    // Same format as the surface's sRGB view: it is the MSAA resolve target
    // and the edge / outline passes' colour target.
    desc.format        = surface_view_format_;
    desc.mipLevelCount = 1;
    desc.sampleCount   = 1;
    desc.label         = snapshotLabel("ifcviewer-wgpu.snapshot_color");
    job.color_texture = wgpuDeviceCreateTexture(device_, &desc);
    if (!job.color_texture) return false;
    job.color_view = wgpuTextureCreateView(job.color_texture, nullptr);

    job.bands.assign(std::size_t(job.rows), SnapshotBand{});
    for (int r = 0; r < job.rows; ++r) {
        job.bands[r].y0   = r * job.inner_h;
        job.bands[r].rows = std::min(job.inner_h, H - job.bands[r].y0);
    }
    Log::info() << "[snapshot] " << W << "x" << H << " as " << job.cols << "x"
                << job.rows << " tiles of " << job.tile_w << "x" << job.tile_h;
    return true;
}

void ViewportCore::releaseSnapshotTiles(SnapshotJob& job) {
    for (SnapshotBand& b : job.bands) {
        if (b.map) {
            // A callback still to come frees its own state.
            if (b.map->status == 0 && b.buffer) b.map->orphaned = true;
            else delete b.map;
            b.map = nullptr;
        }
        if (b.buffer) { wgpuBufferRelease(b.buffer); b.buffer = nullptr; }
    }
    job.bands.clear();
    if (job.color_view)    { wgpuTextureViewRelease(job.color_view); job.color_view = nullptr; }
    if (job.color_texture) { wgpuTextureRelease(job.color_texture);  job.color_texture = nullptr; }
    job.tile_w = job.tile_h = 0;
}

void ViewportCore::renderSnapshotTile(SnapshotJob& job) {
    const int W   = job.request.width;
    const int H   = job.request.height;
    const int col = job.next_tile % job.cols;
    const int row = job.next_tile / job.cols;
    SnapshotBand& band = job.bands[std::size_t(row)];

    const int x0 = col * job.inner_w;
    const int cw = std::min(job.inner_w, W - x0);
    const int ch = band.rows;

    if (!band.buffer) {
        WGPUBufferDescriptor bdesc = {};
        bdesc.size  = std::uint64_t(job.band_bpr) * std::uint64_t(ch);
        bdesc.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
        bdesc.label = snapshotLabel("ifcviewer-wgpu.snapshot_band");
        band.buffer = createRequiredBuffer(bdesc, "snapshot band");
        if (!band.buffer) { job.failed = true; return; }
    }

    // The tile's window of the image, in image pixels (y down), including
    // the margin on every side; mapped onto the whole target by the crop.
    const float px0 = float(x0 - job.margin);
    const float py0 = float(band.y0 - job.margin);
    const float l = 2.0f * px0 / float(W) - 1.0f;
    const float r = 2.0f * (px0 + float(job.tile_w)) / float(W) - 1.0f;
    const float t = 1.0f - 2.0f * py0 / float(H);
    const float b = 1.0f - 2.0f * (py0 + float(job.tile_h)) / float(H);
    Eigen::Matrix4f crop = Eigen::Matrix4f::Identity();
    crop(0, 0) = 2.0f / (r - l);
    crop(0, 3) = -(r + l) / (r - l);
    crop(1, 1) = 2.0f / (t - b);
    crop(1, 3) = -(t + b) / (t - b);

    // Uniforms and visible-draw lists go through queue writes, which land
    // before the next submit — so every tile is its own submit.
    enterSnapshotCamera(job, crop);
    updateFrameUniforms();
    Eigen::Matrix4f v, p;
    buildViewProj(v, p);
    const Eigen::Matrix4f vp = p * v;
    const float focal_px =
        0.5f * float(H) / std::tan(camera_fov_y_deg_ * 0.5f * kPi / 180.0f);
    cullScene(vp, focal_px, /*interactive=*/false);

    WGPUCommandEncoder enc = wgpuDeviceCreateCommandEncoder(device_, nullptr);
    encodeScene(enc, job.color_view, vp, job.clear_rgba,
                job.tile_w, job.tile_h, /*interactive=*/false);
    leaveSnapshotCamera();

    WGPUTexelCopyTextureInfo src = {};
    src.texture  = job.color_texture;
    src.origin.x = std::uint32_t(job.margin);
    src.origin.y = std::uint32_t(job.margin);
    src.aspect   = WGPUTextureAspect_All;

    WGPUTexelCopyBufferInfo dst = {};
    dst.buffer              = band.buffer;
    dst.layout.offset       = std::uint64_t(x0) * 4u;
    dst.layout.bytesPerRow  = job.band_bpr;
    dst.layout.rowsPerImage = std::uint32_t(ch);

    WGPUExtent3D extent = {};
    extent.width  = std::uint32_t(cw);
    extent.height = std::uint32_t(ch);
    extent.depthOrArrayLayers = 1;
    wgpuCommandEncoderCopyTextureToBuffer(enc, &src, &dst, &extent);

    WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(enc, nullptr);
    wgpuQueueSubmit(queue_, 1, &cmd);
    wgpuCommandBufferRelease(cmd);
    wgpuCommandEncoderRelease(enc);

    // The row is complete: start reading it back while later rows render.
    if (col == job.cols - 1) {
        band.map = new SnapshotMapState();
        band.map->core = this;
        WGPUBufferMapCallbackInfo mcb = {};
        mcb.mode = kSnapshotCbMode;
        mcb.callback = [](WGPUMapAsyncStatus status, WGPUStringView /*message*/,
                          void* ud1, void* /*ud2*/) {
            auto* s = static_cast<SnapshotMapState*>(ud1);
            if (s->orphaned) { delete s; return; }
            s->status = (status == WGPUMapAsyncStatus_Success) ? 1 : 2;
            s->core->host_->requestFrame();
        };
        mcb.userdata1 = band.map;
        wgpuBufferMapAsync(band.buffer, WGPUMapMode_Read, 0,
                           std::size_t(std::uint64_t(job.band_bpr) * std::uint64_t(ch)), mcb);
    }
    ++job.next_tile;
}

void ViewportCore::deliverSnapshotBands(SnapshotJob& job) {
    const bool bgra = surface_view_format_ == WGPUTextureFormat_BGRA8UnormSrgb
                   || surface_view_format_ == WGPUTextureFormat_BGRA8Unorm;
    const int W = job.request.width;
    std::vector<std::uint8_t> rgba;
    for (SnapshotBand& b : job.bands) {
        if (b.delivered || !b.map || b.map->status == 0) continue;
        if (b.map->status == 1) {
            const std::size_t size = std::size_t(job.band_bpr) * std::size_t(b.rows);
            const auto* mapped = static_cast<const std::uint8_t*>(
                wgpuBufferGetConstMappedRange(b.buffer, 0, size));
            if (mapped) {
                rgba.resize(std::size_t(W) * std::size_t(b.rows) * 4u);
                for (int y = 0; y < b.rows; ++y) {
                    unpremultiplyRow(mapped + std::size_t(y) * job.band_bpr,
                                     rgba.data() + std::size_t(y) * std::size_t(W) * 4u,
                                     W, bgra);
                }
                host_->onSnapshotRows(job.request.token, b.y0, W, b.rows, rgba.data());
            } else {
                job.failed = true;
            }
            wgpuBufferUnmap(b.buffer);
        } else {
            Log::warn() << "[snapshot] readback failed for rows " << b.y0
                        << ".." << (b.y0 + b.rows);
            job.failed = true;
        }
        delete b.map;
        b.map = nullptr;
        wgpuBufferRelease(b.buffer);
        b.buffer = nullptr;
        b.delivered = true;
    }
}

void ViewportCore::finishSnapshot(bool ok) {
    if (!snapshot_job_) return;
    SnapshotJob& job = *snapshot_job_;
    releaseSnapshotTiles(job);
    Log::info() << "[snapshot] " << job.request.width << "x" << job.request.height
                << (ok ? " done in " : " failed after ") << job.started.elapsed() << " ms";
    host_->onSnapshotDone(job.request.token, ok, job.request.width, job.request.height);
    snapshot_job_.reset();
    // The snapshot culls left the canvas's cull stale (cullScene invalidated
    // the cache); the next frame culls and draws the canvas again.
    host_->requestFrame();
}
