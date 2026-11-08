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

#ifndef TILEWORLD_H
#define TILEWORLD_H

// Grid-locked 2D tile world in the style of early handheld adventure games.
//
// This is the simulation half. It has no GPU code: it owns the map, the
// actors, the camera, and turns all of that into a flat, already-sorted list
// of screen-space quads (buildDrawList). TileWorldRenderer draws that list.
//
// The perspective is the "oblique top-down" of those games. Nothing here is
// projected: the art does the work. Ground tiles are painted as seen from
// straight above, walls and characters are painted as seen from the front,
// and the illusion holds because of three rules the engine enforces:
//
//   1. Everything moves on a whole-tile grid. An actor is always in exactly one
//      cell (its logical position); the pixel offset only exists while a step
//      is being animated, and a step always runs to completion.
//   2. Actors are drawn lifted by a few pixels (sprite_lift_px), so their feet
//      sit inside their cell and their head pokes into the cell above. That is
//      what makes a character read as "standing on" the ground plane.
//   3. Drawing happens in fixed bands: ground (BG), then actors sorted by their
//      foot row, then the foreground layer (FG). FG tiles are where rooftops,
//      tree canopies and the front blades of tall grass live, so an actor that
//      walks "into" them is covered exactly like the hardware's sprite-behind-BG
//      priority bit did.

