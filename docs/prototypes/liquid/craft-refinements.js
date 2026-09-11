// Keep the approved information architecture; refine continuity and touch response.
design.cues=false;
const craftAnimations=new Set(),craftDetails=new Map(),craftDetailAnimations=new WeakMap();
let craftPage=null,craftChartDay=94,craftKeyboard=false,craftGhost=null,craftSheetGesture=null;
const craftReduced=matchMedia('(prefers-reduced-motion: reduce)');
const craftMoves=()=>design.motion!=='quiet'&&!craftReduced.matches&&!craftKeyboard;
function craftAnimate(el,frames,options){
 if(!el||!craftMoves())return null;
 const a=el.animate(frames,options);craftAnimations.add(a);
 a.finished.then(()=>craftAnimations.delete(a),()=>craftAnimations.delete(a));return a;
}
root.addEventListener('keydown',()=>{craftKeyboard=true;root.dataset.input='keyboard'},true);
root.addEventListener('pointerdown',()=>{craftKeyboard=false;root.dataset.input='pointer'},true);
function craftStop(){for(const a of craftAnimations)a.cancel();craftAnimations.clear()}
craftReduced.addEventListener('change',()=>{if(craftReduced.matches)craftStop()});
const craftPreviousDesign=applyDesign;
applyDesign=function(){craftPreviousDesign();if(design.motion==='quiet')craftStop()};
function craftDetailKey(el){return el.dataset.craftDetail||null}
function craftCaptureDetails(){root.querySelectorAll('[data-craft-detail]').forEach(d=>{craftDetails.set(craftDetailKey(d),craftDetailAnimations.get(d)?.target??d.open)})}
function craftArrange(){
 const view=root.querySelector('.ns-active-view');
 if(state.tab==='north'&&state.north==='compound'&&view){
  const heading=view.querySelector('.ns-heading'),summary=view.querySelector('.ns-composite-summary'),tools=view.querySelector('.ns-chart-tools'),unit=tools.querySelector('.ns-unit-label'),modes=view.querySelector('.ns-modes'),chart=view.querySelector('[data-chart]');
  heading.after(summary);summary.after(tools);
  const secondary=document.createElement('div');secondary.className='craft-chart-controls';secondary.append(modes,unit);chart.after(secondary);
 }
 const tp=root.querySelector('.tp-nav');
 if(tp){const well=document.createElement('div');well.className='craft-tp-well';well.setAttribute('aria-hidden','true');well.style.transform=`translateX(${tpViews.indexOf(state.trainView)*100}%)`;tp.prepend(well)}
 root.querySelectorAll('.tp-phase').forEach((d,i)=>{d.dataset.craftDetail='program-phase-'+i;d.open=craftDetails.get(d.dataset.craftDetail)??false});
 root.querySelectorAll('[data-ns-target]').forEach(d=>{d.dataset.craftDetail='north-target-'+d.dataset.nsTarget;if(craftDetails.has(d.dataset.craftDetail))d.open=craftDetails.get(d.dataset.craftDetail)});
 const input=root.querySelector('[data-tp-five]');
 if(input){const control=document.createElement('span');control.className='craft-switch-control';input.before(control);control.append(input);const track=document.createElement('span');track.className='craft-switch-track';track.setAttribute('aria-hidden','true');control.append(track)}
}
const craftPreviousRender=render;
render=function(animate=true){
 craftCaptureDetails();
 const oldNorth=root.querySelector('.ns-nav-well'),oldTrain=root.querySelector('.craft-tp-well');
 const northTransform=oldNorth?getComputedStyle(oldNorth).transform:null,trainTransform=oldTrain?getComputedStyle(oldTrain).transform:null;
 const skyTimes=[...root.querySelectorAll('.ns-photo')].map(el=>el.getAnimations()[0]?.currentTime??0);
 const oldChart=root.querySelector('[data-chart=full]');if(oldChart&&nsCharts.has(oldChart))craftChartDay=nsCharts.get(oldChart).focus;
 const page=state.tab==='north'?'north/'+state.north:state.tab==='train'?'train/'+(state.session?'session':state.trainView):state.tab==='food'?'food/'+state.food:state.tab;
 const previousPage=craftPage;craftPage=page;
 craftPreviousRender(false);craftArrange();
 root.querySelectorAll('.ns-photo').forEach((el,i)=>{const a=el.getAnimations()[0];if(a&&skyTimes[i]!=null)a.currentTime=skyTimes[i]});
 const chart=root.querySelector('[data-chart=full]');if(chart){drawChart(chart);paintChartFocus(chart,craftChartDay,false)}
 for(const [selector,from] of [['.ns-nav-well',northTransform],['.craft-tp-well',trainTransform]]){const el=root.querySelector(selector);if(el&&from&&from!=='none')craftAnimate(el,[{transform:from},{transform:getComputedStyle(el).transform}],{duration:220,easing:'cubic-bezier(.32,.72,0,1)'})}
 if(previousPage&&previousPage!==page){const content=root.querySelector(state.tab==='north'?'.ns-active-view':'.h-stage>div');craftAnimate(content,[{opacity:.72,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:170,easing:'cubic-bezier(.22,1,.36,1)'})}
};
root.addEventListener('click',e=>{
 const summary=e.target.closest('summary');if(!summary)return;const d=summary.parentElement;if(!d.matches('[data-craft-detail]')||!craftMoves())return;
 e.preventDefault();const current=craftDetailAnimations.get(d),target=current?!current.target:!d.open,start=d.getBoundingClientRect().height;
 current?.animation.cancel();d.open=true;d.style.height='auto';const full=d.getBoundingClientRect().height,end=target?full:summary.getBoundingClientRect().height;
 d.style.overflow='hidden';const a=craftAnimate(d,[{height:start+'px'},{height:end+'px'}],{duration:210,easing:'cubic-bezier(.22,1,.36,1)'});
 if(!a){d.open=target;d.style.overflow='';return}const record={animation:a,target};craftDetailAnimations.set(d,record);craftDetails.set(craftDetailKey(d),target);
 const finish=()=>{if(craftDetailAnimations.get(d)!==record)return;d.open=target;d.style.height='';d.style.overflow='';craftDetailAnimations.delete(d)};a.finished.then(finish,finish);
},true);
root.addEventListener('toggle',e=>{const d=e.target;if(d.matches?.('[data-craft-detail]')&&!craftDetailAnimations.has(d))craftDetails.set(craftDetailKey(d),d.open)},true);
const craftPreviousOpen=openSheet,craftPreviousClose=closeSheet;
function craftRemoveGhost(){craftGhost?.remove();craftGhost=null}
openSheet=function(title,body){craftRemoveGhost();craftPreviousOpen(title,body)};
closeSheet=function(){
 const sheet=layer.querySelector('.h-sheet'),startTransform=sheet?getComputedStyle(sheet).transform:'none';const exitY=(startTransform==='none'?0:new DOMMatrixReadOnly(startTransform).m42)+80;let ghost=null;
 if(sheet&&!layer.hidden&&craftMoves()){
  craftRemoveGhost();ghost=layer.cloneNode(true);ghost.classList.add('craft-sheet-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));root.querySelector('.h-phone').append(ghost);craftGhost=ghost;
 }
 craftPreviousClose();
 if(ghost){const panel=ghost.querySelector('.h-sheet');panel.style.animation='none';craftAnimate(ghost,[{opacity:1},{opacity:0}],{duration:180,easing:'ease-out'});const a=craftAnimate(panel,[{transform:startTransform==='none'?'translateY(0)':startTransform},{transform:`translateY(${exitY}px)`}],{duration:180,easing:'cubic-bezier(.4,0,1,1)'});const cleanup=()=>{ghost.remove();if(craftGhost===ghost)craftGhost=null};if(a)a.finished.then(cleanup,cleanup);else cleanup()}
};
// Direct manipulation is limited to the handle, so sheet contents remain scrollable.
root.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('.h-sheet-handle');if(!handle||!layer.contains(handle)||e.button!==0)return;
 e.stopImmediatePropagation();if(craftSheetGesture)return;
 const panel=handle.closest('.h-sheet');panel.getAnimations().forEach(a=>a.cancel());craftSheetGesture={id:e.pointerId,handle,panel,start:e.clientY,last:e.clientY,lastTime:performance.now(),velocity:0,dy:0};handle.setPointerCapture(e.pointerId);
},true);
root.addEventListener('pointermove',e=>{
 const g=craftSheetGesture;if(!g||e.pointerId!==g.id)return;e.stopImmediatePropagation();const now=performance.now(),dt=now-g.lastTime;
 if(dt>0)g.velocity=(e.clientY-g.last)/dt;g.last=e.clientY;g.lastTime=now;g.dy=e.clientY-g.start;
 const travel=g.dy>=0?g.dy:g.dy*.14;g.panel.style.transform=`translateY(${travel}px)`;
},true);
function craftRelease(e,cancelled){
 const g=craftSheetGesture;if(!g||e.pointerId!==g.id)return;e.stopImmediatePropagation();craftSheetGesture=null;
 const moved=Math.abs(g.dy)>6;if(moved)suppressUntil=performance.now()+320;
 const releaseVelocity=performance.now()-g.lastTime<80?g.velocity:0;
 if(!cancelled&&(g.dy>65||(g.dy>24&&releaseVelocity>.65))){closeSheet();touchCue('Soft impact','Sheet closed');return}
 const from=g.panel.style.transform;g.panel.style.transform='';if(moved)craftAnimate(g.panel,[{transform:from},{transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(.32,.72,0,1)'});
}
root.addEventListener('pointerup',e=>craftRelease(e,false),true);
root.addEventListener('pointercancel',e=>craftRelease(e,true),true);
