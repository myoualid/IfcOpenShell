// This file was generated with the assistance of an AI coding tool.
//
// Unit tests for tw::TileWorld: the grid-locked movement, collision, camera
// and draw-order rules. Pure logic, no GPU.

#include <catch2/catch_test_macros.hpp>

#include "TileWorld.h"

#include <cstdlib>
#include <vector>

using namespace tw;

namespace {

// 12x10 open field with a solid border, a wall at (6,4), grass at (3,6),
// a down-ledge at (8,5), and a roof tile in the FG layer at (2,2).
struct Field {
    static constexpr int W = 12, H = 10;
    std::vector<uint16_t> ground = std::vector<uint16_t>(W * H, 1);
    std::vector<uint16_t> fg     = std::vector<uint16_t>(W * H, 0xFFFF);
    std::vector<uint8_t>  flags  = std::vector<uint8_t>(W * H, 0);
    Field() {
        for (int x = 0; x < W; ++x) { flags[x] = CellSolid; flags[(H - 1) * W + x] = CellSolid; }
        for (int y = 0; y < H; ++y) { flags[y * W] = CellSolid; flags[y * W + W - 1] = CellSolid; }
        flags[4 * W + 6] = CellSolid;
        flags[6 * W + 3] = CellGrass;
        flags[5 * W + 8] = CellLedgeDown;
        fg[2 * W + 2] = 42;
    }
    void load(TileWorld& w) const {
        w.setMap(W, H, ground.data(), fg.data(), flags.data(), 0);
    }
};

TileWorld makeWorld(int px = 5, int py = 4) {
    TileWorld w;
    w.setEnabled(true);
    w.setTileSize(16);
    w.setScreen(160, 144);
    Field().load(w);
    w.spawnActor(px, py, 0, DirRight, Behavior::Static);
    return w;
}

void hold(TileWorld& w, uint32_t buttons, int frames) {
    w.setButtons(buttons);
    for (int i = 0; i < frames; ++i) w.step();
}

}  // namespace

TEST_CASE("Walls block and the player bumps in place", "[tileworld]") {
    TileWorld w = makeWorld(5, 4);  // wall directly right at (6,4)
    hold(w, BtnRight, 1);
    REQUIRE(w.playerState().cx == 5);
    REQUIRE_FALSE(w.playerState().moving);
    REQUIRE(w.playerState().last_event == EventBumped);
}

TEST_CASE("Steps are whole tiles and take exactly tile_px frames", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    w.setButtons(BtnRight);
    w.step();
    REQUIRE(w.playerState().moving);
    REQUIRE(w.playerState().cx == 6);
    // Release: the step must still run to completion.
    w.setButtons(0);
    for (int i = 0; i < 14; ++i) w.step();
    REQUIRE(w.playerState().moving);
    w.step();
    REQUIRE_FALSE(w.playerState().moving);
    REQUIRE(w.playerState().cx == 6);
    REQUIRE(w.playerState().steps_taken == 1);
}

TEST_CASE("Tapping a new direction turns without moving", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    hold(w, BtnDown, 1);
    hold(w, 0, 1);
    const PlayerState s = w.playerState();
    REQUIRE(s.facing == DirDown);
    REQUIRE(s.cx == 5);
    REQUIRE(s.cy == 5);
    REQUIRE_FALSE(s.moving);
}

TEST_CASE("Holding a new direction walks after the turn grace", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    hold(w, BtnDown, 8);
    REQUIRE(w.playerState().moving);
    REQUIRE(w.playerState().cy == 6);
}

TEST_CASE("Ledges are one-way: hop down two cells, blocked from below", "[tileworld]") {
    TileWorld w = makeWorld(8, 4);  // ledge at (8,5)
    hold(w, BtnDown, 8);
    REQUIRE(w.playerState().cy == 6);
    REQUIRE(w.playerState().moving);
    hold(w, 0, 40);
    REQUIRE(w.playerState().cy == 6);
    REQUIRE_FALSE(w.playerState().moving);
    // Climbing back up the ledge is not allowed.
    hold(w, BtnUp, 10);
    REQUIRE(w.playerState().cy == 6);
}

TEST_CASE("Follow camera pins the player and stays grid-aligned at rest", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    // 160x144 = 10x9 cells, player anchored on cell (4,4).
    REQUIRE(w.playerState().cam_x == 5 * 16 - 64);
    REQUIRE(w.playerState().cam_y == 5 * 16 - 64);
    hold(w, BtnRight, 1);
    hold(w, 0, 3);
    // Mid-step: the camera moves with the sprite, one pixel at a time.
    REQUIRE(w.playerState().cam_x == 5 * 16 - 64 + 4);
    hold(w, 0, 20);
    REQUIRE(w.playerState().cam_x % 16 == 0);
    REQUIRE(w.playerState().cam_x == 6 * 16 - 64);
}

