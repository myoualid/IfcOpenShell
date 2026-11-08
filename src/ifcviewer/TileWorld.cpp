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

#include "TileWorld.h"

#include <algorithm>
#include <cmath>

namespace tw {

namespace {

constexpr double kFrameMs = 1000.0 / 60.0;
constexpr int    kTurnGraceFrames = 4;   // tap = turn on the spot; hold longer = walk
constexpr int    kFadeFrames = 12;

void dirDelta(Dir d, int& dx, int& dy) {
    dx = 0; dy = 0;
    switch (d) {
        case DirDown:  dy =  1; break;
        case DirUp:    dy = -1; break;
        case DirLeft:  dx = -1; break;
        case DirRight: dx =  1; break;
    }
}

// The most recently pressed direction wins; otherwise keep the one still held
// in a fixed priority. This is what makes diagonal input feel deterministic.
bool heldDir(uint32_t held, uint32_t pressed, Dir current, bool has_current, Dir& out) {
    static const struct { uint32_t bit; Dir d; } map[] = {
        {BtnUp, DirUp}, {BtnDown, DirDown}, {BtnLeft, DirLeft}, {BtnRight, DirRight}};
    for (const auto& m : map) {
        if (pressed & m.bit) { out = m.d; return true; }
    }
    if (has_current) {
        for (const auto& m : map) {
            if ((held & m.bit) && m.d == current) { out = current; return true; }
        }
    }
    for (const auto& m : map) {
        if (held & m.bit) { out = m.d; return true; }
    }
    return false;
}

uint32_t xorshift(uint32_t& s) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return s;
}

int floorDiv(int a, int b) {
    return (a >= 0) ? a / b : -((-a + b - 1) / b);
}

}  // namespace

TileWorld::TileWorld() = default;

void TileWorld::setScreen(int w_px, int h_px) {
    screen_w_ = std::max(16, w_px);
    screen_h_ = std::max(16, h_px);
    updateCamera(true);
}

void TileWorld::setTileSize(int px) {
    tile_ = (px == 8) ? 8 : 16;
    updateCamera(true);
}

void TileWorld::setMap(int w, int h, const uint16_t* ground, const uint16_t* fg,
                       const uint8_t* flags, uint16_t border_tile) {
    map_w_ = std::max(0, w);
    map_h_ = std::max(0, h);
    const size_t n = size_t(map_w_) * size_t(map_h_);
    ground_.assign(n, 0);
    fg_.assign(n, kEmpty);
    flags_.assign(n, 0);
    if (ground) std::copy(ground, ground + n, ground_.begin());
    if (fg)     std::copy(fg, fg + n, fg_.begin());
    if (flags)  std::copy(flags, flags + n, flags_.begin());
    border_tile_ = border_tile;
    anims_.clear();
    updateCamera(true);
}

void TileWorld::setCell(int cx, int cy, uint16_t ground, uint16_t fg, uint8_t flags) {
    if (!inBounds(cx, cy)) return;
    const size_t i = size_t(cy) * size_t(map_w_) + size_t(cx);
    ground_[i] = ground;
    fg_[i] = fg;
    flags_[i] = flags;
}

void TileWorld::setRegion(int x, int y, int w, int h, uint16_t border_tile) {
    region_x_ = x; region_y_ = y;
    region_w_ = w > 0 ? w : 0;
    region_h_ = h > 0 ? h : 0;
    region_border_ = border_tile;
}

void TileWorld::setTileAnimation(uint16_t base_id, int frames, int period_frames) {
    if (frames <= 1 || period_frames <= 0) { anims_.erase(base_id); return; }
    anims_[base_id] = Anim{frames, period_frames};
}

void TileWorld::setCameraMode(CameraMode m) {
    camera_mode_ = m;
    snap_scrolling_ = false;
    updateCamera(true);
}

uint8_t TileWorld::flagsAt(int cx, int cy) const {
    if (!inBounds(cx, cy)) return CellSolid;
    return flags_[size_t(cy) * size_t(map_w_) + size_t(cx)];
}

