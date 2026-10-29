/* Staged island map. The original Nether world and backend are never loaded. */
window.createTrialWorld=function(canvas){
 const T=window.THREE;
 function fallback(){let currentIsland='ferry';document.body.dataset.arrival='complete';document.querySelector('#arrival').hidden=true;
  for(const [id,left] of [['ferry',50],['home',35],['shop',70],['marsh',50]]){const el=document.querySelector('#'+id+'-marker');if(el){el.style.left=left+'%';el.style.top='55%';}}
  function visitIsland(id){if(!['ferry','home','marsh'].includes(id)||!NetherProgress.canVisit(id))return false;currentIsland=id;document.body.dataset.island=id;return true;}
  return {skip(){},zoom(){},reset(){},visitIsland,focusIsland:visitIsland,get currentIsland(){return currentIsland;},setScreen(value){const id={desk:'ferry',home:'home',shop:'home',marsh:'marsh'}[value];if(id)visitIsland(id);}};
 }
 if(!T)return fallback();
 let renderer;
 try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});}catch{return fallback();}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 const scene=new T.Scene();scene.background=new T.Color('#08121f');scene.fog=new T.FogExp2('#142b3c',.0028);
 const camera=new T.PerspectiveCamera(43,1,.1,2000);scene.add(new T.HemisphereLight(0x8eaec9,0x080e14,.72));
 const moon=new T.DirectionalLight(0x89aac7,1.65);moon.position.set(-25,45,20);scene.add(moon);
 const warm=new T.PointLight(0xf2b86b,35,20,1.4);scene.add(warm);
 let seed=54;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const mat=(color,options={})=>new T.MeshStandardMaterial({color,roughness:.95,...options});
 const stone=mat('#687976'),darkStone=mat('#455d62'),wood=mat('#665640'),roofMat=mat('#344b4e'),brass=mat('#bca16a',{metalness:.25,roughness:.65}),leaves=mat('#3e6258'),trunk=mat('#465044');
 function mesh(geometry,material,parent=scene,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
 function box(parent,w,h,d,x,y,z,material){return mesh(new T.BoxGeometry(w,h,d),material,parent,x,y,z);}
 const islands={
  ferry:{id:'ferry',name:'Charon’s Ferry',x:0,z:-3,rx:23,rz:17,view:new T.Vector3(4,20,46),dock:new T.Vector3(-3.8,-.2,18.9)},
  home:{id:'home',name:'The Village',x:145,z:-25,rx:33,rz:26,view:new T.Vector3(6,26,61),dock:new T.Vector3(141.2,-.2,8)},
  marsh:{id:'marsh',name:'Court of Judgement',x:-110,z:-150,rx:27,rz:21,view:new T.Vector3(4,31,61),dock:new T.Vector3(-113.8,-.2,-122)}
 };
 const homeSite={x:137,z:-16},stallSite={x:158,z:-14};
 const sphereGeometry=new T.IcosahedronGeometry(1,1);
 // Flowing water: irregular current, submerged shelves and broken lantern reflections.
 const waterUniforms={time:{value:0},fogDensity:{value:.0028},flash:{value:0},cave:{value:1}};
 const noiseGLSL=`float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){return noise(p)*.57+noise(p*2.03+7.)*.28+noise(p*4.11)*.15;}`;
 const water=mesh(new T.PlaneGeometry(4000,4000),new T.ShaderMaterial({uniforms:waterUniforms,
 vertexShader:`varying vec3 world;void main(){vec4 w=modelMatrix*vec4(position,1.);world=w.xyz;vec4 v=viewMatrix*w;gl_Position=projectionMatrix*v;}`,
 fragmentShader:`varying vec3 world;uniform float time;uniform float fogDensity;uniform float flash;uniform float cave;${noiseGLSL}
 void main(){vec2 v=world.xz;float n=fbm(v*.12+vec2(time*.025,-time*.045));
 float flow=sin(v.y*3.4+v.x*.28+n*9.-time*.7);float ripple=pow(max(0.,flow),22.)*noise(vec2(v.x*.7,v.y*.9+time*.1));
 float coast=min(length(vec2(v.x/23.,(v.y+3.)/17.)),min(length(vec2((v.x-145.)/33.,(v.y+25.)/26.)),length(vec2((v.x+110.)/27.,(v.y+150.)/21.))));float shelf=exp(-pow((coast-1.)*7.,2.));
 float moon=exp(-pow((v.x+10.+n*13.)/17.,2.));
 vec3 c=vec3(.018,.045,.072)+vec3(.014,.038,.05)*n;
 c+=vec3(.035,.09,.11)*shelf*(.4+n*.6)+vec3(.055,.11,.14)*ripple*(.08+moon*.7);
 float lamps=exp(-pow(v.x/2.3,2.))*exp(-abs(v.y-16.)*.11)+exp(-pow((v.x-137.)/2.,2.))*exp(-abs(v.y+8.)*.17)+exp(-pow((v.x-158.)/2.,2.))*exp(-abs(v.y+8.)*.17);
 c+=vec3(.23,.13,.045)*lamps*(.1+ripple*.8);c+=vec3(.14,.19,.3)*flash*(.15+n*.3+ripple*moon);
 float distanceToEye=length(world-cameraPosition);float fog=1.-exp(-fogDensity*fogDensity*distanceToEye*distanceToEye);vec3 dir=normalize(world-cameraPosition);vec2 skyUV=vec2(atan(dir.z,dir.x)*3.,dir.y*7.);vec3 skyColor=mix(vec3(.018,.033,.059),vec3(.075,.125,.18),exp(-abs(dir.y)*5.))*(.65+fbm(skyUV+vec2(time*.008,0.))*.5);c=mix(c,mix(skyColor,vec3(.018,.035,.05),cave),fog);
 gl_FragColor=vec4(c,1.);}`}));water.rotation.x=-Math.PI/2;water.position.y=-.25;
 const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
 const noise=(x,z)=>{const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),u),T.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),u),v);};
 const fbm=(x,z)=>noise(x,z)*.56+noise(x*2.03+7,z*2.03)*.28+noise(x*4.11,z*4.11+13)*.16;
 // Rock grain from the earlier world, kept local so the sandbox needs no fetch.
 const rockCanvas=document.createElement('canvas');rockCanvas.width=rockCanvas.height=128;const rc=rockCanvas.getContext('2d'),pixels=rc.createImageData(128,128);
 for(let z=0;z<128;z++)for(let x=0;x<128;x++){const v=100+fbm(x*.16,z*.16)*110+Math.sin(z*.4+noise(x*.05,z*.05)*12)*18,i=(z*128+x)*4;pixels.data.set([v*.82,v*.92,v,255],i);}rc.putImageData(pixels,0,0);
 const rockTexture=new T.CanvasTexture(rockCanvas);rockTexture.wrapS=rockTexture.wrapT=T.RepeatWrapping;rockTexture.repeat.set(18,18);rockTexture.colorSpace=T.SRGBColorSpace;
 const rockBump=rockTexture.clone();rockBump.colorSpace=T.NoColorSpace;rockBump.needsUpdate=true;
 // Three independent shores, each with its own silhouette and a clear landing.
 function islandGround(island,x,z){const u=x-island.x,v=z-island.z,a=Math.atan2(v,u),n=fbm(u*.15,v*.15);
  const edge=Math.hypot(u/island.rx,v/island.rz)+(n-.5)*.10+Math.sin(a*7)*.025;
  const bank=1-T.MathUtils.smoothstep(edge,.74,1.08);
  let h=3.3+(fbm(u*.35,v*.35)-.5)*.9;
  if(island.id==='home')h+=22*Math.exp(-((u+2)**2/95+(v+10)**2/64))+9*Math.exp(-((u-11)**2/38+(v+14)**2/80));
  if(island.id==='ferry')h+=3.7*Math.exp(-((v+11)**2)/24)*(.4+n);
  if(island.id==='marsh')h=4.2+noise(u*.12,v*.12)*.8;
  let height=-1.7+bank*h;
  const channel=(1-T.MathUtils.smoothstep(Math.abs(u+3.8),2.2,4.5))*T.MathUtils.smoothstep(v,island.rz*.75,island.rz*.95);
  return T.MathUtils.lerp(height,-1.7,channel);
 }
 function ground(x,z){return Math.max(...Object.values(islands).map(island=>islandGround(island,x,z)));}
 const color=new T.Color(),islandCliff=new T.Group();islandCliff.name='shore-rocks';scene.add(islandCliff);
 for(const island of Object.values(islands)){
  const geometry=new T.PlaneGeometry(island.rx*2.6,island.rz*2.6,110,90);geometry.rotateX(-Math.PI/2);geometry.translate(island.x,0,island.z);
  const p=geometry.attributes.position,colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),h=islandGround(island,x,z);p.setY(i,h);color.setHSL(island.id==='marsh'?.48:.57,.19,.075+Math.max(h,0)*.005+fbm(x*.7,z*.7)*.025);colors.set([color.r,color.g,color.b],i*3);}
  geometry.setAttribute('color',new T.BufferAttribute(colors,3));geometry.computeVertexNormals();const terrain=mesh(geometry,mat('#ffffff',{vertexColors:true,map:rockTexture,bumpMap:rockBump,bumpScale:.5}));terrain.name=island.id+'-terrain';
  for(let i=0;i<110;i++){const a=random()*Math.PI*2,u=Math.cos(a)*island.rx*(.86+random()*.13),v=Math.sin(a)*island.rz*(.88+random()*.12);if(Math.abs(u+3.8)<6&&v>island.rz*.55)continue;
   const rock=mesh(sphereGeometry,darkStone,islandCliff,island.x+u,island.id==='marsh'?-.1:.2,island.z+v),size=.3+random()*1.25;rock.scale.set(size*(1+random()),size*(.5+random()),size*(.7+random()));rock.rotation.set(random(),random()*3,random());}
 }
 // One connected mountain ring, with river valleys cut between its ridges.
 const mountainGeo=new T.PlaneGeometry(1600,1800,240,250);mountainGeo.rotateX(-Math.PI/2);mountainGeo.translate(35,0,-100);const mp=mountainGeo.attributes.position,mc=new Float32Array(mp.count*3),mountainColor=new T.Color();
 for(let i=0;i<mp.count;i++){const x=mp.getX(i),z=mp.getZ(i),r=Math.hypot((x-35)*.95,(z+100)*.8),a=Math.atan2(z+100,x-35);
 const inner=290+Math.sin(a*5)*25+(fbm(x*.017,z*.017)-.5)*65,bank=T.MathUtils.smoothstep(r,inner,inner+42),outer=1-T.MathUtils.smoothstep(r,470,570);
 const opening=1-T.MathUtils.smoothstep(z,-20,60),ridged=1-Math.abs(fbm(x*.019+8,z*.019)*2-1);
 const h=-2+bank*outer*opening*(5+Math.pow(ridged,4)*32+noise(x*.035,z*.035)*8);
 mp.setY(i,h);mountainColor.setHSL(.59,.24,.10+fbm(x*.18,z*.18)*.075);mc.set([mountainColor.r,mountainColor.g,mountainColor.b],i*3);}
 mountainGeo.setAttribute('color',new T.BufferAttribute(mc,3));mountainGeo.computeVertexNormals();
 const mountains=mesh(mountainGeo,mat('#ffffff',{vertexColors:true,bumpMap:rockBump,bumpScale:1}));mountains.name='surrounding-mountains';
 const skyUniforms={time:{value:0},flash:{value:0}};
 const skyDome=mesh(new T.SphereGeometry(1900,24,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:skyUniforms,
 vertexShader:`varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`varying vec3 direction;uniform float time;uniform float flash;${noiseGLSL}
 void main(){vec3 d=normalize(direction);vec2 v=vec2(atan(d.z,d.x)*3.,d.y*7.);float n=fbm(v+vec2(time*.008,0.));float horizon=exp(-abs(d.y)*5.);vec3 c=mix(vec3(.018,.033,.059),vec3(.075,.125,.18),horizon);c*=.65+n*.5;c+=vec3(.26,.32,.46)*flash*(.2+n*.8);gl_FragColor=vec4(c,1.);}`}));skyDome.renderOrder=-10;
 function tree(x,z,scale=1){const root=new T.Group();root.position.set(x,ground(x,z),z);scene.add(root);box(root,.13,2.6*scale,.13,0,1.3*scale,0,trunk);const crown=mesh(new T.ConeGeometry(.65*scale,3.8*scale,8),leaves,root,0,3*scale,0);crown.rotation.y=random();return root;}
 for(const island of [islands.ferry,islands.home])for(let i=0;i<65;i++){const u=(random()-.5)*island.rx*1.9,v=(random()-.5)*island.rz*1.7,x=island.x+u,z=island.z+v;if(ground(x,z)<1||v>3&&Math.abs(u)<21||island.id==='home'&&ground(x,z)>13)continue;tree(x,z,.6+random()*.8);}
 // Charon's wooden hall and ferry dock.
 const hall=new T.Group();hall.name='ferry';hall.position.set(0,ground(0,0),0);scene.add(hall);
 box(hall,7,.5,5,0,.2,0,wood);box(hall,5.3,3.3,3.6,0,2,-.5,stone);
 for(const x of [-2,2]){const column=mesh(new T.CylinderGeometry(.21,.26,3.5,10),stone,hall,x,2,2);box(hall,.65,.25,.65,x,3.8,2,brass);}
 box(hall,6.1,.4,5.1,0,4,0,wood);const hallRoof=mesh(new T.ConeGeometry(4.4,2.1,4),roofMat,hall,0,5.1,0);hallRoof.rotation.y=Math.PI/4;hallRoof.scale.z=.85;
 box(hall,1.3,2.5,.09,0,1.9,1.36,mat('#182b31'));
 for(const x of [-1.7,1.7]){box(hall,.7,1,.08,x,2.25,1.34,mat('#dfc68e',{emissive:'#b99b61',emissiveIntensity:.4}));box(hall,.05,1.1,.1,x,2.25,1.4,wood);}
 for(let i=0;i<19;i++)box(hall,3.4,.15,.38,0,-.3-i*.045,3+i*.43,wood);
 for(const x of [-1.45,1.45])for(const z of [4,7,10])box(hall,.15,1.7,.15,x,.1,z,wood);
 // Extend the pier into open water; moor beside it rather than driving into its end.
 const pier=new T.Group();pier.name='ferry-pier';scene.add(pier);
 for(let i=0;i<24;i++){const z=10.8+i*.43;box(pier,3.4,.15,.39,0,Math.max(.65,ground(0,z)+.12),z,wood);}
 box(pier,3.4,.15,.42,0,.84,12.25,wood);
 for(const x of [-1.45,1.45])for(const z of [13,16.5,19])box(pier,.16,1.6,.16,x,.15,z,wood);
 const ferryLight=new T.PointLight(0xefc27b,40,17,1.4);ferryLight.position.set(0,5,4);scene.add(ferryLight);
 // A small and explicitly domestic home, rather than a second administrative house.
 const cottage=new T.Group();cottage.name='home';cottage.position.set(homeSite.x,ground(homeSite.x,homeSite.z),homeSite.z);cottage.rotation.y=-.13;scene.add(cottage);
 box(cottage,6,.45,5.3,0,.1,0,stone);box(cottage,5.1,3.3,4.5,0,1.9,0,mat('#8b8b72'));
 const roof=mesh(new T.ConeGeometry(4.7,2.5,4),roofMat,cottage,0,4.7,0);roof.rotation.y=Math.PI/4;roof.scale.z=.95;
 box(cottage,.75,2.8,.8,1.4,5,-.8,darkStone);box(cottage,.95,.25,1,1.4,6.5,-.8,stone);
 box(cottage,1.1,2,.1,.5,1.5,2.3,wood);box(cottage,1.1,1.25,.11,-1.3,2,2.3,mat('#e2c78e',{emissive:'#d8a768',emissiveIntensity:.8}));box(cottage,.08,1.3,.14,-1.3,2,2.4,wood);box(cottage,1.2,.07,.14,-1.3,2,2.4,wood);
 for(let i=0;i<3;i++)box(cottage,2,.25,.65,.4,-.15-i*.22,3+i*.5,stone);
 warm.position.set(homeSite.x,ground(homeSite.x,homeSite.z)+4,homeSite.z+2);
 for(let i=0;i<7;i++){const x=132+i*.55;box(scene,.08,.7,.08,x,ground(x,-9)+.35,-9,wood);if(i<6)box(scene,.7,.07,.06,x+.3,ground(x,-9)+.55,-9,wood);}
 // A single-headed puppy. The larger Cerberus reveal belongs to a later story.
 const puppy=new T.Group();puppy.position.set(homeSite.x-1,ground(homeSite.x-1,homeSite.z+5)+.4,homeSite.z+5);scene.add(puppy);const fur=mat('#48514c');
 const body=mesh(new T.SphereGeometry(.42,12,8),fur,puppy,0,.25,0);body.scale.set(.8,.8,1.25);mesh(new T.SphereGeometry(.3,12,8),fur,puppy,0,.68,.25);
 for(const x of [-.2,.2]){const ear=mesh(new T.SphereGeometry(.16,8,8),fur,puppy,x,.65,.2);ear.scale.set(.7,1.6,.6);}
 mesh(new T.SphereGeometry(.13,8,8),mat('#bdac82'),puppy,0,.55,.48);
 const tail=mesh(new T.CylinderGeometry(.045,.08,.6,6),fur,puppy,0,.5,-.55);tail.rotation.x=-.7;
 // Other examiners live here too. Their windows stay dark.
 const neighbors=new T.Group();neighbors.name='employee-houses';scene.add(neighbors);
 const unlitStone=mat('#414c50'),unlitRoof=mat('#202e38'),unlitWindow=mat('#03090e');
 for(const [u,v,angle,scale] of [[-21,0,.15,.85],[22,0,-.2,.88],[-16,-10,.25,.75],[18,-13,-.3,.8],[-24,9,.1,.72],[24,10,-.1,.7]]){
  const x=islands.home.x+u,z=islands.home.z+v,g=new T.Group();g.name='employee-house';g.position.set(x,ground(x,z),z);g.rotation.y=angle;g.scale.setScalar(scale);neighbors.add(g);
  box(g,5.7,.4,4.8,0,.2,0,darkStone);box(g,4.8,3.1,4,0,1.9,0,unlitStone);const r=mesh(new T.ConeGeometry(4.2,2.2,4),unlitRoof,g,0,4.4,0);r.rotation.y=Math.PI/4;r.scale.z=.86;
  box(g,.85,2,.08,.65,1.4,2.04,unlitWindow);box(g,.8,.9,.09,-1.05,2.1,2.05,unlitWindow);box(g,.65,2.1,.7,1.25,4.6,-.7,darkStone);
 }
 function stonePath(ax,az,bx,bz,count=40){for(let i=0;i<count;i++){const u=i/(count-1),x=T.MathUtils.lerp(ax,bx,u),z=T.MathUtils.lerp(az,bz,u)+Math.sin(u*Math.PI)*1.1,pebble=mesh(sphereGeometry,i%3?stone:darkStone,scene,x,ground(x,z)+.07,z);pebble.scale.set(.3+random()*.3,.07,.28+random()*.2);pebble.rotation.y=random()*3;}}
 stonePath(0,4,0,14,24);stonePath(homeSite.x,homeSite.z+3,stallSite.x,stallSite.z+3);stonePath(islands.home.x,islands.home.z+24,homeSite.x,homeSite.z+3,28);
 // A merchant's awning beside the path, with jars and a single hanging lamp.
 const stall=new T.Group();stall.name='stall';stall.position.set(stallSite.x,ground(stallSite.x,stallSite.z),stallSite.z);stall.rotation.y=.18;scene.add(stall);
 box(stall,4.4,.25,3.5,0,.12,0,wood);box(stall,3.7,1.15,.7,0,.8,1.1,wood);box(stall,3.9,.14,.95,0,1.43,1.1,brass);
 for(const x of [-1.8,1.8])for(const z of [-1.2,1.3])box(stall,.12,2.9,.12,x,1.5,z,wood);
 box(stall,3.8,1.7,.12,0,1.2,-1.2,wood);
 const awningGeo=new T.PlaneGeometry(4.6,3.6,12,8);awningGeo.rotateX(-Math.PI/2);const ap=awningGeo.attributes.position;
 for(let i=0;i<ap.count;i++)ap.setY(i,3.15-Math.abs(ap.getX(i))*.14+Math.sin(ap.getZ(i)*2)*.06);awningGeo.computeVertexNormals();mesh(awningGeo,mat('#6b6351',{side:T.DoubleSide}),stall);
 for(let i=0;i<7;i++){const jar=mesh(new T.CylinderGeometry(.13,.23,.55,8),mat(i%2?'#8c6f47':'#586968'),stall,-1.3+i*.42,1.78,1.1);mesh(new T.CylinderGeometry(.16,.16,.09,8),brass,jar,0,.3,0);}
 const stallLight=new T.PointLight(0xefb76b,18,9,1.4);stallLight.position.set(1.3,2.2,1.3);stall.add(stallLight);
 const lampGlass=mat('#e9bf7f',{emissive:'#efa64b',emissiveIntensity:1.8});box(stall,.22,.35,.22,1.3,2.25,1.3,lampGlass);box(stall,.4,.1,.4,1.3,2.48,1.3,brass);
 // Each destination has a small landing, with room to moor alongside.
 const islandPiers={ferry:pier};
 for(const island of [islands.home,islands.marsh]){const landing=new T.Group();landing.name=island.id+'-pier';scene.add(landing);islandPiers[island.id]=landing;
  const end=island.dock.z+2,start=island.z+island.rz*.73;
  for(let z=start;z<end;z+=.43)box(landing,3.4,.15,.39,island.x,.65,z,wood);
  for(const x of [island.x-1.45,island.x+1.45])for(const z of [start+1,end-1])box(landing,.16,1.6,.16,x,.15,z,wood);
  box(landing,.15,2,.15,island.x+2,.95,start+2,wood);box(landing,1.5,.7,.12,island.x+2,1.7,start+2,darkStone);
 }
 // Distant ravens turn against the valley mist.
 const birds=new T.Group();birds.name='river-ravens';scene.add(birds);const birdMat=new T.MeshBasicMaterial({color:0x050b13,side:T.DoubleSide});
 for(let i=0;i<11;i++){const bird=new T.Group();bird.userData.phase=random()*Math.PI*2;bird.userData.offset=new T.Vector3((i-5)*2.4,Math.sin(i*1.9)*1.4,(i%4)*2.7);for(const side of [-1,1]){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,side*.8,.07,.18,side*.4,0,-.2],3));geo.computeVertexNormals();const wing=mesh(geo,birdMat,bird);wing.userData.side=side;}birds.add(bird);}
 // Rain: a column of streaks that rides with the camera, so it is always
 // falling in front of you and never a visible edge of weather.
 let rainField=null;
 {
  const drops=1100,pos=new Float32Array(drops*6),speed=new Float32Array(drops);
  for(let i=0;i<drops;i++){const x=(random()-.5)*150,y=random()*70,z=(random()-.5)*150;pos.set([x,y,z,x-.12,y-.9,z+.08],i*6);speed[i]=26+random()*22;}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(pos,3));
  rainField=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#8aabbf',transparent:true,opacity:0,depthWrite:false}));
  rainField.frustumCulled=false;rainField.visible=false;rainField.userData.speed=speed;scene.add(rainField);
 }
 const sprites=[];
 const glowCanvas=document.createElement('canvas');glowCanvas.width=64;glowCanvas.height=64;const gc=glowCanvas.getContext('2d'),gradient=gc.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'#fff');gradient.addColorStop(.1,'#ffffffbb');gradient.addColorStop(1,'#ffffff00');gc.fillStyle=gradient;gc.fillRect(0,0,64,64);const glowTexture=new T.CanvasTexture(glowCanvas);
 for(let i=0;i<70;i++){const sprite=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:i%4?0xb5d4be:0xf0cc8a,transparent:true,opacity:.4,depthWrite:false,blending:T.AdditiveBlending}));const island=Object.values(islands)[i%3],x=island.x+(random()-.5)*island.rx*1.8,z=island.z+(random()-.5)*island.rz*1.8;sprite.position.set(x,2+random()*4,z);sprite.scale.setScalar(.15+random()*.22);scene.add(sprite);sprites.push({sprite,base:sprite.position.clone(),phase:random()*6});}
 // Low mist catches the cold light while the ground above it stays dark.
 const mist=[];
 function mistPatch(x,y,z,width,height,opacity){const sprite=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:0x80b6d3,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending,fog:false}));sprite.position.set(x,Math.max(y,height*.55),z);sprite.scale.set(width,height,1);scene.add(sprite);mist.push({sprite,x,z,opacity,phase:random()*Math.PI*2});}
 for(const island of Object.values(islands))for(let i=0;i<36;i++){const a=i/36*Math.PI*2;mistPatch(island.x+Math.cos(a)*(island.rx+2+random()*3),.4+random()*.7,island.z+Math.sin(a)*(island.rz+2+random()*3),10+random()*10,2+random()*2,.10+random()*.1);}
 for(let i=0;i<30;i++){const z=-50-random()*245;mistPatch((random()-.5)*240,1+random()*4,z,30+random()*65,3+random()*7,.08+random()*.12);}
 // A short enclosed passage; the boat keeps its original river pace. The route is aligned with the left side of the pier.
 const cave=new T.Group();cave.name='arrival-cave';scene.add(cave);const caveGeo=new T.PlaneGeometry(Math.PI,14,42,28),ca=caveGeo.attributes.position;
 const caveMat=mat('#43505b',{side:T.DoubleSide,bumpMap:rockBump,bumpScale:.7});
 for(let i=0;i<ca.count;i++){const a=ca.getX(i)+Math.PI/2,z=ca.getY(i)+35,n=fbm(a*5,z*.4),bend=Math.sin(z*.09)*.65;ca.setXYZ(i,-3.8+bend+(6+n)*Math.cos(a),.1+(4.8+n*.9)*Math.sin(a),z);}caveGeo.computeVertexNormals();mesh(caveGeo,caveMat,cave);
 for(let i=0;i<20;i++){const side=i%2?1:-1,z=29+random()*12,rock=mesh(sphereGeometry,caveMat,cave,-3.8+side*(5.8+random()*.7),.4+random()*2,z);rock.scale.set(1+random(),1.3+random()*1.8,1.5+random()*1.8);rock.rotation.set(random(),random()*3,random());}
 for(let i=0;i<15;i++){const a=i/14*Math.PI,rock=mesh(sphereGeometry,caveMat,cave,-3.8+6.5*Math.cos(a),.15+5.1*Math.sin(a),28.5);rock.scale.set(1.1,.8+random()*.8,1.2+random());rock.rotation.set(random(),random(),random());}
 for(const z of [32,39]){const lamp=new T.PointLight(0xd7b777,12,13,1.5);lamp.position.set(1.5,2.5,z);cave.add(lamp);box(cave,.16,.3,.16,1.5,2.5,z,lampGlass);}
 for(let i=0;i<25;i++){const sprite=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:i%5?0xc8ca8b:0x86c1c6,transparent:true,opacity:.65,depthWrite:false,blending:T.AdditiveBlending}));sprite.position.set(-3.8+(random()-.5)*10,.6+random()*3,30+random()*11);sprite.scale.setScalar(.11+random()*.17);cave.add(sprite);sprites.push({sprite,base:sprite.position.clone(),phase:random()*6});}
 for(let i=0;i<4;i++){const cloud=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:0x729398,transparent:true,opacity:.10,depthWrite:false}));cloud.position.set(-3.8+(random()-.5)*5,.5+random()*.6,30+i*3);cloud.scale.set(10,1.4+random(),1);cave.add(cloud);}
 const boat=new T.Group();boat.name='arrival-ferry';scene.add(boat);
 const shape=new T.Shape();shape.moveTo(-1.1,-2);shape.quadraticCurveTo(-1.7,.2,0,2.8);shape.quadraticCurveTo(1.7,.2,1.1,-2);shape.closePath();const hull=mesh(new T.ExtrudeGeometry(shape,{depth:.45,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.12,bevelThickness:.1}),wood,boat);hull.rotation.x=-Math.PI/2;
 for(let i=0;i<5;i++)box(boat,2,.1,.28,0,.3,-1.7+i*.7,mat('#89704b'));
 const boatGlow=new T.PointLight(0xe5bd79,16,9,1.2);boatGlow.position.set(.75,1.1,.2);boat.add(boatGlow);
 const route=new T.CatmullRomCurve3([new T.Vector3(-3.8,-.2,39.2),new T.Vector3(-3.8,-.2,34),new T.Vector3(-3.8,-.2,29),new T.Vector3(-3.8,-.2,23),new T.Vector3(-3.8,-.2,18.9)],false,'centripetal');
 window.createJudgementCourt(T,{scene,x:islands.marsh.x,z:islands.marsh.z,mesh,box,mat,rockBump,glowTexture});
 const destinations=[{id:'tartarus',x:-205,z:-400,color:'#403b49',height:14},{id:'asphodel',x:-110,z:-430,color:'#435d5c',height:4},{id:'elysium',x:-5,z:-410,color:'#697875',height:8}];
 for(const d of destinations){const group=new T.Group();group.name=d.id;group.position.set(d.x,0,d.z);scene.add(group);const land=mesh(new T.CylinderGeometry(13,18,3,11),mat(d.color),group,0,.1,0);land.scale.z=.7;for(let i=0;i<11;i++){const rock=mesh(new T.ConeGeometry(2+random()*4,d.height*(.4+random()*.7),5),mat(d.color),group,(random()-.5)*20,d.height*.25,(random()-.5)*10);rock.rotation.y=random()*3;}if(d.id==='elysium'){const light=new T.PointLight(0xf2dfa7,100,42,1.2);light.position.set(0,8,0);group.add(light);}if(d.id==='tartarus'){for(let i=0;i<4;i++)box(group,.4,1,.5,i*3-4,2,3,mat('#c18165',{emissive:'#8f4a3a',emissiveIntensity:.8}));}}
 const riverRoutes=[];
 // Keep invisible navigation curves for soul travel, without drawing route lines.
 function waterRoute(points){const curve=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,-.12,z)),false,'centripetal');riverRoutes.push(curve);return curve;}
 const toMarsh=waterRoute([[-3.8,18.9],[-38,24],[-60,-35],[-90,-100],[-110,-150]]);
 for(const d of destinations)waterRoute([[-110,-150],[-110,-210],[d.x*.8,d.z+20],[d.x,d.z+5]]);
 const travellingSoul=mesh(new T.SphereGeometry(.42,10,8),new T.MeshBasicMaterial({color:'#d5e7bd'}));travellingSoul.visible=false;let crossing=-1;
 // A composed vista: the active island stays at its logical landing, while
 // the two remote shores sit on either side of it in the distance. Navigation
 // and all game coordinates remain local to the active island.
 const islandOffsets=Object.fromEntries(Object.keys(islands).map(id=>[id,new T.Vector3()])),viewObjects=[];
 const excluded=new Set([water,mountains,skyDome,moon,rainField,birds,boat,travellingSoul,islandCliff]);
 function visualOwner(o){const point=o.position.clone();if(point.lengthSq()<.01){const bounds=new T.Box3().setFromObject(o);if(bounds.isEmpty())return null;bounds.getCenter(point);}
  return Object.values(islands).find(i=>Math.hypot(point.x-i.x,point.z-i.z)<Math.max(i.rx,i.rz)+28)?.id;
 }
 for(const o of [...scene.children,...islandCliff.children]){if(excluded.has(o)||o.isHemisphereLight||o.isDirectionalLight)continue;const owner=visualOwner(o);if(owner){o.userData.visualIsland=owner;viewObjects.push({object:o,base:o.position.clone(),owner});}}
 function arrangeVista(){const current=islands[currentIsland],view=current.view,forward=new T.Vector3(-view.x,0,-view.z).normalize(),right=new T.Vector3(-forward.z,0,forward.x),others={ferry:['home','marsh'],home:['ferry','marsh'],marsh:['ferry','home']}[currentIsland];
  for(const id of Object.keys(islands)){const offset=islandOffsets[id];if(id===currentIsland){offset.set(0,0,0);continue;}const side=others.indexOf(id)===0?-1:1,target=new T.Vector3(current.x,0,current.z).addScaledVector(forward,200*mapFit()).addScaledVector(right,side*Math.min(80,Math.max(35,70*camera.aspect)));offset.set(target.x-islands[id].x,0,target.z-islands[id].z);}
  for(const entry of viewObjects)entry.object.position.copy(entry.base).add(islandOffsets[entry.owner]);
 }
 let currentIsland='ferry',voyage=null,radiusScale=1,desiredScale=1,yaw=0,desiredYaw=0;
 const blink=document.querySelector('#island-blink');
 const mapTarget=new T.Vector3(0,2,-6),mapFit=()=>Math.max(1.17,1.35/camera.aspect);
 const islandTarget=id=>new T.Vector3(islands[id].x,id==='marsh'?7:2,islands[id].z-3);
 function orbitPosition(id=currentIsland){const island=islands[id],view=island.view,angle=Math.atan2(view.x,view.z)+yaw,dist=Math.hypot(view.x,view.z)*radiusScale*mapFit();return new T.Vector3(island.x+Math.sin(angle)*dist,view.y*radiusScale*mapFit(),island.z+Math.cos(angle)*dist);}
 const landingSeat=route.getPoint(1).add(new T.Vector3(0,1.7,1.3));
 const caveFog=new T.Color('#08151d'),riverFog=new T.Color('#142b3c');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;let started=performance.now(),ARRIVAL_MS=10400,ARRIVAL_TRAVEL_MS=6300,arrival=true,screen='map',previous=performance.now(),elapsed=0;
 function syncIsland(){document.body.dataset.island=currentIsland;document.body.dataset.voyage=voyage?'running':'complete';const button=document.querySelector('#river-atlas-toggle');if(button)button.disabled=!!voyage;}
 function focusIsland(id,keepBlink=false){if(!islands[id]||!NetherProgress.canVisit(id))return false;currentIsland=id;if(!keepBlink){voyage=null;blink.hidden=true;blink.style.opacity=0;}radiusScale=desiredScale=1;yaw=desiredYaw=0;mapTarget.copy(islandTarget(id));boat.position.copy(islands[id].dock);boat.rotation.y=0;camera.position.copy(orbitPosition());camera.lookAt(mapTarget);arrangeVista();syncIsland();return true;}
 function finish(){arrival=false;cave.visible=false;scene.fog.density=.0028;scene.fog.color.copy(riverFog);document.body.dataset.arrival='complete';document.querySelector('#arrival').hidden=true;focusIsland('ferry');}
 function visitIsland(id){if(!islands[id]||voyage||!NetherProgress.canVisit(id))return false;if(arrival)finish();if(id===currentIsland)return true;if(reduced)return focusIsland(id);
  voyage={id,started:performance.now(),phase:'out'};blink.hidden=false;blink.style.opacity=0;syncIsland();return true;
 }
 syncIsland();
 function project(id,point){const el=document.querySelector(id);if(!el)return;const r=canvas.getBoundingClientRect(),v=point.clone().project(camera);el.style.left=(v.x*.5+.5)*r.width+'px';el.style.top=(-v.y*.5+.5)*r.height+'px';el.style.visibility=v.z<1&&Math.abs(v.x)<1.1&&Math.abs(v.y)<1.1?'visible':'hidden';}
 function frame(now){requestAnimationFrame(frame);const dt=Math.max(0,Math.min(.04,(now-previous)/1000));previous=now;elapsed+=dt;if(screen!=='map')return;
  const rect=canvas.getBoundingClientRect();if(canvas.width/renderer.getPixelRatio()!==Math.round(rect.width)||canvas.height/renderer.getPixelRatio()!==Math.round(rect.height)){renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();arrangeVista();}
  waterUniforms.time.value=elapsed;skyUniforms.time.value=elapsed;skyDome.position.copy(camera.position);for(const m of mist){const offset=islandOffsets[m.sprite.userData.visualIsland]||new T.Vector3();m.sprite.position.x=m.x+Math.sin(elapsed*.035+m.phase)*3+offset.x;m.sprite.position.z=m.z+Math.cos(elapsed*.023+m.phase)*1.5+offset.z;}waterUniforms.fogDensity.value=scene.fog.density;tail.rotation.z=Math.sin(elapsed*4)*.4;birds.position.set(Math.sin(elapsed*.035)*45,13+Math.sin(elapsed*.12)*2,-100+Math.cos(elapsed*.035)*20);birds.rotation.y=-elapsed*.035;for(const bird of birds.children){bird.position.copy(bird.userData.offset);bird.position.y+=Math.sin(elapsed*1.1+bird.userData.phase)*.4;for(const wing of bird.children)wing.rotation.z=Math.sin(elapsed*5+bird.userData.phase)*.48*wing.userData.side;}
  // Weather drives the air. In the cave it is muffled, and the fog closes in.
  const caveDepth=arrival?T.MathUtils.smoothstep(boat.position.z,26,34):0;
  scene.fog.color.lerpColors(caveFog,riverFog,1-caveDepth);waterUniforms.cave.value=caveDepth;
  const sky=typeof netherWeather!=='undefined'?netherWeather.tick(elapsed,dt,caveDepth):null;
  if(sky){
   const thickness=.0028+sky.rain*.0018+caveDepth*.055;
   scene.fog.density+=(thickness-scene.fog.density)*(1-Math.exp(-dt/1.4));
   const lit=sky.flash*.75;
   renderer.toneMappingExposure=(1.05-sky.rain*.15)+lit*1.6;waterUniforms.flash.value=sky.flash;skyUniforms.flash.value=sky.flash;
   if(rainField)rainField.material.opacity=Math.min(.25,sky.rain*.25);
   if(rainField)rainField.visible=sky.rain>.02&&caveDepth<.2;
   if(rainField&&rainField.visible){
    const p=rainField.geometry.attributes.position,speed=rainField.userData.speed;
    for(let i=0;i<speed.length;i++){
     const at=i*6;p.array[at+1]-=speed[i]*dt;p.array[at+4]-=speed[i]*dt;
     if(p.array[at+1]<-2){const x=camera.position.x+(random()-.5)*150,z=camera.position.z+(random()-.5)*150;p.array.set([x,68,z,x-.12,67.1,z+.08],at);}
    }
    p.needsUpdate=true;
   }
  }
  if(crossing>=0){crossing=Math.min(1,crossing+dt/12);travellingSoul.visible=true;travellingSoul.position.copy(toMarsh.getPointAt(crossing));travellingSoul.position.y=.6+Math.sin(elapsed*2)*.15;if(crossing===1){crossing=-1;travellingSoul.visible=false;}}
  for(const f of sprites){const offset=islandOffsets[f.sprite.userData.visualIsland]||new T.Vector3();f.sprite.position.z=f.base.z+offset.z;f.sprite.position.y=f.base.y+Math.sin(elapsed*.6+f.phase)*.5;f.sprite.position.x=f.base.x+Math.sin(elapsed*.25+f.phase)*.7+offset.x;f.sprite.material.opacity=.3+Math.sin(elapsed+f.phase)*.15;}
  if(arrival){
   // A first frame's timestamp can precede setup; keep curve samples within [0, 1].
   const age=Math.max(0,now-started),duration=reduced?900:ARRIVAL_MS,travelDuration=reduced?700:ARRIVAL_TRAVEL_MS,p=Math.min(1,age/duration),travel=Math.min(1,age/travelDuration),progress=travel*travel*(3-2*travel),pos=route.getPointAt(progress),lift=Math.max(0,Math.min(1,(age-travelDuration)/(duration-travelDuration)));
   boat.position.copy(pos);boat.rotation.y=0;boat.updateMatrixWorld(true);cave.visible=lift<.125;
   const seat=boat.localToWorld(new T.Vector3(0,1.7,1.3)),look=new T.Vector3(-3.8,1.8,pos.z-18);
   look.lerp(new T.Vector3(0,2,3),T.MathUtils.smoothstep(travel,.81,1));
   if(lift===0){camera.position.copy(seat);camera.lookAt(look);}else{const e=lift*lift*(3-2*lift);camera.position.lerpVectors(landingSeat,orbitPosition('ferry'),e);camera.lookAt(look.lerp(mapTarget,e));}
   if(p>=1)finish();
  }else if(voyage){
   const p=Math.min(1,(now-voyage.started)/260);
   if(voyage.phase==='out'){blink.style.opacity=p;if(p===1){voyage.phase='dark';voyage.started=now;}}
   else if(voyage.phase==='dark'){blink.style.opacity=1;focusIsland(voyage.id,true);if(now-voyage.started>=120){voyage.phase='in';voyage.started=now;}}
   else{blink.style.opacity=1-p;if(p===1){voyage=null;blink.hidden=true;blink.style.opacity=0;syncIsland();}}
  }else{
   radiusScale+=(desiredScale-radiusScale)*.07;yaw+=(desiredYaw-yaw)*.06;
   mapTarget.copy(islandTarget(currentIsland));camera.position.copy(orbitPosition());camera.lookAt(mapTarget);
  }
  project('#ferry-marker',new T.Vector3(0,10,0));project('#home-marker',new T.Vector3(homeSite.x,ground(homeSite.x,homeSite.z)+8,homeSite.z));project('#shop-marker',new T.Vector3(stallSite.x,ground(stallSite.x,stallSite.z)+5,stallSite.z));project('#marsh-marker',new T.Vector3(islands.marsh.x,22,islands.marsh.z-8));for(const d of destinations)project('#'+d.id+'-marker',new T.Vector3(d.x,d.height+3,d.z));renderer.render(scene,camera);
 }
 const rect=canvas.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();arrangeVista();requestAnimationFrame(frame);
 let drag=null;canvas.addEventListener('pointerdown',e=>{if(arrival||voyage)return;drag={x:e.clientX,yaw:desiredYaw};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag)desiredYaw=drag.yaw-(e.clientX-drag.x)*.002;});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('wheel',e=>{if(screen==='map'&&!voyage){e.preventDefault();desiredScale=Math.max(.75,Math.min(1.5,desiredScale+e.deltaY*.0004));}},{passive:false});
 return {scene,camera,renderer,islands,islandOffsets,visitIsland,focusIsland,get currentIsland(){return currentIsland;},get travelling(){return !!voyage;},journey:{route,boat,ground,rocks:islandCliff,pier,islandPiers},riverRoutes,destinations,sendToMarsh(){crossing=0;},skip:finish,zoom(delta){desiredScale=Math.max(.75,Math.min(1.5,desiredScale+delta));},reset(){desiredScale=1;desiredYaw=0;},setScreen(value){screen=value;if(value!=='map'&&arrival)finish();const island={desk:'ferry',home:'home',shop:'home',marsh:'marsh'}[value];if(island)focusIsland(island);}};
};
