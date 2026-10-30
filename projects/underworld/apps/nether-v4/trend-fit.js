/* Trend fitting is the documented presentation exception to server arithmetic.
   Moving averages are supplied by AQL. These fits never alter chart values. */
window.NetherTrendFit=(()=>{
 function fit(values,method,coordinates){
  const pairs=values.map((v,i)=>({x:coordinates?.[i]??i+1,y:v?.value??v})).filter(p=>p.y!==null&&Number.isFinite(Number(p.y))&&Number.isFinite(p.x)&&(!['logarithmic','power'].includes(method)||p.x>0)&&(!['exponential','power'].includes(method)||Number(p.y)>0));
  if(pairs.length<2)return values.map(()=>null);
  const transformX=x=>['logarithmic','power'].includes(method)?Math.log(x):x,transformY=y=>['exponential','power'].includes(method)?Math.log(Number(y)):Number(y),n=pairs.length,mx=pairs.reduce((v,p)=>v+transformX(p.x),0)/n,my=pairs.reduce((v,p)=>v+transformY(p.y),0)/n;
  let variance=0,covariance=0;for(const p of pairs){const dx=transformX(p.x)-mx;variance+=dx*dx;covariance+=dx*(transformY(p.y)-my);}if(!variance)return values.map(()=>null);const slope=covariance/variance,intercept=my-slope*mx;
  return values.map((v,i)=>{const raw=v?.value??v,x=coordinates?.[i]??i+1;if(raw===null||!Number.isFinite(Number(raw))||(['power','logarithmic'].includes(method)&&x<=0)||(['power','exponential'].includes(method)&&Number(raw)<=0))return null;const predicted=intercept+slope*transformX(x);return ['power','exponential'].includes(method)?Math.exp(predicted):predicted;});
 }
 return {fit};
})();