#include <array>
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace tw {

enum Dir : uint8_t { DirDown = 0, DirUp = 1, DirLeft = 2, DirRight = 3 };

// Per-cell collision / behaviour flags.
enum CellFlag : uint8_t {
    CellSolid      = 1u << 0,  // cannot enter
    CellGrass      = 1u << 1,  // walkable; reported so a game can roll encounters
    CellLedgeDown  = 1u << 2,  // one-way: hop over it moving down, solid otherwise
    CellLedgeLeft  = 1u << 3,
    CellLedgeRight = 1u << 4,
    CellWater      = 1u << 5,  // solid for walking
    CellCounter    = 1u << 6,  // solid, but "talk" reaches across it
};

// Joypad bits.
enum Button : uint32_t {
    BtnUp = 1u << 0, BtnDown = 1u << 1, BtnLeft = 1u << 2, BtnRight = 1u << 3,
    BtnA  = 1u << 4, BtnB    = 1u << 5,
};

enum class CameraMode : uint8_t {
    Follow = 0,  // player pinned to a fixed screen cell; world scrolls 1:1 with the step
    Snap   = 1,  // screen-sized rooms; crossing an edge slides one whole screen
};

enum class Behavior : uint8_t { Static = 0, Wander = 1, LookAround = 2 };

// A quad in native screen pixels, sampled 1:1 from the atlas.
struct Quad {
    int16_t  x, y;       // top-left on the native screen
    uint16_t w, h;
    uint16_t u, v;       // top-left texel in the atlas
    uint8_t  flip_x;
    uint8_t  kind;       // 0 = textured, 1 = solid colour (debug overlay)
    uint32_t rgba;       // colour for kind == 1
};

struct Actor {
    int      cx = 0, cy = 0;          // logical cell (the destination while moving)
    int      from_cx = 0, from_cy = 0;
    Dir      facing = DirDown;
    bool     moving = false;
    int      progress = 0;            // pixels travelled in the current step
    int      step_len = 0;            // pixels in this step (tile, or 2*tile for a ledge hop)
    int      speed = 1;               // pixels per frame
    bool     hopping = false;
    uint8_t  step_parity = 0;         // alternates the walk frame between steps
    int      bump_frames = 0;         // walking-in-place against a wall
    int      turn_frames = 0;         // grace period after turning on the spot
    int      sprite_base = 0;         // first of 6 atlas tiles: down,down-walk,up,up-walk,side,side-walk
    Behavior behavior = Behavior::Static;
    int      home_cx = 0, home_cy = 0;
    int      wander_radius = 2;
    int      think_frames = 60;
    uint32_t rng = 0x9E3779B9u;
    bool     alive = true;
};

struct Warp {
    int src_cx, src_cy;
    int dst_cx, dst_cy;
    Dir dst_facing;
};

struct PlayerState {
    int  cx, cy;
    int  facing;
    bool moving;
    int  cam_x, cam_y;
    uint8_t cell_flags;
    int  steps_taken;
    int  last_event;   // see Event
};

enum Event : int {
    EventNone = 0,
    EventStepEnded = 1,     // player finished a step this tick
    EventEnteredGrass = 2,  // ...and it ended in grass
    EventBumped = 3,
    EventWarped = 4,
    EventInteract = 5,      // A pressed facing an actor or counter; see interactTarget
};

class TileWorld {
public:
    TileWorld();

    // ---- configuration -------------------------------------------------------
    void setEnabled(bool on) { enabled_ = on; }
    bool enabled() const { return enabled_; }

    void setScreen(int w_px, int h_px);
    int  screenW() const { return screen_w_; }
    int  screenH() const { return screen_h_; }

    void setTileSize(int px);            // 8 or 16; atlas tiles are this size
    int  tileSize() const { return tile_; }
    void setAtlasSize(int w_px, int h_px) { atlas_w_ = w_px; atlas_h_ = h_px; }

    // Layers are row-major, width*height. A tile id of 0xFFFF in fg means "empty".
    void setMap(int w, int h, const uint16_t* ground, const uint16_t* fg,
                const uint8_t* flags, uint16_t border_tile);
    int  mapW() const { return map_w_; }
    int  mapH() const { return map_h_; }
    void setCell(int cx, int cy, uint16_t ground, uint16_t fg, uint8_t flags);

    // Tiles id..id+frames-1 cycle every period_frames.
    void setTileAnimation(uint16_t base_id, int frames, int period_frames);

    // Scene region: cells outside it draw as `border_tile` (no FG, no actors),
    // so interiors stored on the same map read as separate scenes. w <= 0
    // clears it and the whole map shows again.
    void setRegion(int x, int y, int w, int h, uint16_t border_tile);

    void setCameraMode(CameraMode m);
    CameraMode cameraMode() const { return camera_mode_; }
    void setCameraClamp(bool on) { camera_clamp_ = on; }
    void setSpriteLift(int px) { sprite_lift_px_ = px; }
    void setShadowTile(int tile_id) { shadow_tile_ = tile_id; }
    void setDebugCollision(bool on) { debug_collision_ = on; }
    // Freeze the world (dialogue boxes, menus). Input is still tracked so a
    // button held while paused does not count as a fresh press on resume.
    void setPaused(bool on) { paused_ = on; }
    bool paused() const { return paused_; }
    bool debugCollision() const { return debug_collision_; }

    // Actor 0 is always the player.
    int  spawnActor(int cx, int cy, int sprite_base, Dir facing, Behavior b);
    void clearActors();
    void teleportPlayer(int cx, int cy, Dir facing);
    // Put actor `index` on a cell, stopped, with a new behaviour and home (for
    // Wander). Hosts use this to move characters between scenes.
    void placeActor(int index, int cx, int cy, Dir facing, Behavior b, int wander_radius);
    // Pixel position of an actor's cell origin, mid-step included.
    void actorPixelPos(int index, int& px, int& py) const;
    const std::vector<Actor>& actors() const { return actors_; }

    void addWarp(const Warp& w) { warps_.push_back(w); }
    void clearWarps() { warps_.clear(); }

    // ---- per frame ------------------------------------------------------------
    void setButtons(uint32_t buttons) { buttons_ = buttons; }
    uint32_t buttons() const { return buttons_; }

    // Advance by real elapsed time; runs whole 60 Hz frames, carries the rest.
    void advance(double elapsed_ms);
    // Exactly one 60 Hz frame. Public so tests can drive it deterministically.
    void step();

    void buildDrawList(std::vector<Quad>& out) const;

    PlayerState playerState() const;
    int  interactTarget() const { return interact_target_; }
    // Every event since the last call, as a bitmask of (1 << Event), plus the
    // last actor talked to (-1 if none). For hosts that poll slower or faster
    // than the 60 Hz simulation.
    uint32_t takeEvents(int& interact_actor) {
        const uint32_t e = event_mask_;
        interact_actor = taken_interact_;
        event_mask_ = 0;
        taken_interact_ = -1;
        return e;
    }
    // 0 = no fade, 1 = fully white. Rendered by the blit pass.
    float fade() const { return fade_; }
    uint32_t frameCount() const { return frame_; }

    uint8_t flagsAt(int cx, int cy) const;
    bool    inBounds(int cx, int cy) const {
        return cx >= 0 && cy >= 0 && cx < map_w_ && cy < map_h_;
    }

private:
    static constexpr uint16_t kEmpty = 0xFFFF;

    void stepActor(Actor& a, int index, uint32_t held, uint32_t pressed);
    bool tryBeginStep(Actor& a, int index, Dir d);
    bool cellOccupied(int cx, int cy, int ignore_index) const;
    void thinkNpc(Actor& a, int index);
    void updateCamera(bool instant);
    void actorPixel(const Actor& a, int& px, int& py, int& hop_lift) const;
    uint16_t animatedTile(uint16_t id) const;
    void tileUV(uint16_t id, uint16_t& u, uint16_t& v) const;
    void onPlayerStepEnded();

    bool enabled_ = false;
    int  screen_w_ = 160, screen_h_ = 144;
    int  tile_ = 16;
    int  atlas_w_ = 256, atlas_h_ = 256;

    int map_w_ = 0, map_h_ = 0;
    std::vector<uint16_t> ground_, fg_;
    std::vector<uint8_t>  flags_;
    uint16_t border_tile_ = 0;
    int region_x_ = 0, region_y_ = 0, region_w_ = 0, region_h_ = 0;
    uint16_t region_border_ = 0;
    bool inRegion(int cx, int cy) const {
        return region_w_ <= 0 || (cx >= region_x_ && cy >= region_y_ &&
                                  cx < region_x_ + region_w_ && cy < region_y_ + region_h_);
    }

    struct Anim { int frames; int period; };
    std::unordered_map<uint16_t, Anim> anims_;

    std::vector<Actor> actors_;
    std::vector<Warp>  warps_;

    CameraMode camera_mode_ = CameraMode::Follow;
    bool camera_clamp_ = false;
    int  cam_x_ = 0, cam_y_ = 0;          // top-left of the screen in world pixels
    int  snap_target_x_ = 0, snap_target_y_ = 0;
    bool snap_scrolling_ = false;

    int  sprite_lift_px_ = 4;
    int  shadow_tile_ = -1;
    bool debug_collision_ = false;
    bool paused_ = false;

    uint32_t buttons_ = 0, prev_buttons_ = 0;
    uint32_t frame_ = 0;
    double   accum_ms_ = 0.0;

    // warp fade: >0 fading out toward the warp, <0 fading back in
    int   fade_timer_ = 0;
    float fade_ = 0.0f;
    int   pending_warp_ = -1;

    int steps_taken_ = 0;
    int last_event_ = EventNone;
    int interact_target_ = -1;
    uint32_t event_mask_ = 0;
    int taken_interact_ = -1;
};

}  // namespace tw

#endif  // TILEWORLD_H
