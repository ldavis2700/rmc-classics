/* Derive legal UI actions from the same candidate's offline rules, never inject game state. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../frontend/src/lib/tableRules.js'),'utf8').replace(/export /g,'');
const fixtures=[{seed:215,winner:0,round:8,scores:[539,221],bags:[9,1]},
 {seed:18,winner:1,round:8,scores:[261,517],bags:[1,7]}];
const label=c=>`${({11:'J',12:'Q',13:'K',14:'A'})[c.slice(1)]||c.slice(1)} of ${({C:'clubs',D:'diamonds',H:'hearts',S:'spades'})[c[0]]}`;
const sorted=cards=>[...cards].sort((a,b)=>'CDHS'.indexOf(a[0])-'CDHS'.indexOf(b[0])||Number(a.slice(1))-Number(b.slice(1))).map(label);
function plan(fixture){
 let seed=fixture.seed;const math=Object.create(Math);
 math.random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
 const context=vm.createContext({Math:math});
 vm.runInContext(source+';this.rules={newGame,applyAction,computerAction,legalActions};',context);
 const r=context.rules,rounds=[];let state=r.newGame('spades'),moves=0;
 while(state.phase!=='ended'){
  assert(state.round<=fixture.round,'Full-match plan exceeded its hand bound');
  const round={seed:fixture.seed+state.round-1,actions:[]};
  while(!['round_end','ended'].includes(state.phase)){
   assert(++moves<=448,'Full-match plan exceeded its move bound');
   const action=r.computerAction(state,state.turn);
   if(state.turn===0)round.actions.push({phase:state.phase,hand:sorted(state.hands[0]),
    legal:sorted(r.legalActions(state,0).filter(a=>a.card).map(a=>a.card)),action:JSON.parse(JSON.stringify(action))});
   state=r.applyAction(state,state.turn,action);
  }
  round.scores=[...state.scores];round.bags=[...state.bags];
  round.points=Array.from(state.last_round,r=>(r.delta>0?'+':'')+r.delta);rounds.push(round);
  if(state.phase==='round_end'){seed=fixture.seed+state.round;state=r.applyAction(state,0,{type:'next'});}
 }
 assert.equal(moves,448);assert.equal(state.winner,fixture.winner);assert.equal(state.round,fixture.round);
 assert.deepEqual([...state.scores],fixture.scores);assert.deepEqual([...state.bags],fixture.bags);
 assert(rounds.every(r=>r.actions.length===14));
 return {...fixture,rounds};
}
module.exports={plans:fixtures.map(plan),label};
if(require.main===module)console.log('PASS: two legal 448-move, eight-hand Spades plans; exact final winner, scores and bags');
