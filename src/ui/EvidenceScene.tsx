import {neutralCopy} from '../domain/presentation';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DObject,CSS2DRenderer} from 'three/addons/renderers/CSS2DRenderer.js';
import {Focus,Maximize2,Minus,Plus} from 'lucide-react';
import type {DependencyNode,DependencyEdge} from '../domain/intelligence';
import {evidenceLayout} from './evidenceLayout';

const colors:Record<DependencyNode['kind'],number>={application:0xc5b4e3,claim:0x59b87b,document:0x92bfd5,deficiency:0xe2a441,visit:0x6f9ed1,obligation:0xd78087,approval:0xb5cc83,review:0x9d78c3};
const background=0x101822;
type SceneProps={nodes:DependencyNode[];edges:DependencyEdge[];selected:string|null;onSelect:(id:string)=>void};

export default function EvidenceScene({nodes,edges,selected,onSelect}:SceneProps){
 const host=useRef<HTMLDivElement>(null),selectedId=useRef(selected),allNames=useRef(false);
 const draw=useRef<()=>void>(()=>{}),emphasize=useRef<()=>void>(()=>{}),fit=useRef<()=>void>(()=>{}),focus=useRef<()=>void>(()=>{}),zoom=useRef<(factor:number)=>void>(()=>{});
 const [error,setError]=useState(''),[showAllNames,setShowAllNames]=useState(false),[hover,setHover]=useState<{label:string;left:number;top:number}|null>(null);
 const validSelection=Boolean(selected&&nodes.some(node=>node.id===selected));selectedId.current=validSelection?selected:null;allNames.current=showAllNames;

 useEffect(()=>{
  const element=host.current;if(!element)return;setError('');setHover(null);
  if(nodes.length>500||edges.length>5000){setError('This graph exceeds the 3D drawing budget. The complete evidence node table remains available.');return;}
  let renderer:THREE.WebGLRenderer|undefined,labelRenderer:CSS2DRenderer|undefined,controls:OrbitControls|undefined,observer:ResizeObserver|undefined,theme:MutationObserver|undefined;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.1,500),disposable:(THREE.BufferGeometry|THREE.Material)[]=[];
  const meshes=new Map<string,THREE.Mesh>(),labels=new Map<string,{object:CSS2DObject;element:HTMLElement;kind:DependencyNode['kind']}>(),layout=evidenceLayout(nodes,edges);
  let gone=false,hovered:string|null=null,pendingFrame=0;
  const clean=()=>{gone=true;cancelAnimationFrame(pendingFrame);theme?.disconnect();observer?.disconnect();controls?.dispose();disposable.forEach(item=>item.dispose());labels.clear();meshes.clear();labelRenderer?.domElement.remove();renderer?.dispose();renderer?.forceContextLoss();renderer?.domElement.remove();draw.current=()=>{};emphasize.current=()=>{};fit.current=()=>{};focus.current=()=>{};zoom.current=()=>{};};
  try{
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
   renderer.domElement.setAttribute('aria-hidden','true');element.append(renderer.domElement);scene.background=new THREE.Color(background);
    scene.add(new THREE.HemisphereLight(0xd8f0eb,0x263b3e,2));
    const light=new THREE.DirectionalLight(0xfff2df,3.2);light.position.set(-8,14,18);scene.add(light);
    const rim=new THREE.DirectionalLight(0x76d6bd,2);rim.position.set(10,-4,-10);scene.add(rim);
   controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=true;controls.minDistance=3;controls.maxDistance=250;controls.zoomSpeed=.8;
   labelRenderer=new CSS2DRenderer();labelRenderer.domElement.className='evidence-label-layer';labelRenderer.domElement.setAttribute('aria-hidden','true');element.append(labelRenderer.domElement);
   const facet=new THREE.IcosahedronGeometry(1,0),core=new THREE.DodecahedronGeometry(1,0),correction=new THREE.OctahedronGeometry(1,0);disposable.push(facet,core,correction);
   for(const node of nodes){
    const record=layout.get(node.id)!,radius=node.kind==='application' ? 1 : Math.min(.9,.4+Math.sqrt(record.degree)*.105);
    const material=new THREE.MeshStandardMaterial({color:colors[node.kind],roughness:.68,metalness:.03,flatShading:true,emissive:colors[node.kind],emissiveIntensity:.035});disposable.push(material);
    const mesh=new THREE.Mesh(node.kind==='application'?core:node.kind==='deficiency'?correction:facet,material);mesh.position.set(...record.position);mesh.scale.setScalar(radius);mesh.rotation.set(record.position[1]*.07,record.position[0]*.07,.15);mesh.userData={id:node.id,radius,label:node.label,detail:node.detail};meshes.set(node.id,mesh);scene.add(mesh);
    const label=document.createElement('span');label.className='scene-document-label';label.dataset.nodeId=node.id;label.title=neutralCopy([node.label,node.detail].filter(Boolean).join(' · '));
    const name=document.createElement('span');name.className='scene-document-name';name.textContent=neutralCopy(node.label);label.append(name);
    if(node.kind==='document'&&node.detail){const category=document.createElement('small');category.className='scene-document-type';category.textContent=neutralCopy(node.detail);label.append(category);}
    const object=new CSS2DObject(label);object.position.copy(mesh.position);object.center.set(.5,-.8);scene.add(object);labels.set(node.id,{object,element:label,kind:node.kind});
   }
   const edgePoints:number[]=[];
   for(const edge of edges){const from=meshes.get(edge.from),to=meshes.get(edge.to);if(from&&to)edgePoints.push(...from.position.toArray(),...to.position.toArray());}
   const edgeGeometry=new THREE.BufferGeometry();edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(edgePoints,3));
    const edgeMaterial=new THREE.LineBasicMaterial({color:0x8aa9a9,transparent:true,opacity:.3,depthWrite:false});scene.add(new THREE.LineSegments(edgeGeometry,edgeMaterial));disposable.push(edgeGeometry,edgeMaterial);
    const activeGeometry=new THREE.BufferGeometry(),activePositions=new THREE.Float32BufferAttribute(new Float32Array(edgePoints.length),3).setUsage(THREE.DynamicDrawUsage),activeMaterial=new THREE.LineBasicMaterial({color:0xb5eadc,transparent:true,opacity:.8,depthWrite:false});activeGeometry.setAttribute('position',activePositions);activeGeometry.setDrawRange(0,0);const activeLines=new THREE.LineSegments(activeGeometry,activeMaterial);activeLines.frustumCulled=false;scene.add(activeLines);disposable.push(activeGeometry,activeMaterial);
    const ringGeometry=new THREE.RingGeometry(.94,1,64),ringMaterial=new THREE.MeshBasicMaterial({color:0xe7a06c,transparent:true,opacity:.85,side:THREE.DoubleSide,depthTest:false});const ring=new THREE.Mesh(ringGeometry,ringMaterial);ring.visible=false;ring.renderOrder=3;scene.add(ring);disposable.push(ringGeometry,ringMaterial);

   emphasize.current=()=>{
    const id=selectedId.current??hovered,near=id?layout.get(id)?.neighbours:undefined;
    for(const [key,mesh]of meshes){const active=!id||key===id||near?.has(key),material=mesh.material as THREE.MeshStandardMaterial;material.transparent=!active;material.opacity=active?1:.2;material.depthWrite=Boolean(active);material.emissiveIntensity=key===id ? .16 : .035;mesh.scale.setScalar(mesh.userData.radius*(key===id?1.14:1));}
    const points:number[]=[];if(id)for(const edge of edges)if(edge.from===id||edge.to===id){const from=meshes.get(edge.from),to=meshes.get(edge.to);if(from&&to)points.push(...from.position.toArray(),...to.position.toArray());}
    activePositions.array.set(points);activePositions.needsUpdate=true;activeGeometry.setDrawRange(0,points.length/3);edgeMaterial.opacity=id ? .09 : document.documentElement.dataset.contrast==='high' ? .55 : .4;
    const selectedMesh=selectedId.current?meshes.get(selectedId.current):null;ring.visible=Boolean(selectedMesh);if(selectedMesh){ring.position.copy(selectedMesh.position);ring.scale.setScalar(selectedMesh.userData.radius*1.65);}
    for(const [key,label]of labels){label.object.visible=allNames.current||label.kind==='document'||label.kind==='application'||key===id;label.element.classList.toggle('selected',key===selectedId.current);label.element.classList.toggle('dimmed',Boolean(id&&key!==id&&!near?.has(key)));}
   };
   draw.current=()=>{if(gone||!renderer)return;ring.quaternion.copy(camera.quaternion);renderer.render(scene,camera);labelRenderer?.render(scene,camera);
    const frame=element.getBoundingClientRect(),occupied:DOMRect[]=[];
    const ranked=[...labels.entries()].sort(([a,first],[b,second])=>{const score=(id:string,kind:DependencyNode['kind'])=>id===selectedId.current?10000:id===hovered?9000:kind==='document'?100+(layout.get(id)?.degree??0):kind==='application'?90:0;return score(b,second.kind)-score(a,first.kind);});
    for(const [,label]of ranked){label.element.style.visibility='visible';label.element.style.marginLeft='0';if(!label.object.visible)continue;let rect=label.element.getBoundingClientRect();if(!rect.width)continue;const shift=Math.max(0,frame.left+7-rect.left)-Math.max(0,rect.right-frame.right+7);if(shift){label.element.style.marginLeft=shift+'px';rect=label.element.getBoundingClientRect();}
     const outside=rect.top<frame.top||rect.bottom>frame.bottom,overlap=!allNames.current&&occupied.some(box=>rect.left<box.right+5&&rect.right>box.left-5&&rect.top<box.bottom+4&&rect.bottom>box.top-4);if(outside||overlap)label.element.style.visibility='hidden';else occupied.push(rect);
    }
   };
   const fitNodes=(ids:Iterable<string>)=>{if(!controls)return;const points=[...ids].map(id=>meshes.get(id)?.position).filter((point):point is THREE.Vector3=>Boolean(point));if(!points.length)return;const bounds=new THREE.Box3().setFromPoints(points),center=bounds.getCenter(new THREE.Vector3()),direction=(camera.aspect<1?new THREE.Vector3(.95,.12,.38):new THREE.Vector3(.1,.08,1)).normalize(),right=new THREE.Vector3().crossVectors(camera.up,direction).normalize(),up=new THREE.Vector3().crossVectors(direction,right),tangent=Math.tan(camera.fov*Math.PI/360);let distance=8;
    for(const point of points){const relative=point.clone().sub(center),depth=relative.dot(direction);distance=Math.max(distance,depth+(Math.abs(relative.dot(right))+1.4)/(tangent*camera.aspect),depth+(Math.abs(relative.dot(up))+1.4)/tangent);}
    controls.target.copy(center);camera.position.copy(center).add(direction.multiplyScalar(distance*1.08));controls.update();draw.current();
   };
   fit.current=()=>fitNodes(meshes.keys());focus.current=()=>{const id=selectedId.current;if(id)fitNodes([id,...(layout.get(id)?.neighbours??[])]);};
   zoom.current=factor=>{if(!controls)return;const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();draw.current();};
   let fitted=false;const resize=()=>{if(!renderer)return;const width=element.clientWidth,height=element.clientHeight;renderer.setSize(width,height,false);labelRenderer?.setSize(width,height);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();if(!fitted){fitted=true;fit.current();}draw.current();};
   observer=new ResizeObserver(resize);observer.observe(element);controls.addEventListener('change',draw.current);emphasize.current();resize();
   const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),pickable=[...meshes.values()];
   const hit=(event:PointerEvent)=>{const bounds=element.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(pickable)[0]?.object;};
   const move=(event:PointerEvent)=>{cancelAnimationFrame(pendingFrame);pendingFrame=requestAnimationFrame(()=>{const object=hit(event),id=object?String(object.userData.id):null;if(id!==hovered){hovered=id;emphasize.current();draw.current();}element.style.cursor=id?'pointer':'grab';const bounds=element.getBoundingClientRect();setHover(object?{label:[object.userData.label,object.userData.detail].filter(Boolean).join(' · '),left:event.clientX-bounds.left,top:event.clientY-bounds.top}:null);});};
   let pressed:{x:number;y:number}|null=null;const down=(event:PointerEvent)=>{pressed={x:event.clientX,y:event.clientY};element.style.cursor='grabbing';};
   const up=(event:PointerEvent)=>{if(pressed&&Math.hypot(event.clientX-pressed.x,event.clientY-pressed.y)<5){const object=hit(event);if(object)onSelect(String(object.userData.id));}pressed=null;};
   const leave=()=>{cancelAnimationFrame(pendingFrame);hovered=null;setHover(null);emphasize.current();draw.current();};
   const lost=(event:Event)=>{event.preventDefault();setError('The graphics context was lost. Continue with the evidence node table.');};
   element.addEventListener('pointermove',move);element.addEventListener('pointerdown',down);element.addEventListener('pointerup',up);element.addEventListener('pointerleave',leave);renderer.domElement.addEventListener('webglcontextlost',lost);
   theme=new MutationObserver(()=>{emphasize.current();draw.current();});theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-contrast']});
   return()=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerdown',down);element.removeEventListener('pointerup',up);element.removeEventListener('pointerleave',leave);renderer?.domElement.removeEventListener('webglcontextlost',lost);clean();};
  }catch{clean();setError('3D is unavailable in this browser. The same evidence relationships remain accessible in the node table.');}
 },[nodes,edges,onSelect]);

 useEffect(()=>{emphasize.current();draw.current();},[selected,showAllNames]);
 return <div className="evidence-scene-shell">
  <div className="scene-toolbar" role="group" aria-label="3D map controls"><button type="button" className="button secondary small button-small" onClick={()=>fit.current()} disabled={Boolean(error)}><Maximize2 size={14}/>Fit evidence map</button><button type="button" className="button secondary small button-small" onClick={()=>focus.current()} disabled={Boolean(error)||!validSelection}><Focus size={14}/>Focus selected connections</button><div className="scene-zoom"><button type="button" className="button secondary small button-small" aria-label="Zoom out" onClick={()=>zoom.current(1.25)} disabled={Boolean(error)}><Minus size={15}/></button><button type="button" className="button secondary small button-small" aria-label="Zoom in" onClick={()=>zoom.current(.8)} disabled={Boolean(error)}><Plus size={15}/></button></div><label className="scene-label-control"><input type="checkbox" checked={showAllNames} onChange={event=>setShowAllNames(event.target.checked)} disabled={Boolean(error)}/>All record names</label></div>
   <div className="evidence-scene" ref={host} role={error?'status':'img'} aria-label={error?'3D view unavailable; use the evidence node table':`3D evidence dependency graph with ${nodes.length} nodes and ${edges.length} relationships`}>{error&&<p className="scene-fallback">{error}</p>}{hover&&!error&&<span className="scene-tooltip" style={{left:Math.min(hover.left+14,Math.max(8,(host.current?.clientWidth??0)-250)),top:Math.max(8,hover.top-48)}}>{neutralCopy(hover.label)}</span>}</div>
  <div className="graph-legend" aria-label="Evidence record colours">{Object.entries(colors).filter(([kind])=>nodes.some(node=>node.kind===kind)).map(([kind,color])=><span key={kind}><i style={{backgroundColor:'#'+color.toString(16).padStart(6,'0')}}/>{kind}</span>)}</div><p className="muted scene-help">Drag to orbit · Shift + drag to pan · Scroll to zoom. Node size reflects connected records. Select a node to trace its links and keep its name visible. Every record is also in the table below.</p>
 </div>;
}
