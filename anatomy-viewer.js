import * as THREE from 'three';
import { GLTFLoader } from './vendor/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const state = { model: params.get('model') || 'neutral', width: Number(params.get('width')) || 1, height: Number(params.get('height')) || 1, layer:'muscles', selected:[] };
const canvas = document.querySelector('canvas');
const loading = document.querySelector('#loading');
const label = document.querySelector('#label');
let renderer, model, meshes=[], selectedMesh, lastWidth, lastHeight;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#11191c');
const camera = new THREE.PerspectiveCamera(32,1,.01,100); camera.position.set(0, .9, 3.3);
try { renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'}); }
catch { loading.textContent='3D is unavailable on this device. Use the searchable muscle list below.'; }
if (renderer) {
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6)); renderer.outputColorSpace=THREE.SRGBColorSpace;
const controls = new OrbitControls(camera,canvas); controls.target.set(0,.9,0); controls.enableDamping=false; controls.enablePan=true;controls.minDistance=.4;controls.maxDistance=10;controls.maxPolarAngle=Math.PI*.92;
scene.add(new THREE.HemisphereLight('#e4f4f7','#33382e',2.2));
const key = new THREE.DirectionalLight('#ffe0c0',3.5);key.position.set(-2,3,4);scene.add(key);
const rim = new THREE.DirectionalLight('#abc9d3',2.6);rim.position.set(2,2,-3);scene.add(rim);
const ground = new THREE.GridHelper(3,24,'#34464b','#1e2b30');scene.add(ground);
function draw(){if(!renderer)return;renderer.render(scene,camera);}
function fit(direction){
 if(!model)return;
 const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const angle=THREE.MathUtils.degToRad(camera.fov/2);
 const distance=Math.max(size.y/(2*Math.tan(angle)),size.x/(2*Math.tan(angle)*camera.aspect))*1.23;
 const view=direction||camera.position.clone().sub(controls.target).normalize();
 controls.target.copy(center);camera.position.copy(center).addScaledVector(view,distance);controls.update();
}
function resize(){const width=innerWidth,height=innerHeight;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();draw();}
new ResizeObserver(resize).observe(document.body);addEventListener('resize',resize);controls.addEventListener('change',draw);
function emit(data){const text=JSON.stringify({type:'motion-anatomy',...data});window.parent.postMessage(text,location.origin);window.ReactNativeWebView?.postMessage(text);}
function refresh(){
 if(!model)return;
 model.scale.set(state.width,state.height,Math.max(.8,state.width*.92));
 if(lastWidth!==state.width||lastHeight!==state.height){fit();lastWidth=state.width;lastHeight=state.height;}
 for(const mesh of meshes){
 const bone=mesh.userData.group==='Skeleton'||/skeleton|bone/i.test(mesh.name);
 const deep=mesh.userData.layer==='deep';
 mesh.visible=state.layer==='skeleton'?bone:state.layer==='deep'?bone||deep:true;
 const chosen=mesh===selectedMesh||state.selected.includes(mesh.userData.key);
 mesh.material.color.set(chosen?'#ff914d':bone?'#dfdcc9':deep?'#b85f55':'#bd7460');
 mesh.material.emissive.set(chosen?'#502109':'#000000');
 }
 draw();
}
let generation=0;
async function load(){
 const current=++generation;loading.hidden=false;loading.textContent='Loading detailed anatomy…';
 try{
 const female=state.model==='feminine';
 const gltf=await new GLTFLoader().loadAsync(`./models/full-body-${female?'female':'male'}-mobile.glb`);
 if(current!==generation)return;
 if(model){scene.remove(model);model.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 model=gltf.scene;meshes=[];
 model.traverse(o=>{if(o.isMesh){o.material=new THREE.MeshStandardMaterial({roughness:.64,metalness:.05});meshes.push(o);}});
 const box=new THREE.Box3().setFromObject(model);const center=box.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.z-=center.z;model.position.y-=box.min.y;
 scene.add(model);lastWidth=lastHeight=undefined;loading.hidden=true;refresh();emit({ready:true,structures:meshes.filter(m=>m.userData.muscleId).length});
 }catch{loading.textContent='The model could not load. Check your connection or use the muscle list.';emit({error:true});}
}
let down;
canvas.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};});
canvas.addEventListener('pointerup',event=>{
 if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>8)return;
 const rect=canvas.getBoundingClientRect();const point=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
 const ray=new THREE.Raycaster();ray.setFromCamera(point,camera);
 const hit=ray.intersectObjects(meshes.filter(m=>m.visible&&m.userData.muscleId),false)[0];
 if(hit){selectedMesh=hit.object;const data=hit.object.userData;label.textContent=`${data.label} · ${data.side} · ${data.layer}`;refresh();emit({muscle:data.key,label:data.label,side:data.side,layer:data.layer});}
});
document.querySelector('#front').onclick=()=>{fit(new THREE.Vector3(0,0,1));draw();};
document.querySelector('#back').onclick=()=>{fit(new THREE.Vector3(0,0,-1));draw();};
document.querySelector('#reset').onclick=()=>{selectedMesh=null;fit(new THREE.Vector3(0,0,1));refresh();};
for(const layer of ['muscles','deep','skeleton'])document.querySelector('#'+layer).onclick=()=>{state.layer=layer;for(const id of ['muscles','deep','skeleton'])document.querySelector('#'+id).setAttribute('aria-pressed',String(id===layer));refresh();};
addEventListener('message',event=>{
 if(event.origin!==location.origin&&event.source!==window)return;
 try{const data=typeof event.data==='string'?JSON.parse(event.data):event.data;if(data?.type!=='motion-body')return;const previous=state.model;Object.assign(state,data);if(state.model!==previous)void load();else refresh();}catch{}
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();loading.hidden=false;loading.textContent='3D paused. Reload the page or use the muscle list.';});
controls.update();resize();void load();
}

