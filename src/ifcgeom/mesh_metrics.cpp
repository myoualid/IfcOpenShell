// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

#include "mesh_metrics.h"

#include <boost/geometry.hpp>
#include <boost/geometry/geometries/multi_polygon.hpp>
#include <boost/geometry/geometries/point_xy.hpp>
#include <boost/geometry/geometries/polygon.hpp>

#include <array>
#include <cmath>
#include <set>
#include <stdexcept>
#include <utility>

namespace bg = boost::geometry;

namespace {

typedef std::array<double, 3> vector3;
typedef bg::model::d2::point_xy<double> point_2;
typedef bg::model::polygon<point_2> polygon_2;
typedef bg::model::multi_polygon<polygon_2> multi_polygon_2;

vector3 subtract(const vector3& a, const vector3& b) {
	return {a[0] - b[0], a[1] - b[1], a[2] - b[2]};
}

vector3 cross(const vector3& a, const vector3& b) {
	return {a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]};
}

double dot(const vector3& a, const vector3& b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

vector3 normalized(const vector3& v) {
	const double length = std::sqrt(dot(v, v));
	return {v[0] / length, v[1] / length, v[2] / length};
}

// The union of the polygons, by pairs, so that each union stays small.
multi_polygon_2 union_all(std::vector<multi_polygon_2> parts) {
	if (parts.empty()) {
		return {};
	}
	while (parts.size() > 1) {
		std::vector<multi_polygon_2> merged;
		merged.reserve((parts.size() + 1) / 2);
		for (size_t i = 0; i + 1 < parts.size(); i += 2) {
			multi_polygon_2 result;
			bg::union_(parts[i], parts[i + 1], result);
			merged.push_back(std::move(result));
		}
		if (parts.size() % 2) {
			merged.push_back(std::move(parts.back()));
		}
		parts = std::move(merged);
	}
	return parts.front();
}

void check_triangles(const std::vector<double>& verts, const std::vector<int>& faces) {
	if (verts.size() % 3 || faces.size() % 3) {
		throw std::invalid_argument("verts and faces must have three values for each vertex and triangle");
	}
}

vector3 vertex(const std::vector<double>& verts, int index) {
	return {verts[3 * index], verts[3 * index + 1], verts[3 * index + 2]};
}

// cross(v1 - v0, v2 - v0) of a triangle: its normal, as long as twice its area.
vector3 triangle_normal(const std::vector<double>& verts, const std::vector<int>& faces, size_t f) {
	const vector3 v0 = vertex(verts, faces[f]);
	return cross(subtract(vertex(verts, faces[f + 1]), v0), subtract(vertex(verts, faces[f + 2]), v0));
}

// The area of the triangles whose unit normal passes the test. A triangle without area has no normal:
// numpy gives NaN, which no comparison passes.
template <typename Test>
double area_where(const std::vector<double>& verts, const std::vector<int>& faces, Test test) {
	check_triangles(verts, faces);
	double area = 0.;
	for (size_t f = 0; f + 2 < faces.size(); f += 3) {
		const vector3 n = triangle_normal(verts, faces, f);
		const double length = std::sqrt(dot(n, n));
		if (length > 0. && test(vector3{n[0] / length, n[1] / length, n[2] / length})) {
			area += length / 2.;
		}
	}
	return area;
}

} // namespace

double ifcopenshell::geom::mesh_metrics::footprint_area(const std::vector<double>& verts, const std::vector<int>& faces, double dx, double dy, double dz) {
	if (verts.size() % 3 || faces.size() % 3) {
		throw std::invalid_argument("verts and faces must have three values for each vertex and triangle");
	}
	const vector3 direction = normalized({dx, dy, dz});

	// An orthonormal basis (b, c) of the plane normal to the direction, as util.shape builds it.
	vector3 a = direction;
	// numpy.isclose(a[2], 1.0, atol=0.01): |a - b| <= atol + rtol * |b|, with rtol = 1e-5.
	if (std::abs(a[2] - 1.0) > 0.01 + 1e-5) {
		a[2] += 0.01;
	} else {
		a = {1., 0., 0.};
	}
	vector3 b = cross(direction, a);
	if (!(dot(b, b) > 1e-24)) {
		// The perturbed vector is parallel to the direction (for example -Z), where util.shape fails
		// with NaN coordinates: take an axis that is not parallel instead.
		b = cross(direction, std::abs(direction[0]) < 0.9 ? vector3{1., 0., 0.} : vector3{0., 1., 0.});
	}
	b = normalized(b);
	const vector3 c = cross(direction, b);

	const size_t vertex_count = verts.size() / 3;
	auto vertex = [&verts](int index) -> vector3 {
		return {verts[3 * index], verts[3 * index + 1], verts[3 * index + 2]};
	};
	std::vector<point_2> projected;
	projected.reserve(vertex_count);
	for (size_t i = 0; i < vertex_count; ++i) {
		const vector3 v = vertex(static_cast<int>(i));
		const double along = dot(v, direction);
		const vector3 flat = {v[0] - along * direction[0], v[1] - along * direction[1], v[2] - along * direction[2]};
		projected.emplace_back(dot(flat, b), dot(flat, c));
	}

	std::vector<multi_polygon_2> parts;
	for (size_t f = 0; f + 2 < faces.size(); f += 3) {
		const int i0 = faces[f], i1 = faces[f + 1], i2 = faces[f + 2];
		const vector3 normal = cross(subtract(vertex(i1), vertex(i0)), subtract(vertex(i2), vertex(i0)));
		const double length = std::sqrt(dot(normal, normal));
		// A degenerate triangle has no normal and never faces the direction, as with numpy NaN.
		if (!(length > 0.) || !(dot(normal, direction) / length > 0.01)) {
			continue;
		}
		polygon_2 triangle;
		bg::append(triangle.outer(), projected[i0]);
		bg::append(triangle.outer(), projected[i1]);
		bg::append(triangle.outer(), projected[i2]);
		bg::correct(triangle);
		if (!(bg::area(triangle) > 0.)) {
			continue;
		}
		parts.push_back(multi_polygon_2{triangle});
	}
	return bg::area(union_all(std::move(parts)));
}

