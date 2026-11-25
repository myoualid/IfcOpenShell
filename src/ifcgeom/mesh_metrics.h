// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

#ifndef IFCGEOM_MESH_METRICS_H
#define IFCGEOM_MESH_METRICS_H

#include "ifc_geom_api.h"

#include <vector>

namespace ifcopenshell {
namespace geom {
namespace mesh_metrics {

/**
 * The area of the footprint of a triangle mesh along a direction: the union of the triangles that face
 * the direction (normal . direction > 0.01), projected onto the plane normal to it. This is the
 * calculation of ifcopenshell.util.shape.get_footprint_area, with Boost.Geometry for the union.
 *
 * @param verts x, y, z for each vertex
 * @param faces three vertex indices for each triangle
 */
IFC_GEOM_API double footprint_area(const std::vector<double>& verts, const std::vector<int>& faces, double dx = 0., double dy = 0., double dz = 1.);

/**
 * The segments where the horizontal plane at a height cuts the triangles of a mesh. This is the
 * calculation of ifcopenshell.util.shape.bisect_mesh_plane_vf: a triangle with two edges that cross
 * the plane (their ends strictly on both sides) gives a segment between the two crossing points,
 * rounded to `precision` decimals (half to even); a segment whose two points are equal is dropped;
 * each segment is longer by `extend` at both ends.
 *
 * @param verts x, y, z for each vertex
 * @param faces three vertex indices for each triangle
 * @return x0, y0, x1, y1 for each segment
 */
IFC_GEOM_API std::vector<double> bisect_mesh_plane(const std::vector<double>& verts, const std::vector<int>& faces, double z, int precision = 3, double extend = 0.);

} // namespace mesh_metrics
} // namespace geom
} // namespace ifcopenshell

#endif
