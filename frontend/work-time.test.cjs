const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

const math = import('./src/components/work-time/timeMath.mjs');
test('clock renders timestamp deltas, never counts paused time and supports multiple days', async () => {
  const { elapsed, formatDuration } = await math;
  assert.equal(elapsed({ status:'running', effective_seconds:60, sampledAt:1000 }, 121000), 180);
  assert.equal(elapsed({ status:'paused', effective_seconds:60, sampledAt:1000 }, 9000000), 60);
  assert.equal(formatDuration(90061), '25:01:01');
});
test('no estimate means no misleading progress; semaphore thresholds', async () => {
  const { progress } = await math;
  assert.equal(progress(100, null), null); assert.equal(progress(100, 0), null);
  assert.equal(progress(2000, 1).color, 'bg-success'); assert.equal(progress(2880, 1).color, 'bg-warning');
  assert.equal(progress(3600, 1).color, 'bg-warning'); assert.equal(progress(3601, 1).color, 'bg-destructive');
});

function provider(storage, responder) {
  const states = [], refs = [], effects = [], requests = [], events = {}, navigations = [];
  let cursor = 0, r = 0, effect = 0;
  const jsx = (type, props) => ({ type, props });
  const axios = async config => { requests.push(config); return responder(config); };
  axios.get = async url => { requests.push({ url, method:'get' }); return responder({ url, method:'get' }); };
  const user = { company_id:'a', user_id:'u', role:'owner' };
  const modules = {
    react: {
      createContext: () => ({ Provider:'provider' }), useContext: () => ({}), useCallback: fn => fn,
      useState(value) { const i=cursor++; if (!(i in states)) states[i]=value; return [states[i], next => { states[i]=typeof next==='function' ? next(states[i]):next; }]; },
      useRef(value) { return refs[r++] ||= { current:value }; },
      useEffect(fn, deps) { const i=effect++; if (!effects[i] || JSON.stringify(effects[i].deps)!==JSON.stringify(deps.map(v=>typeof v==='function'?'fn':v))) effects[i]={fn,deps:deps.map(v=>typeof v==='function'?'fn':v),pending:true}; },
    },
    'react/jsx-runtime': { jsx, jsxs:jsx, Fragment:'fragment' },
    'react-router-dom': { useNavigate:()=>path=>navigations.push(path) },
    '@/App': { API:'/api', useAuth:()=>({user}) }, axios,
  };
  const context={ module:{exports:{}}, require:name=>modules[name]||new Proxy({},{get:(_,key)=>key}),
    Date, crypto:require('node:crypto').webcrypto, localStorage:{ getItem:k=>storage.get(k), setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) },
    document:{visibilityState:'visible', addEventListener:(n,f)=>{events[n]=f;},removeEventListener(){}},
    window:{addEventListener:(n,f)=>{events[n]=f;},removeEventListener(){}}, setTimeout:()=>1, clearTimeout(){} };
  const source=fs.readFileSync(`${__dirname}/src/components/work-time/WorkTimeProvider.jsx`,'utf8');
  vm.runInNewContext(transformSync(source,{loader:'jsx',format:'cjs',jsx:'automatic'}).code,context);
  return { requests, events, render(){ cursor=r=effect=0; return context.module.exports.WorkTimeProvider({children:null}); },
    mount(){ const tree=this.render(); for(const entry of effects) if(entry.pending){entry.pending=false;entry.cleanup=entry.fn();} return tree; },
    unmount(){ for(const entry of effects) entry.cleanup?.(); } };
}
const flush=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};
function find(node, predicate){if(!node||typeof node!=='object')return; if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}}

test('unconfirmed writes stay pending across PWA reopening and retry with same operation id',async()=>{
  const storage=new Map(); let saved=null, fail=true;
  const respond=async config=>{
    if(config.method==='get')return {data:{enabled:true,session:saved}};
    saved={session_id:'s',job_id:'j',status:'running',revision:0,effective_seconds:10};
    if(fail)throw new Error('response lost after server commit');
    return {data:{session_id:'s'}};
  };
  const first=provider(storage,respond); first.mount(); await flush();
  const context=first.render().props.value;
  assert.equal(await context.mutate('post','/work-time/start',{job_id:'j'}),false);
  assert.equal(storage.size,1); const original=JSON.parse([...storage.values()][0]);
  assert.ok(original.data.operation_id); assert.equal(first.render().props.value.busy,true);
  first.unmount(); fail=false;
  const second=provider(storage,respond); second.mount(); await flush();
  assert.equal(second.render().props.value.active.session_id,'s');
  const button=find(second.render(),n=>n.props?.children==='Riprova operazione');
  await button.props.onClick(); await flush();
  assert.equal(storage.size,0);
  const retry=second.requests.find(r=>r.method==='post'); assert.equal(retry.data.operation_id,original.data.operation_id);
  assert.equal(second.render().props.value.busy,false);
  second.unmount();
});
test('rapid double action sends one write and waits for server acknowledgement',async()=>{
  const storage=new Map(); let finish;
  const p=provider(storage,async config=>config.method==='get'?{data:{enabled:true,session:null}}:new Promise(resolve=>{finish=resolve;}));
  p.mount(); await flush(); const ctx=p.render().props.value;
  const request=ctx.mutate('post','/work-time/start',{job_id:'j'});
  assert.equal(await ctx.mutate('post','/work-time/start',{job_id:'j'}),false);
  assert.equal(p.requests.filter(r=>r.method==='post').length,1); assert.equal(p.render().props.value.active,null);
  finish({data:{session_id:'s'}}); assert.equal(await request,true); p.unmount();
});

test('start dialog focuses its title without opening or submitting the optional category', async () => {
  const p = provider(new Map(), async ({url}) => ({data: url.endsWith('/activities') ? [] : {enabled:true,session:null}}));
  p.mount(); await flush();
  await p.render().props.value.requestStart('j');
  const tree = p.render();
  const dialog = find(tree, n => n.type === 'DialogContent');
  const title = find(tree, n => n.type === 'DialogTitle');
  let prevented = false, focused = false;
  title.props.ref.current = {focus(options) { focused = options.preventScroll; }};
  dialog.props.onOpenAutoFocus({preventDefault() { prevented = true; }});
  assert.equal(prevented, true); assert.equal(focused, true);
  assert.equal(title.props.tabIndex, -1);
  assert.equal(p.requests.some(r => r.method !== 'get'), false);
  assert.equal(find(tree, n => n.type === 'select').props.value, '');
});
