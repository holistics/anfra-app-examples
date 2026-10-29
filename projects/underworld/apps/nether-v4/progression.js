/* Run-only access policy, shared by the chart, scene markers and screen doors. */
window.NetherProgress=(()=>{
 const state={ferryComplete:false,devCourt:false};
 function change(key,value){value=!!value;if(state[key]===value)return;state[key]=value;dispatchEvent(new CustomEvent('nether:progress'));}
 return {state,canVisit:id=>id!=='marsh'||state.ferryComplete||state.devCourt,
  completeFerry:value=>change('ferryComplete',value),setDevCourt:value=>change('devCourt',value)};
})();
