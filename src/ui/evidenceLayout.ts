import type {DependencyEdge,DependencyNode} from '../domain/intelligence';

export type Point3=[number,number,number];
const anchors:Record<DependencyNode['kind'],Point3>={application:[0,0,0],document:[-5,1,1],claim:[4,1,0],deficiency:[7,-4,2],visit:[-3,5,-3],approval:[-3,-5,-2],obligation:[3,-6,-3],review:[4,5,2]};
function hash(text:string){let value=2166136261;for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return (value>>>0)/4294967296;}

/** Stable layout using actual links. Coordinates and size carry no assessment score. */
export function evidenceLayout(nodes:DependencyNode[],edges:DependencyEdge[]){
 const ordered=[...nodes].sort((a,b)=>a.id.localeCompare(b.id)),index=new Map(ordered.map((node,i)=>[node.id,i]));
 const neighbours=ordered.map(()=>new Set<number>()),links:([number,number])[]=[];
 for(const edge of edges){const a=index.get(edge.from),b=index.get(edge.to);if(a===undefined||b===undefined||a===b)continue;neighbours[a].add(b);neighbours[b].add(a);links.push([a,b]);}
 const components:number[][]=[],visited=new Set<number>();
 for(let i=0;i<ordered.length;i++){if(visited.has(i))continue;const group=[i];visited.add(i);for(let head=0;head<group.length;head++)for(const next of neighbours[group[head]])if(!visited.has(next)){visited.add(next);group.push(next);}components.push(group);}
 components.sort((a,b)=>Number(b.some(i=>ordered[i].kind==='application'))-Number(a.some(i=>ordered[i].kind==='application'))||b.length-a.length);
 const targets:Point3[]=[],positions:Point3[]=[],velocities:Point3[]=ordered.map(()=>[0,0,0]);
 components.forEach((group,c)=>{const angle=c*2.399963,offset:Point3=c===0?[0,0,0]:[Math.cos(angle)*(16+c*2),Math.sin(angle)*(11+c*2),c%2?6:-6];
  for(const i of group){const node=ordered[i],anchor=anchors[node.kind],angle=hash(node.id)*Math.PI*2,z=hash(node.id+'z')*2-1,r=2+hash(node.id+'r')*2;
   targets[i]=anchor.map((value,d)=>value+offset[d]) as Point3;
   positions[i]=node.kind==='application'?[...offset]:[targets[i][0]+Math.cos(angle)*r,targets[i][1]+Math.sin(angle)*r,targets[i][2]+z*4];
  }
 });
 const steps=nodes.length>180?85:160;
 for(let step=0;step<steps;step++){
  const forces:Point3[]=ordered.map(()=>[0,0,0]);
  for(let a=0;a<ordered.length;a++)for(let b=a+1;b<ordered.length;b++){
   const dx=positions[a][0]-positions[b][0],dy=positions[a][1]-positions[b][1],dz=positions[a][2]-positions[b][2],distance=Math.max(.7,Math.sqrt(dx*dx+dy*dy+dz*dz)),strength=Math.min(1.8,3.8/(distance*distance))/distance;
   forces[a][0]+=dx*strength;forces[b][0]-=dx*strength;forces[a][1]+=dy*strength;forces[b][1]-=dy*strength;forces[a][2]+=dz*strength;forces[b][2]-=dz*strength;
  }
  for(const [a,b]of links){const delta=positions[b].map((v,d)=>v-positions[a][d]),distance=Math.max(.1,Math.hypot(...delta)),length=ordered[a].kind==='application'||ordered[b].kind==='application'?6.8:3.7,force=(distance-length)*.025;
   for(let d=0;d<3;d++){const value=delta[d]/distance*force;forces[a][d]+=value;forces[b][d]-=value;}
  }
  for(let i=0;i<ordered.length;i++){if(ordered[i].kind==='application')continue;for(let d=0;d<3;d++){forces[i][d]+=(targets[i][d]-positions[i][d])*.012;velocities[i][d]=(velocities[i][d]+forces[i][d]*.65)*.78;positions[i][d]+=velocities[i][d];}}
 }
 return new Map(ordered.map((node,i)=>[node.id,{position:[positions[i][0]*1.35,positions[i][1]*.9,positions[i][2]*.65] as Point3,degree:neighbours[i].size,neighbours:new Set([...neighbours[i]].map(n=>ordered[n].id))}]));
}
