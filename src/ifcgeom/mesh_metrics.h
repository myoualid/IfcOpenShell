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

} // namespace mesh_metrics
} // namespace geom
} // namespace ifcopenshell

#endif