int TileWorld::spawnActor(int cx, int cy, int sprite_base, Dir facing, Behavior b) {
    Actor a;
    a.cx = a.from_cx = a.home_cx = cx;
    a.cy = a.from_cy = a.home_cy = cy;
    a.facing = facing;
    a.sprite_base = sprite_base;
    a.behavior = b;
    a.rng = 0x9E3779B9u ^ (uint32_t(actors_.size() + 1) * 0x85EBCA6Bu) ^ uint32_t(cx * 73856093 ^ cy * 19349663);
    if (a.rng == 0) a.rng = 1;
    a.think_frames = 30 + int(xorshift(a.rng) % 90);
    actors_.push_back(a);
    if (actors_.size() == 1) updateCamera(true);
    return int(actors_.size()) - 1;
}

void TileWorld::clearActors() { actors_.clear(); }

void TileWorld::teleportPlayer(int cx, int cy, Dir facing) {
    if (actors_.empty()) return;
    Actor& p = actors_[0];
    p.cx = p.from_cx = cx;
    p.cy = p.from_cy = cy;
    p.facing = facing;
    p.moving = false;
    p.hopping = false;
    p.progress = 0;
    p.bump_frames = 0;
    snap_scrolling_ = false;
    updateCamera(true);
}

void TileWorld::placeActor(int index, int cx, int cy, Dir facing, Behavior b, int wander_radius) {
    if (index < 0 || index >= int(actors_.size())) return;
    if (index == 0) { teleportPlayer(cx, cy, facing); return; }
    Actor& a = actors_[size_t(index)];
    a.cx = a.from_cx = a.home_cx = cx;
    a.cy = a.from_cy = a.home_cy = cy;
    a.facing = facing;
    a.behavior = b;
    a.wander_radius = std::max(0, wander_radius);
    a.moving = a.hopping = false;
    a.progress = 0;
    a.bump_frames = 0;
    a.think_frames = 20 + int(xorshift(a.rng) % 60);
}

