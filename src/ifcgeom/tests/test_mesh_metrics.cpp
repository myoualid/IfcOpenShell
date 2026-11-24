// This file was generated with the assistance of an AI coding tool.

#include "ifcgeom/mesh_metrics.h"

#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <stdexcept>
#include <vector>

namespace {

using ifcopenshell::geom::mesh_metrics::footprint_area;

// A 2 x 3 x 4 box with separate vertices for each face, as the kernels triangulate it.
void box(std::vector<double>& verts, std::vector<int>& faces) {
	const double x = 2., y = 3., z = 4.;
	const double quads[6][4][3] = {
		{{0, 0, 0}, {0, y, 0}, {x, y, 0}, {x, 0, 0}},
		{{0, 0, z}, {x, 0, z}, {x, y, z}, {0, y, z}},
		{{0, 0, 0}, {x, 0, 0}, {x, 0, z}, {0, 0, z}},
		{{0, y, 0}, {0, y, z}, {x, y, z}, {x, y, 0}},
		{{0, 0, 0}, {0, 0, z}, {0, y, z}, {0, y, 0}},
		{{x, 0, 0}, {x, y, 0}, {x, y, z}, {x, 0, z}},
	};
	for (const auto& quad : quads) {
		const int first = static_cast<int>(verts.size() / 3);
		for (const auto& p : quad) {
			verts.insert(verts.end(), {p[0], p[1], p[2]});
		}
		faces.insert(faces.end(), {first, first + 1, first + 2, first, first + 2, first + 3});
	}
}

} // namespace

TEST_CASE("footprint_area projects the faces that face the direction", "[mesh_metrics]") {
	std::vector<double> verts;
	std::vector<int> faces;
	box(verts, faces);
	// The values of ifcopenshell.util.shape.get_footprint_area for the same box.
	CHECK(footprint_area(verts, faces) == Catch::Approx(6.));
	CHECK(footprint_area(verts, faces, 1., 0., 0.) == Catch::Approx(12.));
	CHECK(footprint_area(verts, faces, 0., 1., 0.) == Catch::Approx(8.));
	CHECK(footprint_area(verts, faces, 1., 1., 1.) == Catch::Approx(15.011106999));
	CHECK(footprint_area(verts, faces, 0.2, -0.3, 1.) == Catch::Approx(10.159785379));
	// util.shape gives NaN coordinates for -Z; the C++ version takes another basis vector.
	CHECK(footprint_area(verts, faces, 0., 0., -1.) == Catch::Approx(6.));
}

TEST_CASE("footprint_area counts overlapping triangles once", "[mesh_metrics]") {
	// Two unit squares facing +Z that overlap by half, and a degenerate triangle.
	const std::vector<double> verts = {
		0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
		0.5, 0, 1, 1.5, 0, 1, 1.5, 1, 1, 0.5, 1, 1,
	};
	const std::vector<int> faces = {0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 0, 1};
	CHECK(footprint_area(verts, faces) == Catch::Approx(1.5));
	CHECK(footprint_area(verts, {}) == 0.);
}

TEST_CASE("footprint_area rejects incomplete vertices and faces", "[mesh_metrics]") {
	CHECK_THROWS_AS(footprint_area({0., 0.}, {}), std::invalid_argument);
	CHECK_THROWS_AS(footprint_area({0., 0., 0.}, {0, 0}), std::invalid_argument);
}
