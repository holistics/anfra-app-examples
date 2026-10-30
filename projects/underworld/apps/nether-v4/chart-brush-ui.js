/* Pointer gestures for the SVG charts. The shared filter compiler owns the data condition. */
window.NetherChartBrush=(()=>{
 let active=null,suppressClick=false;
 function point(svg,event){const matrix=svg.getScreenCTM();if(!matrix)return null;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(matrix.inverse());}
 function index(meta,p){const offset=meta.horizontal?p.y-meta.top:p.x-meta.left,extent=meta.horizontal?meta.height:meta.width;return Math.max(0,Math.min(meta.values.length-1,Math.floor(offset/extent*meta.values.length)));}
 function paint(d){const {meta,first,last,band}=d,lo=Math.min(first,last),hi=Math.max(first,last)+1,step=(meta.horizontal?meta.height:meta.width)/meta.values.length;band.setAttribute('x',meta.left+(meta.horizontal?0:lo*step));band.setAttribute('y',meta.top+(meta.horizontal?lo*step:0));band.setAttribute('width',meta.horizontal?meta.width:(hi-lo)*step);band.setAttribute('height',meta.horizontal?(hi-lo)*step:meta.height);}
 function finish(event){
  const d=active;if(!d||event.pointerId!==d.pointer)return;active=null;document.body.classList.remove('chart-brushing');d.band?.remove();if(d.svg.hasPointerCapture(d.pointer))d.svg.releasePointerCapture(d.pointer);if(!d.moved)return;
  suppressClick=true;setTimeout(()=>suppressClick=false,0);
  if(event.type!=='pointerup'||!d.isCurrent()||!d.svg.isConnected)return;
  const p=point(d.svg,event);if(!p||p.x<d.meta.left||p.x>d.meta.left+d.meta.width||p.y<d.meta.top||p.y>d.meta.top+d.meta.height)return;
  try{
   const next=NetherInteractions.brush.selection({...d.meta,first:d.first,last:d.last,format:(v,g)=>/date/.test(d.meta.type)?d.bc(v,g||d.meta.grain):d.fmt(v)});
   const fields=d.fields();NetherFilterAql.compile({combinator:'and',children:[next.tree]},new Map([...fields.dimensions,...fields.measures].map(f=>[f.field,f])));
   d.a.brush=next;d.a.menu=null;d.render(d.s);
  }catch(error){let message=d.svg.parentElement.querySelector('.wb-brush-error');if(!message){message=document.createElement('p');message.className='wb-brush-error';message.setAttribute('role','alert');d.svg.after(message);}message.textContent=error.message;}
 }
 function attach({root,s,a,render,fields,fmt,bc,isCurrent}){
  if(active&&root.contains(active.svg))finish({type:'pointercancel',pointerId:active.pointer});
  if(a.brush){
   const controls=document.createElement('div');controls.className='wb-brush-controls';controls.setAttribute('role','status');
   const clear=document.createElement('button');clear.type='button';clear.className='wb-brush-chip';clear.dataset.wb='clear-brush';clear.setAttribute('aria-label','Clear brush: '+a.brush.chip);clear.append(document.createTextNode(a.brush.chip));
   const cross=document.createElement('span');cross.setAttribute('aria-hidden','true');cross.textContent='×';clear.append(cross);controls.append(clear);root.prepend(controls);
   const title=root.querySelector('.wb-chart-heading h2');if(title){const period=document.createElement('span');period.className='wb-brush-period';period.textContent=a.brush.title;title.append(period);}
  }
  const svg=root.querySelector('.wb-plot[data-chart-brush]');if(!svg)return;
  const meta=JSON.parse(svg.dataset.chartBrush);
  svg.addEventListener('pointerdown',event=>{
   if(event.button!==0||event.isPrimary===false||document.body.classList.contains('magnifier-mode'))return;
   const p=point(svg,event);if(!p||!meta.values.length||p.x<meta.left||p.x>meta.left+meta.width||p.y<meta.top||p.y>meta.top+meta.height)return;
   event.preventDefault();svg.setPointerCapture(event.pointerId);const first=index(meta,p);active={root,s,a,render,fields,fmt,bc,isCurrent,svg,meta,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,first,last:first,moved:false};
  });
 }
 document.addEventListener('pointermove',event=>{
  const d=active;if(!d||event.pointerId!==d.pointer)return;event.preventDefault();if(!d.svg.isConnected){finish(event);return;}
  if(!d.moved&&Math.hypot(event.clientX-d.startX,event.clientY-d.startY)<5)return;
  if(!d.moved){d.moved=true;document.body.classList.add('chart-brushing');window.getSelection()?.removeAllRanges();d.band=document.createElementNS('http://www.w3.org/2000/svg','rect');d.band.setAttribute('class','wb-brush-band');d.band.setAttribute('aria-hidden','true');d.svg.append(d.band);}
  const p=point(d.svg,event);if(p){d.last=index(d.meta,p);paint(d);}
 });
 document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);document.addEventListener('lostpointercapture',finish);
 document.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){finish({type:'pointercancel',pointerId:active.pointer});event.preventDefault();}});
 return {attach};
})();
