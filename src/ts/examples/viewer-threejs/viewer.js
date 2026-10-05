import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** IFC, IfcOpenShell, and IfcViewerWeb use a right-handed Z-up world. */
const IFC_UP = Object.freeze({ x: 0, y: 0, z: 1 });

/** Match IfcViewerWeb — keep IFC coordinates, set camera up to +Z. */
function configureThreeZUp(camera) {
  camera.up.set(IFC_UP.x, IFC_UP.y, IFC_UP.z);
}

/** Ground grid in the IFC XY plane (Z = elevation). */
function createThreeZUpGrid(size = 100, divisions = 60) {
  const grid = new THREE.GridHelper(size, divisions, 0xb7bfd0, 0xdfe3ee);
  grid.rotation.x = Math.PI / 2;
  return grid;
}

/** Place the XY grid under a recentered Z-up model. */
function positionThreeZUpGrid(grid, size) {
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  grid.scale.setScalar(Math.max(20, maxDim * 1.6) / 100);
  grid.position.set(0, 0, -size.z / 2 - 0.01);
}

/** Frame a recentered model with Z-up orbit controls. */
function frameThreeZUpCamera(camera, controls, size) {
  configureThreeZUp(camera);

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = (camera.fov * Math.PI) / 180;
  const distance = Math.max(5, (maxDim / (2 * Math.tan(fov / 2))) * 1.35);

  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(1000, distance * 10);
  camera.position.set(distance, -distance, distance * 0.62);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

/**
 * Convert one IfcOpenShell mesh snapshot into a Three.js Mesh.
 * @param {import('ifcopenshell').Mesh} mesh
 * @param {[number, number, number]} rgb 0..1
 */
function meshToThree(mesh, rgb) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.faces, 1));

  if (mesh.normals?.length === mesh.vertices.length) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  } else {
    geometry.computeVertexNormals();
  }

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    roughness: 0.74,
    metalness: 0.06,
  });

  const object = new THREE.Mesh(geometry, material);
  object.matrix.fromArray(mesh.transform);
  object.matrixAutoUpdate = false;
  object.userData.ifcId = mesh.id;
  object.userData.ifcGuid = mesh.guid;
  object.userData.ifcType = mesh.type;
  object.userData.ifcName = mesh.name;
  return object;
}

/**
 * Create an empty Three.js viewer (scene, camera, lights, render loop).
 * Call {@link streamMeshes} afterward to load IFC geometry.
 * @param {HTMLCanvasElement} canvas
 */
export function createViewer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef1f6');

  const camera = new THREE.PerspectiveCamera(48, canvas.clientWidth / canvas.clientHeight, 0.1, 100000);
  configureThreeZUp(camera);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  scene.add(new THREE.HemisphereLight(0xcde6ff, 0xe7d4be, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(12, 14, 10);
  scene.add(key);

  const grid = createThreeZUpGrid();
  scene.add(grid);

  const content = new THREE.Group();
  scene.add(content);

  function onResize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return {
    /**
     * Stream IfcOpenShell mesh snapshots into the scene, then frame the camera.
     * @param {AsyncIterable<import('ifcopenshell').Mesh> | Iterable<import('ifcopenshell').Mesh>} meshes
     * @param {typeof import('ifcopenshell').util} util
     * @returns {Promise<number>} number of meshes added
     */
    async streamMeshes(meshes, util) {
      const { meshColor } = util;
      let count = 0;

      for await (const mesh of meshes) {
        if (mesh.faces.length === 0 || mesh.vertices.length === 0) continue;
        const rgb = meshColor(mesh.type, mesh.materialIds, mesh.colors);
        content.add(meshToThree(mesh, rgb));
        count++;
      }

      const box = new THREE.Box3().setFromObject(content);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        content.position.copy(center).multiplyScalar(-1);
        positionThreeZUpGrid(grid, size);
        frameThreeZUpCamera(camera, controls, size);
      }

      return count;
    },
  };
}
