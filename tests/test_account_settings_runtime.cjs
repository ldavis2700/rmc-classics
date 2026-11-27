const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/pages/AccountSettings.jsx'),'utf8');
const start=source.indexOf('export default function AccountSettings() {'),end=source.indexOf('\n  return (',start);
assert(start>=0&&end>start);
// Execute actual callbacks with controlled hooks and deferred account transport.
function harness(){
 const slots=[],effects=[],requests=[],events=[];let cursor=0,ec=0,mounted=true,writes=0,confirm=true;
 const run=vm.runInNewContext('(function(){'+source.slice(start+'export default function AccountSettings() {'.length,end)+';return {onDelete,busy,setConfirmText,setCurrentPassword};})',{
 useAuth:()=>({user:{id:'fixture'},deleteAccount:password=>new Promise((resolve,reject)=>requests.push({password,resolve,reject}))}),
 useNavigate:()=> (...args)=>events.push(['navigate',...args]),
 toast:{success:msg=>events.push(['success',msg]),error:msg=>events.push(['error',msg])},
 window:{confirm:()=>confirm},
 useRef:v=>{const i=cursor++;return slots[i]||(slots[i]={current:v});},
 useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],next=>{if(!mounted)writes++;slots[i]=next;}];},
 useEffect:fn=>{const i=ec++;if(!effects[i])effects[i]={dispose:fn()};}
 });
 function render(){cursor=ec=0;return run();}
 let initial=render();initial.setConfirmText('DELETE');initial.setCurrentPassword('fixture-password');
 return{render,requests,events,get writes(){return writes;},cancel(){confirm=false;},unmount(){effects.forEach(e=>e.dispose?.());mounted=false;}};
}
test('duplicate calls before rerender send one deletion',async()=>{
 const h=harness(),action=h.render().onDelete,a=action(),b=action();assert.equal(h.requests.length,1);
 h.requests[0].resolve({ok:false,error:'incorrect password'});await Promise.all([a,b]);assert.equal(h.render().busy,false);
});
test('unexpected rejection clears busy and permits deliberate retry',async()=>{
 const h=harness(),p=h.render().onDelete();h.requests[0].reject(Error('private detail'));await p;
 assert.equal(h.render().busy,false);assert.equal(h.events.length,1);assert.equal(h.events[0][0],'error');assert.ok(!h.events[0][1].includes('private detail'));
 const retry=h.render().onDelete();assert.equal(h.requests.length,2);h.requests[1].resolve({ok:false});await retry;
});
for(const result of ['success','failure','reject'])test('late '+result+' after unmount has no UI effects',async()=>{
 const h=harness(),p=h.render().onDelete();h.unmount();
 if(result==='reject')h.requests[0].reject(Error('offline'));else h.requests[0].resolve({ok:result==='success',error:'fixture'});
 await p;assert.equal(h.writes,0);assert.deepEqual(h.events,[]);
});
test('cancel sends no deletion',async()=>{const h=harness();h.cancel();await h.render().onDelete();assert.equal(h.requests.length,0);assert.equal(h.render().busy,false);});
test('successful current deletion confirms once and navigates home',async()=>{
 const h=harness(),p=h.render().onDelete();assert.equal(h.requests[0].password,'fixture-password');h.requests[0].resolve({ok:true});await p;
 assert.deepEqual(h.events.map(e=>e[0]),['success','navigate']);assert.equal(h.events[1][1],'/');assert.equal(h.render().busy,false);
});
test('expected failure preserves page and reports error',async()=>{const h=harness(),p=h.render().onDelete();h.requests[0].resolve({ok:false,error:'Incorrect password'});await p;assert.deepEqual(h.events,[['error','Incorrect password']]);assert.equal(h.render().busy,false);});
