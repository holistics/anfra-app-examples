/* A stone tribunal on its own island. Scenery only: the game owns judgement. */
window.createJudgementCourt=function(T,{scene,x,z,mesh,box,mat,rockBump,glowTexture}){
 const court=new T.Group();court.name='court-of-judgement';court.position.set(x,0,z);scene.add(court);
 const wall=mat('#3e505b',{bumpMap:rockBump,bumpScale:.25}),trim=mat('#7b8584'),marble=mat('#9ca9ae',{roughness:.8}),black=mat('#152632'),fire=mat('#ffba68',{emissive:'#eb6d21',emissiveIntensity:2});
 // Broken crags carry a broad ceremonial terrace, with a stair to the landing.
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=17+(i%3);const rock=mesh(new T.IcosahedronGeometry(1,1),wall,court,Math.cos(a)*r,-1.8,Math.sin(a)*r*.73);rock.scale.set(4.5,3.6+i%3,4);rock.rotation.y=a;}
 mesh(new T.CylinderGeometry(18,20,4,48),wall,court,0,1.8,0);
 mesh(new T.CylinderGeometry(18.3,18.3,.4,64),trim,court,0,4,0);
 const tile=document.createElement('canvas');tile.width=tile.height=512;const c=tile.getContext('2d');c.fillStyle='#596e78';c.fillRect(0,0,512,512);c.strokeStyle='#2c414c';c.lineWidth=2;
 for(let y=0;y<512;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();for(let x=(y/64%2)*32;x<512;x+=64){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+64);c.stroke();}}
 c.strokeStyle='#9f9c81';c.lineWidth=3;for(const r of [175,184,231,239]){c.beginPath();c.arc(256,256,r,0,Math.PI*2);c.stroke();}const texture=new T.CanvasTexture(tile);texture.colorSpace=T.SRGBColorSpace;
 const floor=mesh(new T.CircleGeometry(17.8,64),mat('#bec8c8',{map:texture}),court,0,4.23,0);floor.rotation.x=-Math.PI/2;
 for(let i=0;i<9;i++)box(court,8,.45,1.35,0,4.05-i*.43,15+i*1.15,trim);
 // A Greek pediment and fortress towers frame the open tribunal.
 box(court,29,10,3,0,9,-12,wall);box(court,30,.8,7,0,14.4,-10,trim);
 const gable=new T.Shape();gable.moveTo(-15,0);gable.lineTo(15,0);gable.lineTo(0,4.5);gable.closePath();mesh(new T.ExtrudeGeometry(gable,{depth:7,bevelEnabled:false}),trim,court,0,14.8,-13.5);
 const inset=new T.Shape();inset.moveTo(-11,0);inset.lineTo(11,0);inset.lineTo(0,3.2);inset.closePath();mesh(new T.ShapeGeometry(inset),wall,court,0,15.4,-6.45);
 for(const px of [-13,-4.4,4.4,13]){mesh(new T.CylinderGeometry(.57,.72,9.4,16),marble,court,px,9,-7);for(let j=0;j<12;j++){const a=j/12*Math.PI*2;mesh(new T.CylinderGeometry(.07,.07,8.6,5),trim,court,px+Math.sin(a)*.57,9,-7+Math.cos(a)*.57);}box(court,1.8,.45,1.8,px,4.55,-7,trim);box(court,1.8,.5,1.8,px,13.7,-7,trim);}
 for(const side of [-1,1]){const px=side*16.4;box(court,4.4,14,6,px,10.1,-10,wall);box(court,5,.6,6.5,px,17.2,-10,trim);for(let j=0;j<3;j++)box(court,1,1.3,1.3,px+(j-1)*1.8,18.1,-7.5,trim);box(court,.8,3,.15,px,12,-6.9,black);
  const crag=mesh(new T.ConeGeometry(4,24,5),wall,court,side*21,9,-16);crag.rotation.z=side*.13;crag.rotation.y=side;
 }
 // Three empty stone thrones face the landing; the judges remain unseen.
 const chairs=new T.Group();chairs.name='court-chairs';court.add(chairs);
 const bronze=mat('#a48e61',{metalness:.3,roughness:.65});
 for(const [i,px] of [-8,0,8].entries()){
  const chair=new T.Group();chair.name='court-chair-'+(i+1);chair.position.set(px,4.25,-4);chairs.add(chair);
  const height=i===1?5.4:4.7;
  box(chair,4.2,.45,3.8,0,.225,0,trim);
  box(chair,3.4,1.1,2.9,0,1,0,wall);
  box(chair,3.8,.5,3.2,0,1.75,0,marble);
  box(chair,3.8,height,.65,0,height/2+.45,-1.35,marble);
  box(chair,2.65,height-1.2,.12,0,height/2+.5,-.96,black);
  box(chair,4.1,.35,.9,0,height+.55,-1.35,bronze);
  for(const side of [-1,1]){
   box(chair,.55,1.65,2.65,side*1.65,1.65,.15,trim);
   box(chair,.7,.25,2.9,side*1.65,2.6,.15,marble);
   box(chair,.15,height-.55,.15,side*1.55,height/2+.45,-.96,bronze);
  }
  const seal=mesh(new T.CylinderGeometry(.43,.43,.12,8),bronze,chair,0,height-.35,-.84);seal.rotation.x=Math.PI/2;
 }
 // Small souls make the scale of the monumental architecture legible.
 const souls=new T.Group();souls.name='court-souls';court.add(souls);const spectral=new T.MeshBasicMaterial({color:'#b3e5e2',transparent:true,opacity:.68});
 for(const [px,pz] of [[0,10],[-5,7],[6,6]]){mesh(new T.ConeGeometry(.32,1.6,10),spectral,souls,px,5.1,pz);mesh(new T.SphereGeometry(.2,10,8),spectral,souls,px,6,pz);const glow=new T.Sprite(new T.SpriteMaterial({map:glowTexture,color:0x7ad7e5,transparent:true,opacity:.25,depthWrite:false,blending:T.AdditiveBlending}));glow.position.set(px,4.5,pz);glow.scale.set(3,1.2,1);souls.add(glow);}
 for(const px of [-11,11]){mesh(new T.CylinderGeometry(.4,.6,2.6,8),wall,court,px,5.6,10);mesh(new T.ConeGeometry(.45,1.2,7),fire,court,px,7.4,10);const light=new T.PointLight(0xffa250,24,22,1.5);light.position.set(px,8,9);court.add(light);}
 const judgementLight=new T.PointLight(0xb7dce9,90,38,1.4);judgementLight.position.set(0,13,12);court.add(judgementLight);
 return court;
};
