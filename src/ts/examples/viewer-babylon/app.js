import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Matrix,
  Mesh,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import ifcopenshell, { util } from 'ifcopenshell';

const status = document.getElementById('status');
const canvas = document.getElementById('viewport');

/** WASM directory when serving from src/ts (see README). */
const WASM_BASE = new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href;

/**
 * Geometry kernel for this sample.
 * Revit-style IFC (extrusions / BREP) needs `opencascade`. Use `passthrough`
 * only for already-triangulated IFC or a minimal WASM profile.
 */
const DEFAULT_KERNEL = 'opencascade';

/** IFC, IfcOpenShell, and IfcViewerWeb use a right-handed Z-up world. */
const IFC_UP = Object.freeze({ x: 0, y: 0, z: 1 });

/** ArcRotateCamera orbiting with IFC +Z as the vertical axis. */
function configureBabylonZUp(camera) {
  camera.upVector = new Vector3(IFC_UP.x, IFC_UP.y, IFC_UP.z);
}

function frameBabylonZUpCamera(camera, size) {
  configureBabylonZUp(camera);

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  camera.setTarget(Vector3.Zero());
  camera.alpha = -Math.PI / 4;
  camera.beta = Math.PI / 3;
  camera.radius = maxDim * 1.8;
  camera.lowerRadiusLimit = maxDim * 0.05;
  camera.upperRadiusLimit = maxDim * 20;
}

/**
 * Convert one IfcOpenShell mesh snapshot into a Babylon.js mesh under `parent`.
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('ifcopenshell').Mesh} mesh
 * @param {[number, number, number]} rgb 0..1
 * @param {import('@babylonjs/core').TransformNode} [parent]
 */
function meshToBabylon(scene, mesh, rgb, parent = null) {
  const data = new VertexData();
  data.positions = Array.from(mesh.vertices);
  data.indices = Array.from(mesh.faces);
  if (mesh.normals?.length) {
    data.normals = Array.from(mesh.normals);
  }

  const babylonMesh = new Mesh(`ifc-${mesh.id}`, scene);
  data.applyToMesh(babylonMesh);

  const mat = new StandardMaterial(`mat-${mesh.id}`, scene);
  mat.diffuseColor = new Color3(rgb[0], rgb[1], rgb[2]);
  babylonMesh.material = mat;

  babylonMesh.setPreTransformMatrix(Matrix.FromArray(Array.from(mesh.transform)));
  babylonMesh.metadata = {
    ifcId: mesh.id,
    ifcGuid: mesh.guid,
    ifcType: mesh.type,
    ifcName: mesh.name,
  };

  if (parent) babylonMesh.parent = parent;
  return babylonMesh;
}

/** Add meshes under a root node and recenter (IFC georeferencing). */
function addMeshesToBabylonRoot(scene, meshes) {
  const { meshColor } = util;
  const root = new TransformNode('ifc-root', scene);
  const created = [];

  for (const mesh of meshes) {
    if (mesh.faces.length === 0 || mesh.vertices.length === 0) continue;
    const rgb = meshColor(mesh.type, mesh.materialIds, mesh.colors);
    created.push(meshToBabylon(scene, mesh, rgb, root));
  }

  if (created.length === 0) {
    return { root, center: Vector3.Zero(), size: Vector3.Zero() };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const mesh of created) {
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const min = bi.boundingBox.minimumWorld;
    const max = bi.boundingBox.maximumWorld;
    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);
  }

  const center = new Vector3(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  );
  root.position.copyFrom(center.scale(-1));

  const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
  return { root, center, size };
}

async function main() {
  status.textContent = 'Initializing WASM…';
  await ifcopenshell.init({ wasmBase: WASM_BASE });

  status.textContent = `Tessellating sample.ifc (kernel: ${DEFAULT_KERNEL})…`;
  const response = await fetch('sample.ifc');
  if (!response.ok) {
    throw new Error(`Missing sample.ifc next to this example (HTTP ${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const model = await ifcopenshell.open(bytes, 'sample.ifc');

  const settings = new ifcopenshell.geom.settings();
  settings.set('weld-vertices', true);
  settings.set('mesher-linear-deflection', 0.02);

  const iter = ifcopenshell.geom.iterate(settings, model, {
    numThreads: 1,
    geometryLibrary: DEFAULT_KERNEL,
  });
  if (!(await iter.initialize())) {
    throw new Error(
      `Geometry iterator failed (kernel: ${DEFAULT_KERNEL}). ` +
        'Confirm kernel.opencascade is staged in ifcopenshell-wasm/wasm/plugins/.',
    );
  }
  const meshes = [];
  for await (const mesh of iter) {
    if (mesh.faces.length === 0) continue;
    meshes.push(mesh);
    if (meshes.length >= 300) break;
  }

  status.textContent = `Building Babylon scene (${meshes.length} meshes)…`;

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.93, 0.94, 0.97, 1);

  const camera = new ArcRotateCamera('camera', -Math.PI / 4, Math.PI / 3, 10, Vector3.Zero(), scene);
  configureBabylonZUp(camera);
  camera.attachControl(canvas, true);
  camera.wheelPrecision = 20;

  new HemisphericLight('hemi', new Vector3(0.2, 0.3, 1), scene);

  const { size } = addMeshesToBabylonRoot(scene, meshes);
  frameBabylonZUpCamera(camera, size);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  iter.dispose();
  settings.dispose();
  model.dispose();
  status.textContent = `Done — ${meshes.length} mesh(es)`;
}

main().catch((err) => {
  status.textContent = String(err);
  console.error(err);
});