TEST_CASE("Snap camera slides a whole screen when crossing a room edge", "[tileworld]") {
    TileWorld w = makeWorld(9, 5);
    w.setCameraMode(CameraMode::Snap);
    REQUIRE(w.playerState().cam_x == 0);
    // Walk right into x=10, the first column of the next 10-wide room.
    hold(w, BtnRight, 1);
    hold(w, 0, 39);     // 160 px slide at 4 px/frame; the world is frozen meanwhile
    REQUIRE(w.playerState().cam_x == 156);
    REQUIRE(w.playerState().moving);
    hold(w, 0, 16);     // slide ends, then the step completes in the new room
    REQUIRE(w.playerState().cx == 10);
    REQUIRE(w.playerState().cam_x == 160);
}

TEST_CASE("Actors block each other", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    w.spawnActor(6, 5, 6, DirLeft, Behavior::Static);
    hold(w, BtnRight, 1);
    REQUIRE(w.playerState().cx == 5);
    REQUIRE(w.playerState().last_event == EventBumped);
}

TEST_CASE("Draw order is BG, then actors by foot row, then FG", "[tileworld]") {
    TileWorld w = makeWorld(2, 3);              // just below the roof at (2,2)
    w.setAtlasSize(256, 256);
    w.spawnActor(3, 2, 12, DirDown, Behavior::Static);  // further north
    std::vector<Quad> q;
    w.buildDrawList(q);

    // Player: sprite_base 0 facing right -> tile 4. NPC: base 12 facing down
    // -> tile 12. Roof: tile 42. Ground is tile 1. Atlas is 16 tiles wide.
    auto at = [](int id, const Quad& x) { return x.u == (id % 16) * 16 && x.v == (id / 16) * 16; };
    int player = -1, npc = -1, roof = -1;
    for (int i = 0; i < int(q.size()); ++i) {
        if (at(4, q[i]))  player = i;
        if (at(12, q[i])) npc = i;
        if (at(42, q[i])) roof = i;
    }
    REQUIRE(player >= 0);
    REQUIRE(roof >= 0);
    REQUIRE(npc >= 0);
    // The NPC is one row further north than the player: drawn first.
    REQUIRE(npc < player);
    // The roof is FG and comes after every sprite.
    REQUIRE(roof > player);
    // Sprites are lifted 4 px so the feet sit inside the cell.
    REQUIRE(q[player].y == 3 * 16 - w.playerState().cam_y - 4);
}

TEST_CASE("A scene region hides cells and actors outside it", "[tileworld]") {
    TileWorld w = makeWorld(3, 3);
    w.setAtlasSize(256, 256);
    w.spawnActor(9, 7, 12, DirDown, Behavior::Static);   // outside the region
    w.setRegion(1, 1, 5, 5, 7);
    std::vector<Quad> q;
    w.buildDrawList(q);
    int border = 0, npc = 0;
    for (const Quad& x : q) {
        if (x.u == 7 * 16 && x.v == 0) ++border;
        if (x.u == 12 * 16 && x.v == 0) ++npc;
    }
    REQUIRE(border > 0);
    REQUIRE(npc == 0);
}

TEST_CASE("Warps fade out, teleport, and fade back in", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    w.addWarp(Warp{6, 5, 2, 7, DirUp});
    hold(w, BtnRight, 1);
    hold(w, 0, 16);
    REQUIRE(w.fade() > 0.0f);  // step ended on the warp, fade started
    hold(w, 0, 11);
    REQUIRE(w.playerState().cx == 2);
    REQUIRE(w.playerState().cy == 7);
    REQUIRE(w.playerState().facing == DirUp);
    hold(w, 0, 12);
    REQUIRE(w.fade() == 0.0f);
}

TEST_CASE("placeActor moves an NPC and makes it the new wander home", "[tileworld]") {
    TileWorld w = makeWorld(5, 5);
    const int npc = w.spawnActor(2, 2, 6, DirDown, Behavior::Static);
    w.placeActor(npc, 8, 7, DirUp, Behavior::Wander, 1);
    REQUIRE(w.actors()[size_t(npc)].cx == 8);
    REQUIRE(w.actors()[size_t(npc)].cy == 7);
    hold(w, 0, 600);
    // Ten seconds of wandering never leaves the 1-cell radius around home.
    REQUIRE(std::abs(w.actors()[size_t(npc)].cx - 8) <= 1);
    REQUIRE(std::abs(w.actors()[size_t(npc)].cy - 7) <= 1);
}