void TileWorld::actorPixelPos(int index, int& px, int& py) const {
    px = py = 0;
    if (index < 0 || index >= int(actors_.size())) return;
    int lift;
    actorPixel(actors_[size_t(index)], px, py, lift);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

void TileWorld::advance(double elapsed_ms) {
    if (!enabled_) return;
    // A backgrounded tab returns with a huge delta; never try to catch up more
    // than a few frames, the game just pauses instead.
    accum_ms_ += std::min(elapsed_ms, 100.0);
    int guard = 0;
    while (accum_ms_ >= kFrameMs && guard < 6) {
        step();
        accum_ms_ -= kFrameMs;
        ++guard;
    }
    if (guard == 6) accum_ms_ = 0.0;
}

void TileWorld::step() {
    if (paused_) { prev_buttons_ = buttons_; return; }
    ++frame_;
    last_event_ = EventNone;
    interact_target_ = -1;
    const uint32_t held = buttons_;
    const uint32_t pressed = buttons_ & ~prev_buttons_;
    prev_buttons_ = buttons_;

    // Warp fade owns the frame: nothing moves while the screen is white.
    if (fade_timer_ > 0) {
        --fade_timer_;
        fade_ = 1.0f - float(fade_timer_) / float(kFadeFrames);
        if (fade_timer_ == 0 && pending_warp_ >= 0) {
            const Warp w = warps_[size_t(pending_warp_)];
            pending_warp_ = -1;
            teleportPlayer(w.dst_cx, w.dst_cy, w.dst_facing);
            last_event_ = EventWarped;
            event_mask_ |= 1u << EventWarped;
            fade_timer_ = -kFadeFrames;
        }
        return;
    }
    if (fade_timer_ < 0) {
        ++fade_timer_;
        fade_ = float(-fade_timer_) / float(kFadeFrames);
        if (fade_timer_ == 0) fade_ = 0.0f;
    }

    // Snap camera mode: the world freezes while the screen slides.
    if (snap_scrolling_) {
        const int sx = 4, sy = 4;
        if (cam_x_ < snap_target_x_) cam_x_ = std::min(cam_x_ + sx, snap_target_x_);
        if (cam_x_ > snap_target_x_) cam_x_ = std::max(cam_x_ - sx, snap_target_x_);
        if (cam_y_ < snap_target_y_) cam_y_ = std::min(cam_y_ + sy, snap_target_y_);
        if (cam_y_ > snap_target_y_) cam_y_ = std::max(cam_y_ - sy, snap_target_y_);
        if (cam_x_ == snap_target_x_ && cam_y_ == snap_target_y_) snap_scrolling_ = false;
        return;
    }

    for (size_t i = 0; i < actors_.size(); ++i) {
        stepActor(actors_[i], int(i), i == 0 ? held : 0u, i == 0 ? pressed : 0u);
    }

    // A: talk to whatever the player faces (reaching across a counter).
    if (!actors_.empty() && (pressed & BtnA) && !actors_[0].moving) {
        const Actor& p = actors_[0];
        int dx, dy; dirDelta(p.facing, dx, dy);
        int tx = p.cx + dx, ty = p.cy + dy;
        if (flagsAt(tx, ty) & CellCounter) { tx += dx; ty += dy; }
        for (size_t i = 1; i < actors_.size(); ++i) {
            const Actor& a = actors_[i];
            if (a.alive && a.cx == tx && a.cy == ty) {
                interact_target_ = int(i);
                last_event_ = EventInteract;
                // The NPC turns to face the player, as in the originals.
                Actor& npc = actors_[i];
                npc.facing = Dir(p.facing == DirUp ? DirDown : p.facing == DirDown ? DirUp
                                 : p.facing == DirLeft ? DirRight : DirLeft);
                npc.think_frames = 90;
                break;
            }
        }
    }

    updateCamera(false);
    if (last_event_ != EventNone) event_mask_ |= 1u << last_event_;
    if (interact_target_ >= 0) taken_interact_ = interact_target_;
}

void TileWorld::stepActor(Actor& a, int index, uint32_t held, uint32_t pressed) {
    if (!a.alive) return;
    const bool is_player = (index == 0);
    bool chained = false;

    if (a.moving) {
        a.progress += a.speed;
        if (a.progress >= a.step_len) {
            a.progress = 0;
            a.moving = false;
            a.hopping = false;
            a.from_cx = a.cx;
            a.from_cy = a.cy;
            a.step_parity ^= 1u;
            if (is_player) onPlayerStepEnded();
        } else {
            return;
        }
        // Fall through: a held direction chains straight into the next step on
        // the same frame, so walking is a seamless 1 px/frame glide.
        if (!is_player || pending_warp_ >= 0) return;
        chained = true;
    }

    if (a.bump_frames > 0) --a.bump_frames;

    if (!is_player) { thinkNpc(a, index); return; }

    Dir d;
    if (!heldDir(held, pressed, a.facing, true, d)) {
        a.turn_frames = 0;
        return;
    }
    a.speed = (held & BtnB) ? 2 : 1;

    // Standing still and asked to face a new way: turn first. A tap only
    // turns; holding past the grace period starts walking. Changing direction
    // at the end of a step while already walking needs no grace period.
    if (d != a.facing && chained) {
        a.facing = d;
        a.turn_frames = 0;
    } else if (d != a.facing) {
        a.facing = d;
        a.turn_frames = kTurnGraceFrames;
        return;
    }
    if (a.turn_frames > 0) { --a.turn_frames; return; }

    if (!tryBeginStep(a, index, d)) {
        if (a.bump_frames == 0) {
            a.bump_frames = tile_;        // walk-in-place for one step's worth
            a.step_parity ^= 1u;
            last_event_ = EventBumped;
        }
    }
}

bool TileWorld::cellOccupied(int cx, int cy, int ignore_index) const {
    for (size_t i = 0; i < actors_.size(); ++i) {
        if (int(i) == ignore_index || !actors_[i].alive) continue;
        const Actor& o = actors_[i];
        // Both the cell an actor is leaving and the one it is entering are taken,
        // so two actors can never claim the same cell mid-step.
        if ((o.cx == cx && o.cy == cy) || (o.from_cx == cx && o.from_cy == cy)) return true;
    }
    return false;
}

bool TileWorld::tryBeginStep(Actor& a, int index, Dir d) {
    int dx, dy; dirDelta(d, dx, dy);
    const int tx = a.cx + dx, ty = a.cy + dy;
    const uint8_t f = flagsAt(tx, ty);

    const bool ledge_ok =
        (d == DirDown  && (f & CellLedgeDown)) ||
        (d == DirLeft  && (f & CellLedgeLeft)) ||
        (d == DirRight && (f & CellLedgeRight));
    if (ledge_ok) {
        // Hop clean over the ledge cell and land one beyond it.
        const int lx = tx + dx, ly = ty + dy;
        const uint8_t lf = flagsAt(lx, ly);
        if (lf & (CellSolid | CellWater | CellCounter | CellLedgeDown | CellLedgeLeft | CellLedgeRight))
            return false;
        if (cellOccupied(lx, ly, index)) return false;
        a.from_cx = a.cx; a.from_cy = a.cy;
        a.cx = lx; a.cy = ly;
        a.moving = true; a.hopping = true;
        a.step_len = 2 * tile_;
        a.speed = 1;
        a.progress = a.speed;  // motion starts on the frame the step begins
        return true;
    }

    if (f & (CellSolid | CellWater | CellCounter | CellLedgeDown | CellLedgeLeft | CellLedgeRight))
        return false;
    if (cellOccupied(tx, ty, index)) return false;
    a.from_cx = a.cx; a.from_cy = a.cy;
    a.cx = tx; a.cy = ty;
    a.moving = true;
    a.step_len = tile_;
    a.progress = a.speed;  // motion starts on the frame the step begins
    return true;
}

void TileWorld::thinkNpc(Actor& a, int index) {
    if (a.behavior == Behavior::Static) return;
    if (--a.think_frames > 0) return;
    a.think_frames = 40 + int(xorshift(a.rng) % 100);
    const Dir d = Dir(xorshift(a.rng) % 4);
    a.facing = d;
    if (a.behavior == Behavior::LookAround) return;
    int dx, dy; dirDelta(d, dx, dy);
    const int tx = a.cx + dx, ty = a.cy + dy;
    if (std::abs(tx - a.home_cx) > a.wander_radius || std::abs(ty - a.home_cy) > a.wander_radius) return;
    a.speed = 1;
    tryBeginStep(a, index, d);
}

void TileWorld::onPlayerStepEnded() {
    ++steps_taken_;
    const Actor& p = actors_[0];
    last_event_ = (flagsAt(p.cx, p.cy) & CellGrass) ? EventEnteredGrass : EventStepEnded;
    for (size_t i = 0; i < warps_.size(); ++i) {
        if (warps_[i].src_cx == p.cx && warps_[i].src_cy == p.cy) {
            pending_warp_ = int(i);
            fade_timer_ = kFadeFrames;
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

void TileWorld::actorPixel(const Actor& a, int& px, int& py, int& hop_lift) const {
    hop_lift = 0;
    if (!a.moving) { px = a.cx * tile_; py = a.cy * tile_; return; }
    const int fx = a.from_cx * tile_, fy = a.from_cy * tile_;
    const int tx = a.cx * tile_, ty = a.cy * tile_;
    // Linear in whole pixels: integer progress keeps every frame grid-exact.
    px = fx + (tx - fx) * a.progress / a.step_len;
    py = fy + (ty - fy) * a.progress / a.step_len;
    if (a.hopping) {
        // Parabolic hop, peak of half a tile at mid-step.
        const float t = float(a.progress) / float(a.step_len);
        hop_lift = int(std::lround(4.0f * t * (1.0f - t) * float(tile_) * 0.5f));
    }
}

void TileWorld::updateCamera(bool instant) {
    if (actors_.empty()) return;
    int px, py, lift;
    actorPixel(actors_[0], px, py, lift);

    if (camera_mode_ == CameraMode::Follow) {
        // The player is pinned to a fixed cell, slightly up-left of centre on an
        // even grid (cell 4,4 of a 10x9 screen). Because the player moves in
        // whole pixels and the anchor is a whole number of tiles, the camera
        // lands exactly on the tile grid whenever the player is standing still.
        const int cells_x = screen_w_ / tile_, cells_y = screen_h_ / tile_;
        const int anchor_x = ((cells_x - 1) / 2) * tile_;
        const int anchor_y = ((cells_y - 1) / 2) * tile_;
        cam_x_ = px - anchor_x;
        cam_y_ = py - anchor_y;
        if (camera_clamp_) {
            const int max_x = map_w_ * tile_ - screen_w_;
            const int max_y = map_h_ * tile_ - screen_h_;
            cam_x_ = (max_x <= 0) ? max_x / 2 : std::clamp(cam_x_, 0, max_x);
            cam_y_ = (max_y <= 0) ? max_y / 2 : std::clamp(cam_y_, 0, max_y);
        }
        return;
    }

    // Snap: rooms are whole screens, rounded down to whole tiles.
    const int room_w = (screen_w_ / tile_) * tile_;
    const int room_h = (screen_h_ / tile_) * tile_;
    // Rooms follow the logical cell, which flips to the destination the moment
    // a step starts. So the slide begins as the player steps over the edge and
    // the step then finishes inside the new room, never frozen half-way.
    const Actor& p = actors_[0];
    const int tx = floorDiv(p.cx * tile_, room_w) * room_w;
    const int ty = floorDiv(p.cy * tile_, room_h) * room_h;
    if (instant) {
        cam_x_ = tx; cam_y_ = ty;
        snap_scrolling_ = false;
    } else if (tx != cam_x_ || ty != cam_y_) {
        snap_target_x_ = tx; snap_target_y_ = ty;
        snap_scrolling_ = true;
    }
}

PlayerState TileWorld::playerState() const {
    PlayerState s{};
    if (!actors_.empty()) {
        const Actor& p = actors_[0];
        s.cx = p.cx; s.cy = p.cy;
        s.facing = int(p.facing);
        s.moving = p.moving;
        s.cell_flags = flagsAt(p.cx, p.cy);
    }
    s.cam_x = cam_x_; s.cam_y = cam_y_;
    s.steps_taken = steps_taken_;
    s.last_event = last_event_;
    return s;
}

// ---------------------------------------------------------------------------
// Draw list
// ---------------------------------------------------------------------------

uint16_t TileWorld::animatedTile(uint16_t id) const {
    if (anims_.empty()) return id;
    auto it = anims_.find(id);
    if (it == anims_.end()) return id;
    return uint16_t(id + (frame_ / uint32_t(it->second.period)) % uint32_t(it->second.frames));
}

void TileWorld::tileUV(uint16_t id, uint16_t& u, uint16_t& v) const {
    const int per_row = std::max(1, atlas_w_ / tile_);
    u = uint16_t((id % per_row) * tile_);
    v = uint16_t((id / per_row) * tile_);
}

void TileWorld::buildDrawList(std::vector<Quad>& out) const {
    out.clear();
    if (map_w_ <= 0 || map_h_ <= 0) return;

    const int c0x = floorDiv(cam_x_, tile_), c0y = floorDiv(cam_y_, tile_);
    const int c1x = floorDiv(cam_x_ + screen_w_ - 1, tile_);
    const int c1y = floorDiv(cam_y_ + screen_h_ - 1, tile_);

    auto pushTile = [&](uint16_t id, int wx, int wy, bool flip) {
        Quad q{};
        q.x = int16_t(wx - cam_x_);
        q.y = int16_t(wy - cam_y_);
        q.w = q.h = uint16_t(tile_);
        tileUV(id, q.u, q.v);
        q.flip_x = flip ? 1 : 0;
        q.kind = 0;
        out.push_back(q);
    };

    // ---- Band 1: BG. Ground everywhere, border block outside the map. -------
    for (int cy = c0y; cy <= c1y; ++cy) {
        for (int cx = c0x; cx <= c1x; ++cx) {
            uint16_t id = border_tile_;
            if (!inRegion(cx, cy)) id = region_border_;
            else if (inBounds(cx, cy)) id = ground_[size_t(cy) * size_t(map_w_) + size_t(cx)];
            pushTile(animatedTile(id), cx * tile_, cy * tile_, false);
        }
    }

    // ---- Band 2: actors, painter-sorted by the row their feet are on. -------
    // Sorting on the pixel y of the feet (then x for a stable tie-break) is the
    // oblique trick: whoever is further "south" is closer to the camera and so
    // drawn on top, which lets sprites overlap each other believably.
    struct Item { int foot_y, x; size_t idx; };
    std::vector<Item> order;
    order.reserve(actors_.size());
    for (size_t i = 0; i < actors_.size(); ++i) {
        if (!actors_[i].alive) continue;
        if (!inRegion(actors_[i].cx, actors_[i].cy)) continue;
        int px, py, lift;
        actorPixel(actors_[i], px, py, lift);
        if (px + tile_ < cam_x_ || px > cam_x_ + screen_w_ ||
            py + tile_ < cam_y_ - tile_ || py > cam_y_ + screen_h_) continue;
        order.push_back(Item{py, px, i});
    }
    std::stable_sort(order.begin(), order.end(), [](const Item& a, const Item& b) {
        return a.foot_y != b.foot_y ? a.foot_y < b.foot_y : a.x < b.x;
    });

    for (const Item& it : order) {
        const Actor& a = actors_[it.idx];
        int px, py, lift;
        actorPixel(a, px, py, lift);

        // Frame selection. Six tiles per actor: down, down-walk, up, up-walk,
        // side, side-walk. Right is left mirrored. Up/down walk cycles mirror the
        // walk frame on alternate steps so both legs get a turn.
        const bool animating = a.moving || a.bump_frames > 0;
        const int  phase_len = a.moving ? a.step_len : tile_;
        const int  phase = a.moving ? a.progress : (tile_ - a.bump_frames);
        const bool walk_frame = animating && (phase * 2 < phase_len);
        int  frame = 0;
        bool flip = false;
        switch (a.facing) {
            case DirDown:  frame = walk_frame ? 1 : 0; flip = walk_frame && a.step_parity; break;
            case DirUp:    frame = walk_frame ? 3 : 2; flip = walk_frame && a.step_parity; break;
            case DirLeft:  frame = walk_frame ? 5 : 4; break;
            case DirRight: frame = walk_frame ? 5 : 4; flip = true; break;
        }

        if (a.hopping && shadow_tile_ >= 0) {
            pushTile(uint16_t(shadow_tile_), px, py + 2, false);
        }
        pushTile(uint16_t(a.sprite_base + frame), px, py - sprite_lift_px_ - lift, flip);
    }

    // ---- Band 3: FG. Roofs, canopies, the front blades of tall grass. -------
    // Drawn after every sprite, so anything walking under them is covered.
    for (int cy = c0y; cy <= c1y; ++cy) {
        for (int cx = c0x; cx <= c1x; ++cx) {
            if (!inBounds(cx, cy) || !inRegion(cx, cy)) continue;
            const uint16_t id = fg_[size_t(cy) * size_t(map_w_) + size_t(cx)];
            if (id == kEmpty) continue;
            pushTile(animatedTile(id), cx * tile_, cy * tile_, false);
        }
    }

    // ---- Debug: collision tint on top of everything. ------------------------
    if (debug_collision_) {
        for (int cy = c0y; cy <= c1y; ++cy) {
            for (int cx = c0x; cx <= c1x; ++cx) {
                const uint8_t f = flagsAt(cx, cy);
                uint32_t rgba = 0;
                // Packed 0xAABBGGRR, i.e. RGBA bytes in memory order.
                if (f & (CellSolid | CellCounter)) rgba = 0x6020D0FFu;
                else if (f & CellWater)            rgba = 0x60FF8020u;
                else if (f & (CellLedgeDown | CellLedgeLeft | CellLedgeRight)) rgba = 0x6000C0FFu;
                else if (f & CellGrass)            rgba = 0x4020FF20u;
                if (!rgba) continue;
                Quad q{};
                q.x = int16_t(cx * tile_ - cam_x_);
                q.y = int16_t(cy * tile_ - cam_y_);
                q.w = q.h = uint16_t(tile_);
                q.kind = 1;
                q.rgba = rgba;  // packed as 0xAABBGGRR
                out.push_back(q);
            }
        }
        if (!actors_.empty()) {
            // Outline the player's logical cell: it jumps a whole tile at the
            // start of each step, while the sprite glides behind it.
            const Actor& p = actors_[0];
            Quad q{};
            q.x = int16_t(p.cx * tile_ - cam_x_);
            q.y = int16_t(p.cy * tile_ - cam_y_);
            q.w = q.h = uint16_t(tile_);
            q.kind = 1;
            q.rgba = 0x50FFFF00u;
            out.push_back(q);
        }
    }
}

}  // namespace tw
