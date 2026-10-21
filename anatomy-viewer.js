import * as THREE from 'three';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const state = {
  model: params.get('model') || 'neutral',
  width: Number(params.get('width')) || 1,
  height: Number(params.get('height')) || 1,
  muscle: 45,
  softness: 45,
  mass: 70,
  heightCm: 170,
  layer: 'surface',
  selected: [],
};
const canvas = document.querySelector('canvas'),
  loading = document.querySelector('#loading'),
  label = document.querySelector('#label');
let renderer,
  model,
  atlas,
  surface,
  head,
  meshes = [],
  selectedMesh,
  lastFit,
  generation = 0;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef0ee');
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'low-power',
  });
} catch {
  loading.textContent =
    '3D is unavailable on this device. Use the searchable muscle list below.';
}
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.minDistance = 0.4;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.92;
  scene.add(new THREE.HemisphereLight('#ffffff', '#79867d', 2));
  const light = new THREE.DirectionalLight('#ffffff', 2.5);
  light.position.set(-2, 3, 4);
  scene.add(light);
  const rim = new THREE.DirectionalLight('#e5eee9', 1.6);
  rim.position.set(2, 2, -3);
  scene.add(rim);
  const ground = new THREE.GridHelper(3, 16, '#c5cdc7', '#dce1dd');
  scene.add(ground);
  function draw() {
    renderer.render(scene, camera);
  }
  function fit(direction) {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(
        state.layer === 'surface' ? surface : atlas,
      ),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3());
    const distance =
      (Math.max(size.y, size.x / camera.aspect) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) *
      Math.max(1.3, innerHeight / Math.max(200, innerHeight - 210));
    const view =
      direction || camera.position.clone().sub(controls.target).normalize();
    if (!view.length()) view.set(0, 0, 1);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(view, distance);
    controls.update();
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (model) fit();
    draw();
  }
  new ResizeObserver(resize).observe(document.body);
  controls.addEventListener('change', draw);
  function emit(data) {
    const text = JSON.stringify({ type: 'motion-anatomy', ...data });
    window.parent.postMessage(text, location.origin);
    window.ReactNativeWebView?.postMessage(text);
  }
  function morph(mesh) {
    if (!mesh?.morphTargetInfluences) return;
    // These are illustrative artist-authored shape targets, not body-fat estimates.
    const muscle = (Math.min(100, Math.max(0, state.muscle)) - 50) / 50;
    const relativeMass =
      Math.log(Math.max(30, state.mass) / 70) -
      2 * Math.log(Math.max(100, state.heightCm) / 170);
    const shape = THREE.MathUtils.clamp(
      (state.softness - 50) / 50 + relativeMass * 0.65,
      -1,
      1,
    );
    mesh.morphTargetInfluences[0] = Math.max(0, -muscle);
    mesh.morphTargetInfluences[1] = Math.max(0, muscle);
    mesh.morphTargetInfluences[2] = Math.max(0, -shape);
    mesh.morphTargetInfluences[3] = Math.max(0, shape);
  }
  function refresh() {
    if (!model) return;
    const surfaceMode = state.layer === 'surface';
    // Keep anatomical structures at source proportions. Personal shape belongs to the surface model.
    atlas.visible = !surfaceMode;
    surface.visible = surfaceMode;
    head.visible = !surfaceMode && state.layer !== 'skeleton';
    surface.scale.setScalar(
      THREE.MathUtils.clamp(state.heightCm, 100, 230) / 170,
    );
    morph(surface);
    for (const mesh of meshes) {
      const bone =
          mesh.userData.group === 'Skeleton' ||
          /skeleton|bone/i.test(mesh.name),
        deep = mesh.userData.layer === 'deep';
      mesh.visible =
        state.layer === 'skeleton'
          ? bone
          : state.layer === 'deep'
            ? bone || deep
            : true;
      const chosen =
        mesh === selectedMesh ||
        state.selected.some((key) => mesh.userData.key?.startsWith(key));
      mesh.material.color.set(
        chosen ? '#287c68' : bone ? '#c1c9c3' : deep ? '#82978b' : '#b2bab6',
      );
      mesh.material.emissive.set(chosen ? '#0c251c' : '#000000');
    }
    document.querySelector('#status strong').textContent = surfaceMode
      ? 'Body reference'
      : 'Muscle atlas';
    if (!selectedMesh)
      label.textContent = surfaceMode
        ? state.goal
          ? 'Goal shape reference'
          : 'Current shape reference'
        : 'Select a muscle to explore';
    for (const layer of ['surface', 'muscles', 'deep', 'skeleton'])
      document
        .querySelector('#' + layer)
        .setAttribute('aria-pressed', String(state.layer === layer));
    const key = [
      state.layer,
      state.heightCm,
      state.muscle,
      state.softness,
      state.mass,
    ].join(':');
    if (lastFit !== key) {
      fit();
      lastFit = key;
    }
    draw();
  }
  async function load() {
    const request = ++generation;
    loading.hidden = false;
    loading.textContent = 'Loading human anatomy…';
    try {
      const sex = state.model === 'feminine' ? 'female' : 'male';
      const [anatomy, human] = await Promise.all([
        new GLTFLoader().loadAsync(`./models/full-body-${sex}-mobile.glb`),
        new GLTFLoader().loadAsync(`./models/physique-${sex}.glb`),
      ]);
      if (request !== generation) return;
      if (model) {
        scene.remove(model);
        model.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
      }
      model = new THREE.Group();
      atlas = anatomy.scene;
      meshes = [];
      atlas.traverse((o) => {
        if (o.isMesh) {
          o.material = new THREE.MeshStandardMaterial({
            roughness: 0.88,
            metalness: 0,
          });
          meshes.push(o);
        }
      });
      const box = new THREE.Box3().setFromObject(atlas),
        center = box.getCenter(new THREE.Vector3()),
        height = box.max.y - box.min.y;
      atlas.position.set(-center.x, -box.min.y, -center.z);
      atlas.scale.setScalar(1.7 / height);
      atlas.position.multiplyScalar(1.7 / height);
      surface = human.scene.getObjectByName('PhysiqueSurface');
      head = human.scene.getObjectByName('AnatomicalHead');
      for (const mesh of [surface, head]) {
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.computeVertexNormals();
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#b2bab6',
          roughness: 0.85,
          metalness: 0,
          side: THREE.DoubleSide,
        });
      }
      // A complete neutral presentation blends the two authored surfaces rather than inferring gender.
      if (state.model === 'neutral') {
        const feminine = await new GLTFLoader().loadAsync(
          './models/physique-female.glb',
        );
        for (const [mesh, name] of [
          [surface, 'PhysiqueSurface'],
          [head, 'AnatomicalHead'],
        ]) {
          const a = mesh.geometry.attributes.position,
            b =
              feminine.scene.getObjectByName(name).geometry.attributes.position;
          for (let i = 0; i < a.count; i++)
            a.setXYZ(
              i,
              (a.getX(i) + b.getX(i)) / 2,
              (a.getY(i) + b.getY(i)) / 2,
              (a.getZ(i) + b.getZ(i)) / 2,
            );
          mesh.geometry.computeVertexNormals();
          a.needsUpdate = true;
        }
      }
      if (request !== generation) return;
    model.add(atlas, surface, head);
      scene.add(model);
      selectedMesh = null;
      lastFit = null;
      loading.hidden = true;
      fit(new THREE.Vector3(0, 0, 1));
      refresh();
      emit({ ready: true, structures: 218 });
    } catch (error) {
      loading.textContent =
        'The model could not load. Check your connection or use the muscle list.';
      console.error(error);
      emit({ error: true });
    }
  }
  let down;
  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (
      state.layer === 'surface' ||
      !down ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8
    )
      return;
    const rect = canvas.getBoundingClientRect(),
      point = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      ray = new THREE.Raycaster();
    ray.setFromCamera(point, camera);
    const hit = ray.intersectObjects(
      meshes.filter((m) => m.visible && m.userData.muscleId),
      false,
    )[0];
    if (hit) {
      selectedMesh = hit.object;
      const data = hit.object.userData;
      label.textContent = `${data.label} / ${data.side} / ${data.layer}`;
      refresh();
      emit({
        muscle: data.key,
        label: data.label,
        side: data.side,
        layer: data.layer,
      });
    }
  });
  document.querySelector('#front').onclick = () => {
    fit(new THREE.Vector3(0, 0, 1));
    draw();
  };
  document.querySelector('#back').onclick = () => {
    fit(new THREE.Vector3(0, 0, -1));
    draw();
  };
  document.querySelector('#reset').onclick = () => {
    selectedMesh = null;
    fit(new THREE.Vector3(0, 0, 1));
    refresh();
  };
  for (const [id, angle] of [
    ['left', -0.35],
    ['right', 0.35],
  ])
    document.querySelector('#' + id).onclick = () => {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      draw();
    };
  for (const [id, factor] of [
    ['zoom-in', 0.82],
    ['zoom-out', 1.22],
  ])
    document.querySelector('#' + id).onclick = () => {
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(factor);
      offset.clampLength(controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      draw();
    };
  for (const layer of ['surface', 'muscles', 'deep', 'skeleton'])
    document.querySelector('#' + layer).onclick = () => {
      state.layer = layer;
      refresh();
    };
  addEventListener('message', (event) => {
    if (event.origin !== location.origin && event.source !== window) return;
    try {
      const data =
        typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data?.type !== 'motion-body') return;
      const previous = state.model;
      Object.assign(state, data);
      if (data.selected?.length) state.layer = 'muscles';
      if (state.model !== previous) void load();
      else refresh();
    } catch {}
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) draw();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    loading.hidden = false;
    loading.textContent = '3D paused. Reload the page or use the muscle list.';
  });
  camera.position.set(0, 0.85, 4);
  controls.target.set(0, 0.85, 0);
  controls.update();
  resize();
  void load();
}

