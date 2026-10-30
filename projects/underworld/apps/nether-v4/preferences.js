/* Preferences shared across reloads in the storage-free app frame. */
window.NetherPreferences=(()=>{
 const keyOf=key=>'nether-'+key+'=';
 function get(key,fallback){
  const prefix=keyOf(key),entry=(window.name||'').split(';').find(part=>part.startsWith(prefix));
  return entry?entry.slice(prefix.length):fallback;
 }
 function set(key,value){
  const prefix=keyOf(key),entries=(window.name||'').split(';').filter(part=>part&&!part.startsWith(prefix));
  entries.push(prefix+value);window.name=entries.join(';');
 }
 return {get,set};
})();