std::vector<double> ifcopenshell::geom::mesh_metrics::bisect_mesh_plane(const std::vector<double>& verts, const std::vector<int>& faces, double z, int precision, double extend) {
	if (verts.size() % 3 || faces.size() % 3) {
		throw std::invalid_argument("verts and faces must have three values for each vertex and triangle");
	}
	const double scale = std::pow(10., precision);
	// Half to even, as Python round().
	auto round_to = [scale](double v) { return std::nearbyint(v * scale) / scale; };

	std::vector<double> segments;
	for (size_t f = 0; f + 2 < faces.size(); f += 3) {
		const int corners[3] = {faces[f], faces[f + 1], faces[f + 2]};
		double heights[3];
		for (int i = 0; i < 3; ++i) {
			heights[i] = verts[3 * corners[i] + 2] - z;
		}
		// Edges 0-1, 1-2 and 2-0 in this order; an edge crosses when its ends are strictly on both sides.
		std::array<double, 4> points;
		int count = 0;
		for (int i = 0; i < 3; ++i) {
			const int j = (i + 1) % 3;
			const double da = heights[i], db = heights[j];
			if (!(da * db < 0.)) {
				continue;
			}
			const double t = da / (da - db);
			const double* a = &verts[3 * corners[i]];
			const double* b = &verts[3 * corners[j]];
			if (count < 2) {
				points[2 * count] = round_to(a[0] + t * (b[0] - a[0]));
				points[2 * count + 1] = round_to(a[1] + t * (b[1] - a[1]));
			}
			++count;
		}
		if (count != 2 || (points[0] == points[2] && points[1] == points[3])) {
			continue;
		}
		if (extend > 0.) {
			const double dx = points[2] - points[0], dy = points[3] - points[1];
			const double length = std::sqrt(dx * dx + dy * dy);
			const double ox = extend * dx / length, oy = extend * dy / length;
			points = {points[0] - ox, points[1] - oy, points[2] + ox, points[3] + oy};
		}
		segments.insert(segments.end(), points.begin(), points.end());
	}
	return segments;
}

double ifcopenshell::geom::mesh_metrics::mesh_area(const std::vector<double>& verts, const std::vector<int>& faces) {
	check_triangles(verts, faces);
	double area = 0.;
	for (size_t f = 0; f + 2 < faces.size(); f += 3) {
		const vector3 n = triangle_normal(verts, faces, f);
		area += std::sqrt(dot(n, n)) / 2.;
	}
	return area;
}

double ifcopenshell::geom::mesh_metrics::side_area(const std::vector<double>& verts, const std::vector<int>& faces, double dx, double dy, double dz, double angle) {
	const vector3 direction = normalized({dx, dy, dz});
	const double acceptable_dot = std::cos(angle * std::acos(-1.) / 180.) + 0.01;
	return area_where(verts, faces, [&](const vector3& n) { return dot(n, direction) > acceptable_dot; });
}

double ifcopenshell::geom::mesh_metrics::outer_surface_area(const std::vector<double>& verts, const std::vector<int>& faces, double tol) {
	return area_where(verts, faces, [tol](const vector3& n) { return std::abs(n[2]) < tol; });
}

double ifcopenshell::geom::mesh_metrics::footprint_perimeter(const std::vector<double>& verts, const std::vector<int>& faces, double tol) {
	check_triangles(verts, faces);
	// The edges of the downward triangles, in the order util.shape visits them: an edge that is already
	// there (either way) is shared, and shared edges are not on the boundary.
	std::set<std::pair<int, int>> all_edges, shared_edges;
	for (size_t f = 0; f + 2 < faces.size(); f += 3) {
		const vector3 n = triangle_normal(verts, faces, f);
		const double length = std::sqrt(dot(n, n));
		if (!(length > 0. && n[2] / length < -tol)) {
			continue;
		}
		for (int i = 0; i < 3; ++i) {
			const std::pair<int, int> edge{faces[f + i], faces[f + (i + 1) % 3]};
			const std::pair<int, int> reversed{edge.second, edge.first};
			if (all_edges.count(reversed) || all_edges.count(edge)) {
				shared_edges.insert(edge);
				shared_edges.insert(reversed);
			} else {
				all_edges.insert(edge);
			}
		}
	}
	double perimeter = 0.;
	for (const auto& edge : all_edges) {
		if (!shared_edges.count(edge)) {
			const vector3 d = subtract(vertex(verts, edge.first), vertex(verts, edge.second));
			perimeter += std::sqrt(dot(d, d));
		}
	}
	return perimeter;
}

double ifcopenshell::geom::mesh_metrics::total_edge_length(const std::vector<double>& verts, const std::vector<int>& edges) {
	if (verts.size() % 3 || edges.size() % 2) {
		throw std::invalid_argument("verts and edges must have three values for each vertex and two for each edge");
	}
	double length = 0.;
	for (size_t e = 0; e + 1 < edges.size(); e += 2) {
		const vector3 d = subtract(vertex(verts, edges[e + 1]), vertex(verts, edges[e]));
		length += std::sqrt(dot(d, d));
	}
	return length;
}
