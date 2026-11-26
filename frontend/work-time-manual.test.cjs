const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
process.env.TZ = 'Europe/Rome';
const helpers = import('./src/components/work-time/manualTime.mjs');
const valid = { start_date:'2026-01-12',start_time:'09:00',end_date:'2026-01-12',end_time:'10:00',pause_minutes:'0',activity_id:'',billable:true,notes:'' };

test('manual without category produces UTC timestamps and optional null activity', async()=>{
 const {manualPayload}=await helpers;const r=manualPayload(valid,null,'j',new Date('2026-11-25T12:00:00Z'));
 assert.deepEqual(r.errors,{});assert.equal(r.payload.started_at,'2026-01-12T08:00:00.000Z');assert.equal(r.payload.ended_at,'2026-01-12T09:00:00.000Z');assert.equal(r.payload.activity_id,null);
 assert.equal(manualPayload({...valid,pause_minutes:'1,5'},null,'j').payload.pause_seconds,90);
});
test('Rome winter, daylight saving and unchanged correction preserve the exact instant',async()=>{
 const {localParts,manualPayload,parseLocal}=await helpers;
 assert.equal(localParts('2026-01-12T08:00:00Z').time,'09:00:00');assert.equal(localParts('2026-07-12T08:00:00Z').time,'10:00:00');
 assert.equal(parseLocal('2026-07-12','10:00').toISOString(),'2026-07-12T08:00:00.000Z');
 assert.equal(parseLocal('2026-03-29','02:30'),null);
 const editing={started_at:'2026-10-25T01:30:15.123Z',ended_at:'2026-10-25T02:30:15.123Z',revision:4};const a=localParts(editing.started_at),b=localParts(editing.ended_at);
 const r=manualPayload({...valid,start_date:a.date,start_time:a.time,end_date:b.date,end_time:b.time},editing,'j');
 assert.equal(r.payload.started_at,editing.started_at);assert.equal(r.payload.ended_at,editing.ended_at);assert.equal(r.payload.revision,4);
});
test('field validation covers empty dates, invalid DST times, future end, order and pauses',async()=>{
 const {manualPayload}=await helpers;
 for(const [change,key] of [[{start_date:''},'start_date'],[{start_time:''},'start_time'],[{end_time:'08:00'},'end_time'],[{pause_minutes:'60'},'pause_minutes'],[{pause_minutes:'bad'},'pause_minutes'],[{start_date:'2026-03-29',start_time:'02:30'},'start_time']])assert.ok(manualPayload({...valid,...change},null,'j').errors[key]);
 assert.ok(manualPayload(valid,null,'j',new Date('2026-01-11T00:00:00Z')).errors.end_time);
});
function nodes(node,predicate,out=[]){if(!node||typeof node!=='object')return out;if(predicate(node))out.push(node);for(const child of [node.props?.children].flat(Infinity))nodes(child,predicate,out);return out;}
async function card(mutate, sessions = []){
 const states=[],effects=[];let cursor=0,ec=0;const ctx={enabled:true,version:0,active:null,busy:false,error:'',mutate};const jsx=(type,props)=>({type,props});
 const modules={react:{useState(value){const i=cursor++;if(!(i in states))states[i]=value;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}];},useEffect(fn,deps){const i=ec++;if(!effects[i]||JSON.stringify(effects[i].deps)!==JSON.stringify(deps))effects[i]={fn,deps,pending:true};}},'react/jsx-runtime':{jsx,jsxs:jsx},'react-router-dom':{Link:'Link'},'@/App':{API:'/api',useAuth:()=>({user:{role:'owner',user_id:'u'}})},'./WorkTimeProvider':{useWorkTime:()=>ctx},'./manualTime.mjs':await helpers,'./timeMath.mjs':await import('./src/components/work-time/timeMath.mjs'),axios:{get:async url=>({data:url.endsWith('activities')?[]:{sessions,estimated_hours:null}})}};
 const scope={module:{exports:{}},require:n=>modules[n]||new Proxy({},{get:(_,k)=>k}),Date,setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(transformSync(fs.readFileSync(`${__dirname}/src/components/work-time/WorkTime.jsx`,'utf8'),{loader:'jsx',format:'cjs',jsx:'automatic'}).code,scope);
 return{ctx,render(){cursor=ec=0;return scope.module.exports.WorkTimeCard({jobId:'j'});},async poll(){const tree=this.render();for(const e of effects)if(e.pending){e.pending=false;e.fn();}for(let i=0;i<8;i++)await Promise.resolve();return tree;}};
}
const button=(c,label)=>nodes(c.render(),n=>n.props?.children===label&&typeof n.props?.onClick==='function')[0];
const form=c=>nodes(c.render(),n=>n.props?.['data-testid']==='manual-time-form')[0];
function fill(c,label,value){const l=nodes(c.render(),n=>n.type==='label'&&[n.props.children].flat().includes(label))[0];const input=nodes(l,n=>n.type==='Input')[0];input.props.onInput({currentTarget:{value}});}
test('manual submit reaches mutation without native validation; errors survive polling; success waits for server',async()=>{
 const calls=[];let confirm;const c=await card((...args)=>{calls.push(args);return new Promise(r=>confirm=r)});await c.poll();button(c,'Inserisci ore manualmente').props.onClick();
 assert.equal(form(c).props.noValidate,true);
 await form(c).props.onSubmit({preventDefault(){}});assert.equal(calls.length,0);
 assert.ok(nodes(c.render(),n=>n.props?.role==='alert').length);
 c.ctx.version++;await c.poll();assert.ok(nodes(c.render(),n=>n.props?.role==='alert').length);
 for(const [label,value]of[['Data di inizio','2026-01-12'],['Ora di inizio','09:00'],['Data di fine','2026-01-12'],['Ora di fine','10:00']])fill(c,label,value);
 const sent=form(c).props.onSubmit({preventDefault(){}});assert.equal(calls.length,1);assert.equal(calls[0][0],'post');assert.equal(calls[0][1],'/work-time/manual');assert.equal(calls[0][2].activity_id,null);
 assert.equal(nodes(c.render(),n=>n.props?.role==='status'&&n.props.children==='Ore salvate correttamente.').length,0);
 confirm(true);await sent;assert.equal(form(c),undefined);assert.equal(nodes(c.render(),n=>n.props?.role==='status'&&n.props.children==='Ore salvate correttamente.').length,1);
});
test('failed save retains values and error through refresh without displaying success',async()=>{
 const c=await card(async()=>false);await c.poll();button(c,'Inserisci ore manualmente').props.onClick();
 for(const [label,value]of[['Data di inizio','2026-01-12'],['Ora di inizio','09:00'],['Data di fine','2026-01-12'],['Ora di fine','10:00']])fill(c,label,value);
 await form(c).props.onSubmit({preventDefault(){}});c.ctx.error='Intervallo sovrapposto';c.ctx.version++;await c.poll();
 assert.ok(form(c));assert.ok(nodes(c.render(),n=>n.props?.role==='alert'&&n.props.children==='Intervallo sovrapposto').length);assert.equal(nodes(c.render(),n=>n.props?.role==='status'&&n.props.children==='Ore salvate correttamente.').length,0);
});

test('existing session correction submits PATCH with original timestamps and revision',async()=>{
 const calls=[];const row={session_id:'existing',user_id:'u',started_at:'2026-07-12T08:00:15.123Z',ended_at:'2026-07-12T09:00:15.123Z',status:'ended',is_open:false,accumulated_seconds:3600,effective_seconds:3600,revision:7,billable:true};
 const c=await card(async(...args)=>{calls.push(args);return true},[row]);await c.poll();button(c,'Correggi').props.onClick();
 await form(c).props.onSubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0][0],'patch');assert.equal(calls[0][1],'/work-time/sessions/existing');assert.equal(calls[0][2].revision,7);assert.equal(calls[0][2].started_at,row.started_at);assert.equal(calls[0][2].ended_at,row.ended_at);assert.equal(calls[0][2].activity_id,null);
});
