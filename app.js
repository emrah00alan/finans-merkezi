const DB_NAME="FinansMerkeziIOS", DB_VERSION=8;
const STORES=["obligations","moves","goals","stocks","recurring","assets","installments","cards","goldNotes"];
let db;
let state={obligations:[],moves:[],goals:[],stocks:[],recurring:[],assets:[],installments:[],cards:[],goldNotes:[]};
let selectedMonth=new Date().toISOString().slice(0,7);
let gold={};
let busy=false;
let moveFilter="all", debtFilter="all", savingsTab="gold";
let amountsHidden=localStorage.getItem("finansAmountsHidden")==="1" || localStorage.getItem("finansHideDefault")==="1";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:2}).format(Number(n)||0);
const num=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0; let s=String(v??"").trim().replace(/\s/g,""); if(!s)return 0; if(s.includes(","))s=s.replace(/\./g,"").replace(",","."); else if((s.match(/\./g)||[]).length>1)s=s.replace(/\./g,""); const n=Number(s); return Number.isFinite(n)?n:0};
const todayISO=()=>new Date().toISOString().slice(0,10);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateTR=d=>d?new Date(d+"T12:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-";
const monthLabel=m=>{const [y,mo]=m.split("-");return new Date(+y,+mo-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})};
const monthDate=(m,day)=>`${m}-${String(Math.min(28,Math.max(1,Number(day)||1))).padStart(2,"0")}`;

function openDB(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open(DB_NAME,DB_VERSION);
 r.onupgradeneeded=e=>{
  const d=r.result,tx=e.target.transaction,old=e.oldVersion;
  STORES.forEach(s=>{if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:"id",autoIncrement:true})});
  if(old<6){
   if(d.objectStoreNames.contains("payments")&&d.objectStoreNames.contains("obligations")){
    const q=tx.objectStore("payments").getAll(); q.onsuccess=()=>q.result.forEach(x=>tx.objectStore("obligations").add({name:x.name,amount:num(x.amount),date:x.date||todayISO(),paid:!!x.paid,category:x.category||"Ödeme",createdAt:x.createdAt||new Date().toISOString()}));
   }
   if(d.objectStoreNames.contains("debts")&&d.objectStoreNames.contains("obligations")){
    const q=tx.objectStore("debts").getAll(); q.onsuccess=()=>q.result.forEach(x=>tx.objectStore("obligations").add({name:x.name,amount:num(x.remaining||x.amount),date:x.date||todayISO(),paid:false,category:"Borç",note:x.note||"",createdAt:x.createdAt||new Date().toISOString()}));
   }
  }
 };
 r.onsuccess=()=>{db=r.result;db.onversionchange=()=>db.close();resolve()};
 r.onerror=()=>reject(r.error||new Error("Veritabanı açılamadı"));
})}
function all(store){return new Promise((resolve,reject)=>{try{const tx=db.transaction(store,"readonly"),q=tx.objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)}catch(e){reject(e)}})}
function add(store,obj){return new Promise((resolve,reject)=>{try{const tx=db.transaction(store,"readwrite"),st=tx.objectStore(store),q=st.add({...obj,createdAt:obj.createdAt||new Date().toISOString()});q.onerror=()=>reject(q.error||new Error("Kayıt isteği başarısız"));tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error||new Error("Veritabanı hatası"));tx.onabort=()=>reject(tx.error||new Error("Kayıt iptal edildi"))}catch(e){reject(e)}})}
function put(store,obj){return new Promise((resolve,reject)=>{try{const tx=db.transaction(store,"readwrite"),q=tx.objectStore(store).put(obj);q.onerror=()=>reject(q.error);tx.oncomplete=()=>resolve(obj.id);tx.onerror=()=>reject(tx.error||new Error("Veritabanı hatası"));tx.onabort=()=>reject(tx.error||new Error("İşlem iptal edildi"))}catch(e){reject(e)}})}
function del(store,id){return new Promise((resolve,reject)=>{try{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)}catch(e){reject(e)}})}

async function loadState(){for(const s of STORES)state[s]=await all(s)}
function loadGold(){try{gold=JSON.parse(localStorage.getItem("finansGoldRates")||"{}")}catch{gold={}}}
function saveGold(){localStorage.setItem("finansGoldRates",JSON.stringify(gold))}
function monthList(){const set=new Set(); const base=new Date(); for(let i=-3;i<15;i++){const d=new Date(base.getFullYear(),base.getMonth()+i,1);set.add(d.toISOString().slice(0,7))} ["moves","obligations"].forEach(s=>(state[s]||[]).forEach(x=>x.date&&set.add(x.date.slice(0,7)))); set.add(selectedMonth); return [...set].sort()}
function buildMonthMenus(){const html=monthList().map(m=>`<option value="${m}">${monthLabel(m)}</option>`).join(""); $$(".monthSelect").forEach(el=>{el.innerHTML=html;el.value=selectedMonth})}
function changeMonth(delta){const [y,m]=selectedMonth.split("-").map(Number),d=new Date(y,m-1+delta,1);selectedMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;buildMonthMenus();render()}

function monthMoves(m){return state.moves.filter(x=>x.date?.startsWith(m))}
function monthObligations(m){return state.obligations.filter(x=>x.date?.startsWith(m))}
function calcMonth(m){const moves=monthMoves(m),obs=monthObligations(m);const income=moves.filter(x=>x.type==="income").reduce((a,x)=>a+num(x.amount),0);const expense=moves.filter(x=>x.type==="expense").reduce((a,x)=>a+num(x.amount),0);const due=obs.filter(x=>!x.paid).reduce((a,x)=>a+num(x.amount),0);const paidExpense=obs.filter(x=>x.paid).reduce((a,x)=>a+num(x.amount),0);return {income,expense,due,paidExpense,balance:income-expense}}

async function syncPaidObligationExpenses(){
 const obs=await all("obligations");
 for(const o of obs){
  const linked=state.moves.find(m=>m.obligationId===o.id);
  if(o.paid){
   if(!linked){
    const id=await add("moves",{name:o.name,amount:num(o.amount),date:o.date||todayISO(),type:"expense",category:o.category||"Borç/Ödeme",obligationId:o.id,fromObligation:true});
    state.moves.push({id,name:o.name,amount:num(o.amount),date:o.date||todayISO(),type:"expense",category:o.category||"Borç/Ödeme",obligationId:o.id,fromObligation:true,createdAt:new Date().toISOString()});
   }
  }else if(linked){
   await del("moves",linked.id);
   state.moves=state.moves.filter(m=>m.id!==linked.id);
  }
 }
}

async function syncRecurring(){
 const rules=state.recurring.filter(r=>r.active!==false);
 const months=[]; const now=new Date();
 for(let i=1;i<=6;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1);months.push(d.toISOString().slice(0,7))}
 if(!months.includes(selectedMonth))months.push(selectedMonth);
 for(const r of rules){
  for(const m of months){
   if(r.startMonth&&m<r.startMonth)continue; if(r.endMonth&&m>r.endMonth)continue;
   const date=monthDate(m,r.day); const exists=r.kind==="move"?state.moves.some(x=>(x.recurringId===r.id || (!x.recurringId && x.name===r.name && x.date===date))&&x.date===date):state.obligations.some(x=>(x.recurringId===r.id || (!x.recurringId && x.name===r.name && x.date===date))&&x.date===date);
   if(exists)continue;
   if(r.kind==="move") { const id=await add("moves",{name:r.name,amount:num(r.amount),date,type:r.type,recurringId:r.id,category:r.category||"Aylık"}); state.moves.push({id,name:r.name,amount:num(r.amount),date,type:r.type,recurringId:r.id,category:r.category||"Aylık"}) }
   else { const id=await add("obligations",{name:r.name,amount:num(r.amount),date,paid:false,category:r.category||"Borç/Ödeme",recurringId:r.id}); state.obligations.push({id,name:r.name,amount:num(r.amount),date,paid:false,category:r.category||"Borç/Ödeme",recurringId:r.id}) }
  }
 }
}

async function refresh(){loadGold();await loadState();await syncRecurring();await syncPaidObligationExpenses();buildMonthMenus();render();if(navigator.onLine&&(!gold.updatedAt||Date.now()-new Date(gold.updatedAt).getTime()>10*60*1000))updateGold(true)}

function assetWealthTotal(){return goldValue()+stockValue()+assetValue()}
function wealthSnapshotKey(month){return `finansWealthSnapshot_${month}`}
function updateWealthSnapshot(){const nowMonth=new Date().toISOString().slice(0,7),current=assetWealthTotal(),key=wealthSnapshotKey(nowMonth);if(localStorage.getItem(key)===null)localStorage.setItem(key,String(current));const [y,m]=nowMonth.split('-').map(Number),pd=new Date(y,m-2,1),prevMonth=`${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,'0')}`,prevValue=localStorage.getItem(wealthSnapshotKey(prevMonth)),valueEl=$("#wealthChangeValue"),textEl=$("#wealthChangeText");if(!valueEl||!textEl)return;if(prevValue!==null){const diff=current-num(prevValue);valueEl.textContent=`${diff>=0?'+':'−'}${money(Math.abs(diff))}`;valueEl.className=diff>0?'incomeText':diff<0?'expenseText':'neutral';textEl.textContent=`Önceki ay sonuna göre · Toplam ${money(current)}`}else{valueEl.textContent=money(current);valueEl.className='neutral';textEl.textContent=`İlk karşılaştırma kaydı · ${monthLabel(nowMonth)}`}}
function renderMonthlySummary(c){const set=(id,val)=>{const e=$(id);if(e)e.textContent=val};set('#monthlySummaryIncome',money(c.income));set('#monthlySummaryExpense',money(c.expense));set('#monthlySummaryBalance',money(c.balance));const b=$('#summaryNetBadge');if(b){b.textContent=c.balance>=0?'Pozitif':'Eksi';b.className=c.balance>=0?'positive':'negative'}}
function renderCategorySummary(m){const el=$('#categorySummaryList');if(!el)return;const groups={};monthMoves(m).filter(x=>x.type==='expense').forEach(x=>{const k=(x.category||x.name||'Diğer').trim()||'Diğer';groups[k]=(groups[k]||0)+num(x.amount)});const rows=Object.entries(groups).sort((a,b)=>b[1]-a[1]),total=rows.reduce((a,[,v])=>a+v,0),lab=$('#categoryTotalLabel');if(lab)lab.textContent=money(total);if(!rows.length){el.innerHTML='<div class="category-empty">Bu ay gider kaydı yok.</div>';return}const top=rows.slice(0,5),max=top[0][1]||1;el.innerHTML=top.map(([name,val])=>`<div class="category-row"><div class="category-row-top"><span>${categoryIcon(name)}<b>${esc(name)}</b></span><strong>${money(val)}</strong></div><div class="category-track"><i style="width:${Math.max(5,val/max*100)}%"></i></div></div>`).join('')}
function renderCalendarMonthSummary(){const m=`${calendarCursor.getFullYear()}-${pad2(calendarCursor.getMonth()+1)}`,c=calcMonth(m),set=(id,v)=>{const e=$(id);if(e)e.textContent=money(v)};set('#calendarMonthIncome',c.income);set('#calendarMonthExpense',c.expense);set('#calendarMonthNet',c.balance);set('#calendarMonthPending',c.due)}

function renderReport(){
 const c=calcMonth(selectedMonth),set=(id,v)=>{const e=$(id);if(e)e.textContent=v};
 set('#reportIncome',money(c.income));set('#reportExpense',money(c.expense));set('#reportNet',money(c.balance));set('#reportPaid',money(c.paidExpense));set('#reportPending',money(c.due));set('#reportWealth',money(assetWealthTotal()));
 const obs=monthObligations(selectedMonth),pending=obs.filter(x=>!x.paid).length,paid=obs.filter(x=>x.paid).length;
 const pb=$('#reportPaid');if(pb)pb.parentElement.dataset.count=paid; const qb=$('#reportPending');if(qb)qb.parentElement.dataset.count=pending;
 const base=Array.from({length:6},(_,i)=>{const d=new Date(+selectedMonth.slice(0,4),+selectedMonth.slice(5)-1-(5-i),1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`});
 const vals=base.map(m=>{const ms=monthMoves(m);return {m,income:ms.filter(x=>x.type==='income').reduce((a,x)=>a+num(x.amount),0),expense:ms.filter(x=>x.type==='expense').reduce((a,x)=>a+num(x.amount),0)}});
 const chart=$('#reportChart');if(chart){const max=Math.max(1,...vals.flatMap(v=>[v.income,v.expense]));chart.innerHTML=vals.map(v=>{const lab=new Date(+v.m.slice(0,4),+v.m.slice(5)-1,1).toLocaleDateString('tr-TR',{month:'short'}).replace('.','');return `<div class="bar-group"><div class="bar income" style="height:${Math.max(3,v.income/max*86)}%" title="${money(v.income)}"></div><div class="bar expense" style="height:${Math.max(3,v.expense/max*86)}%" title="${money(v.expense)}"></div><span class="bar-label">${lab}</span></div>`}).join('')}
 const si=vals.reduce((a,v)=>a+v.income,0),se=vals.reduce((a,v)=>a+v.expense,0),ss=$('#reportSixSummary');if(ss)ss.innerHTML=`<span><b>${money(si)}</b><small>6 aylık gelir</small></span><span><b>${money(se)}</b><small>6 aylık gider</small></span><span><b>${money(si-se)}</b><small>6 aylık net</small></span>`;
 const groups={};monthMoves(selectedMonth).filter(x=>x.type==='expense').forEach(x=>{const k=(x.category||x.name||'Diğer').trim()||'Diğer';groups[k]=(groups[k]||0)+num(x.amount)});const cats=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,5),ce=$('#reportCategories');if(ce)ce.innerHTML=cats.length?cats.map(([n,v])=>`<div class="report-cat"><span>${categoryIcon(n)}<b>${esc(n)}</b></span><strong>${money(v)}</strong></div>`).join(''):'<div class="category-empty">Bu ay gider kaydı yok.</div>';
 const change=$('#reportWealthChange');if(change){const now=assetWealthTotal(),[y,m]=selectedMonth.split('-').map(Number),pd=new Date(y,m-2,1),pm=`${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,'0')}`,prev=localStorage.getItem(wealthSnapshotKey(pm));change.textContent=prev!==null?`${now-num(prev)>=0?'+':'−'}${money(Math.abs(now-num(prev)))}`:'İlk kayıt'}
}

function render(){
 document.body.classList.toggle("amounts-hidden",amountsHidden);
 const c=calcMonth(selectedMonth);
 const set=(id,val)=>{const el=$(id);if(el)el.textContent=val};
 set("#incomeTotal",money(c.income));set("#expenseTotal",money(c.expense));set("#dueTotal",money(c.due));set("#balanceTotal",money(c.balance));set("#paidExpenseTotal",money(c.paidExpense));set("#pendingTotal",money(c.due));
 const progress=c.income>0?Math.max(0,Math.min(100,(Math.max(0,c.balance)/c.income)*100)):0;set("#progressPercent",`%${progress.toFixed(0)}`);set("#progressText",c.income?`${money(c.balance)} kullanılabilir`:"Bu ay gelir kaydı yok");const pb=$("#progressBar");if(pb)pb.style.width=`${progress}%`;
 renderMonthlySummary(c);
 set("#monthIncomeDisplay",money(c.income));set("#monthExpenseDisplay",money(c.expense));set("#monthNetDisplay",money(c.balance));
 const hero=$("#heroBalance");if(hero){hero.textContent=money(c.balance);hero.className=c.balance>0?"positive":c.balance<0?"negative":"neutral"}
 set("#heroSub",`${monthLabel(selectedMonth)} · Gelir − gider − ödenen borç/ödemeler`);
 const badge=$("#heroBadge");if(badge){badge.textContent=c.balance>0?"Kalan":c.balance<0?"Dikkat":"Dengede";badge.className="status-chip "+(c.balance>0?"positive":c.balance<0?"negative":"neutral")}
 const moves=monthMoves(selectedMonth).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
 const filteredMoves=moves.filter(x=>moveFilter==="all"||(moveFilter==="income"&&x.type==="income")||(moveFilter==="expense"&&x.type==="expense"));
 const moveHTML=filteredMoves.map(moveRow).join("")||empty("Bu ay henüz hareket yok.");
 const ml=$("#moveList");if(ml)ml.innerHTML=moveHTML;
 const sm=$("#summaryMoveList");if(sm)sm.innerHTML=(moves.slice(0,4).map(moveRow).join("")||empty("Bu ay henüz hareket yok."));
 const obs=monthObligations(selectedMonth).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 const filteredObs=obs.filter(x=>debtFilter==="all"||(debtFilter==="debts"&&!x.paid)||(debtFilter==="payments"&&x.paid));
 const ol=$("#obligationList");if(ol)ol.innerHTML=filteredObs.map(obligationRow).join("")||empty("Bu ay borç veya ödeme yok.");
 set("#monthTotal",money(obs.reduce((a,x)=>a+num(x.amount),0)));
 renderChart(moves);renderAnalysis();renderReport();renderUpcoming();renderCategorySummary(selectedMonth);renderGold();renderGoldNotes();renderStocks();renderGoals();renderNet();renderRecurring();renderSettingsInfo();updateWealthSnapshot();renderCalendar();
}
function renderAnalysis(){
 const chart=$("#analysisChart"), summary=$("#analysisSummary"); if(!chart)return;
 const base=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-(5-i));return d.toISOString().slice(0,7)});
 const vals=base.map(m=>{const ms=monthMoves(m);const income=ms.filter(x=>x.type==="income").reduce((a,x)=>a+num(x.amount),0);const expense=ms.filter(x=>x.type==="expense").reduce((a,x)=>a+num(x.amount),0);return {m,income,expense,balance:income-expense}});
 const max=Math.max(1,...vals.flatMap(v=>[v.income,v.expense]));
 chart.innerHTML=vals.map(v=>{const label=new Date(+v.m.slice(0,4),+v.m.slice(5)-1,1).toLocaleDateString("tr-TR",{month:"short"}).replace(".","");return `<div class="analysis-col"><div class="analysis-bars"><i class="ain" style="height:${Math.max(4,v.income/max*82)}%" title="${money(v.income)}"></i><i class="aout" style="height:${Math.max(4,v.expense/max*82)}%" title="${money(v.expense)}"></i></div><small>${label}</small></div>`}).join("");
 const c=calcMonth(selectedMonth); [ ["#analysisIncome",money(c.income)],["#analysisExpense",money(c.expense)],["#analysisBalance",money(c.balance)] ].forEach(([id,v])=>{const e=$(id);if(e)e.textContent=v});
 const sixIncome=vals.reduce((a,v)=>a+v.income,0),sixExpense=vals.reduce((a,v)=>a+v.expense,0);
 if(summary)summary.innerHTML=`<span><b>${money(sixIncome)}</b><small>6 aylık gelir</small></span><span><b>${money(sixExpense)}</b><small>6 aylık gider</small></span><span><b>${money(sixIncome-sixExpense)}</b><small>6 aylık net</small></span>`;
}

let calendarCursor=new Date(); calendarCursor.setDate(1); let calendarSelected=null;
function pad2(n){return String(n).padStart(2,"0")}
function isoDay(y,m,d){return `${y}-${pad2(m+1)}-${pad2(d)}`}
function calendarItems(date){
 const moves=state.moves.filter(x=>x.date===date);
 const obs=state.obligations.filter(x=>x.date===date);
 return {moves,obs};
}
function renderCalendar(){
 const grid=$("#calendarGrid"); if(!grid)return;
 const y=calendarCursor.getFullYear(), m=calendarCursor.getMonth();
 const title=new Date(y,m,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"});
 $("#calMonthTitle").textContent=title.charAt(0).toLocaleUpperCase("tr-TR")+title.slice(1);
 renderCalendarMonthSummary();
 const first=new Date(y,m,1); let start=(first.getDay()+6)%7; const days=new Date(y,m+1,0).getDate(); const prevDays=new Date(y,m,0).getDate();
 let html="";
 for(let i=0;i<42;i++){
   const dayNum=i-start+1; let yy=y,mm=m,dd=dayNum,muted=false;
   if(dayNum<1){dd=prevDays+dayNum;mm=m-1;muted=true} else if(dayNum>days){dd=dayNum-days;mm=m+1;muted=true}
   const date=isoDay(yy+(mm<0?-1:mm>11?1:0),(mm+12)%12,dd); const items=calendarItems(date);
   const hasIncome=items.moves.some(x=>x.type==="income"); const hasExpense=items.moves.some(x=>x.type==="expense"); const hasDebt=items.obs.length>0;
   const today=isoDay(new Date().getFullYear(),new Date().getMonth(),new Date().getDate())===date;
   const selected=calendarSelected===date;
   html+=`<button class="cal-cell ${muted?"muted":""} ${today?"today":""} ${selected?"selected":""}" data-date="${date}"><span class="cal-num">${dd}</span><span class="cal-dots">${hasIncome?'<i class="cal-dot income"></i>':''}${hasExpense?'<i class="cal-dot expense"></i>':''}${hasDebt?'<i class="cal-dot debt"></i>':''}</span></button>`;
 }
 grid.innerHTML=html;
 grid.querySelectorAll(".cal-cell").forEach(b=>b.onclick=()=>{calendarSelected=b.dataset.date;renderCalendarDay();renderCalendar()});
 if(!calendarSelected || !calendarSelected.startsWith(`${y}-${pad2(m+1)}`)) calendarSelected=isoDay(y,m,new Date().getMonth()===m?new Date().getDate():1);
 renderCalendarDay();
}
function renderCalendarDay(){
 const el=$("#calendarDayList"), title=$("#calendarDayTitle"); if(!el)return;
 const d=calendarSelected||isoDay(calendarCursor.getFullYear(),calendarCursor.getMonth(),1); const {moves,obs}=calendarItems(d);
 title.textContent=new Date(d+"T12:00:00").toLocaleDateString("tr-TR",{day:"numeric",month:"long"});
 const rows=[];
 moves.forEach(x=>rows.push(`<div class="row"><div class="rowicon">${categoryIcon(x.name)}</div><div class="rowmain"><b>${esc(x.name)}</b><small>${x.type==="income"?"Gelir":"Gider"}${x.recurringId?" · Her ay":""}</small></div><strong class="${x.type==="income"?"incomeText":"expenseText"}">${x.type==="income"?"+":"−"}${money(x.amount)}</strong></div>`));
 obs.forEach(x=>rows.push(`<div class="row ${x.paid?"isPaid":"isUnpaid"}"><div class="rowicon">${categoryIcon(x.name+" "+(x.category||""))}</div><div class="rowmain"><b>${esc(x.name)}</b><small>${x.paid?"Ödendi · gider olarak işlendi":esc(x.category||"Borç/Ödeme")}${x.recurringId?" · Her ay":""}</small></div><strong>${money(x.amount)}</strong></div>`));
 const income=moves.filter(x=>x.type==="income").reduce((a,x)=>a+num(x.amount),0), expense=moves.filter(x=>x.type==="expense").reduce((a,x)=>a+num(x.amount),0);
 const total=income-expense;
 const summary=`<div class="calendar-total"><span>Günün neti</span><b class="${total>=0?"incomeText":"expenseText"}">${total>=0?"+":"−"}${money(Math.abs(total))}</b></div>`;
 el.innerHTML=(rows.length?summary+rows.join(""):`<div class="calendar-empty">Bu gün için kayıt yok.</div>`);
}
function shiftCalendar(delta){calendarCursor.setMonth(calendarCursor.getMonth()+delta);calendarSelected=isoDay(calendarCursor.getFullYear(),calendarCursor.getMonth(),1);renderCalendar()}

function renderRecurring(){
 const el=$("#recurringList"); if(!el)return; const rules=state.recurring.filter(x=>x.active!==false).sort((a,b)=>(a.day||1)-(b.day||1));
 el.innerHTML=rules.map(recurringRow).join("")||`<div class="upcoming-empty">Henüz tekrarlayan kayıt yok.</div>`;
}

function renderUpcoming(){
 const el=$("#upcomingList");if(!el)return;
 const now=new Date();now.setHours(0,0,0,0);const end=new Date(now);end.setDate(end.getDate()+14);
 const items=state.obligations.filter(x=>!x.paid&&x.date).map(x=>({...x,d:new Date(x.date+"T12:00:00")})).filter(x=>x.d>=now&&x.d<=end).sort((a,b)=>a.d-b.d).slice(0,5);
 if(!items.length){el.innerHTML=`<div class="upcoming-empty">Önümüzdeki 14 günde bekleyen ödeme yok. 🎉</div>`;return}
 el.innerHTML=items.map(x=>{const days=Math.max(0,Math.ceil((x.d-now)/86400000));return `<div class="upcoming-item"><div class="upcoming-icon">${categoryIcon(x.name+" "+(x.category||""))}</div><div class="upcoming-main"><b>${esc(x.name)}</b><small>${dateTR(x.date)} · ${days===0?"Bugün":days===1?"Yarın":`${days} gün sonra`}</small></div><div class="upcoming-amount"><b>${money(x.amount)}</b><small>${esc(x.category||"Ödeme")}</small></div></div>`}).join("");
}

function renderChart(moves){
 const el=$("#summaryChart");if(!el)return;
 const base=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-(5-i));return d.toISOString().slice(0,7)});
 const labels=base.map(m=>new Date(+m.slice(0,4),+m.slice(5)-1,1).toLocaleDateString("tr-TR",{month:"short"}).replace(".",""));
 const vals=base.map(m=>{const ms=state.moves.filter(x=>x.date?.startsWith(m));return {income:ms.filter(x=>x.type==="income").reduce((a,x)=>a+num(x.amount),0),expense:ms.filter(x=>x.type==="expense").reduce((a,x)=>a+num(x.amount),0)}});
 const max=Math.max(1,...vals.flatMap(v=>[v.income,v.expense]));
 el.innerHTML=vals.map((v,i)=>`<div class="bar-group"><div class="bar income" style="height:${Math.max(3,v.income/max*86)}%" title="${money(v.income)}"></div><div class="bar expense" style="height:${Math.max(3,v.expense/max*86)}%" title="${money(v.expense)}"></div><span class="bar-label">${labels[i]}</span></div>`).join("");
}

function empty(t){return `<div class="empty">${t}</div>`}
function categoryIcon(name){const n=String(name||"").toLocaleLowerCase("tr-TR");let id="i-wallet";if(n.includes("kira")||n.includes("ev"))id="i-house";else if(n.includes("elektr")||n.includes("fatura"))id="i-electric";else if(n.includes("telefon")||n.includes("gsm"))id="i-phone";else if(n.includes("internet")||n.includes("wifi"))id="i-wifi";else if(n.includes("market")||n.includes("alışveriş")||n.includes("manav")||n.includes("avm"))id="i-cart";else if(n.includes("yakıt")||n.includes("benzin")||n.includes("mazot")||n.includes("akaryakıt")||n.includes("ulaşım")||n.includes("otobüs")||n.includes("taksi"))id="i-car";else if(n.includes("yemek")||n.includes("restoran")||n.includes("gıda")||n.includes("lokanta")||n.includes("kebap"))id="i-food";else if(n.includes("sağlık")||n.includes("eczane")||n.includes("ilaç"))id="i-medical";else if(n.includes("okul")||n.includes("eğitim")||n.includes("kurs")||n.includes("üniversite"))id="i-school";else if(n.includes("maaş")||n.includes("gelir")||n.includes("kazanç"))id="i-arrow-up";return `<span class="category-icon"><svg><use href="#${id}"/></svg></span>`}
function moveRow(x){return `<div class="row"><div class="rowicon">${categoryIcon(x.name)}</div><div class="rowmain"><b>${esc(x.name)}</b><small>${dateTR(x.date)} · ${x.type==="income"?"Gelir":"Gider"}${x.recurringId?" · Her ay":""}${x.fromObligation?" · Borç ödendi":""}</small></div><strong class="${x.type==="income"?"incomeText":"expenseText"}">${x.type==="income"?"+":"−"}${money(x.amount)}</strong><button class="editBtn" onclick="editMove(${x.id})">✎</button><button class="delete" onclick="removeRecord('moves',${x.id})">×</button></div>`}
function obligationRow(x){return `<div class="row ${x.paid?"isPaid":"isUnpaid"}"><div class="rowicon">${categoryIcon(x.name+" "+(x.category||""))}</div><div class="rowmain"><b>${esc(x.name)}</b><small>${dateTR(x.date)} · ${x.paid?"Gider olarak işlendi":esc(x.category||"Borç/Ödeme")}${x.recurringId?" · Her ay":""}</small></div><strong class="${x.paid?"expenseText":""}">${money(x.amount)}</strong><button class="editBtn" onclick="editObligation(${x.id})">✎</button><button class="payBtn ${x.paid?"done":""}" onclick="togglePaid(${x.id})">${x.paid?"✓ Ödendi":"Ödendi"}</button><button class="delete" onclick="removeRecord('obligations',${x.id})">×</button></div>`}
function recurringRow(x){return `<div class="row"><div class="repeat">↻</div><div class="rowmain"><b>${esc(x.name)}</b><small>Her ayın ${x.day}. günü · ${x.kind==="move"?(x.type==="income"?"Gelir":"Gider"):"Borç/Ödeme"}</small></div><strong>${money(x.amount)}</strong><button class="delete" onclick="removeRecord('recurring',${x.id})">×</button></div>`}

function openForm(kind){
 let title="",store="",fields=[],preset={};
 if(kind==="income"||kind==="expense"){
  title=kind==="income"?"Gelir ekle":"Gider ekle";store="moves";preset={type:kind==="income"?"income":"expense"};
  fields=[field("name","Açıklama","text","",true),field("amount","Tutar","number","",true),field("date","Tarih","date",todayISO(),true),field("repeat","Her ay tekrarla","checkbox",false,false)];
 } else if(kind==="obligation"){
  title="Borç / gider ekle";store="obligations";fields=[field("name","Borç / gider adı","text","",true),field("amount","Tutar","number","",true),field("date","Son ödeme tarihi","date",todayISO(),true),field("category","Kategori","category","Kira"),field("repeat","Her ay tekrarla","checkbox",false,false)];
 } else if(kind==="gold"){
  title="Altın bilgisi";return;
 } else if(kind==="recurring"){
  title="Her ay tekrar eden kayıt";store="recurring";fields=[field("name","Açıklama","text","",true),field("amount","Tutar","number","",true),field("day","Her ayın günü","number","1",true),field("kind","Kayıt türü","select",["expense","income","obligation"]),field("startMonth","Başlangıç ayı","month",selectedMonth,true)];
 }
 $("#modalTitle").textContent=title;$("#modalForm").innerHTML=`<div class="formgrid">${fields.map(fieldHTML).join("")}</div><button class="formsubmit">Kaydet</button>`;$ ("#modal").classList.remove("hidden");
 $("#modalForm").onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;const btn=e.target.querySelector(".formsubmit");btn.disabled=true;btn.textContent="Kaydediliyor…";
  try{
   const fd=new FormData(e.target),o={...preset};fields.forEach(f=>{if(f[2]==="checkbox")o[f[0]]=fd.get(f[0])==="on";else o[f[0]]=fd.get(f[0])});
   ["amount","day"].forEach(k=>{if(k in o)o[k]=num(o[k])});
   if(kind==="income"||kind==="expense"){
    const repeat=!!o.repeat;delete o.repeat;o.date=o.date||todayISO();
    if(repeat){const rid=await add("recurring",{name:o.name,amount:o.amount,day:new Date(o.date+"T12:00:00").getDate(),kind:"move",type:o.type,startMonth:o.date.slice(0,7),category:"Aylık"});o.recurringId=rid}
    await add("moves",o);
   } else if(kind==="obligation"){
    const repeat=!!o.repeat;delete o.repeat;o.paid=false;
    if(repeat){const rid=await add("recurring",{name:o.name,amount:o.amount,day:new Date(o.date+"T12:00:00").getDate(),kind:"obligation",startMonth:o.date.slice(0,7),category:o.category||"Borç/Ödeme"});o.recurringId=rid}
    await add("obligations",o);
   } else if(kind==="recurring"){
    const type=o.kind;const rec={name:o.name,amount:o.amount,day:o.day||1,startMonth:o.startMonth||selectedMonth,kind:type==="obligation"?"obligation":"move",type:type==="obligation"?undefined:type,category:type==="obligation"?"Borç/Ödeme":"Aylık",active:true};delete rec.kind; // set below
    rec.kind=type==="obligation"?"obligation":"move";if(type!=="obligation")rec.type=type;await add("recurring",rec);
   }
   closeModal();await refresh();toast("Kaydedildi");
  }catch(err){toast("Kayıt başarısız: "+(err?.message||"bilinmeyen hata"))}finally{busy=false;btn.disabled=false;btn.textContent="Kaydet"}
 };
}
function field(name,label,type,value="",required=false){return [name,label,type,value,required]}
function fieldHTML(f){const [name,label,type,value,required]=f;if(type==="category")return `<div class="field"><label>${label}</label><select name="${name}">${["Kira","Elektrik","Su","Doğalgaz","İnternet","Telefon","Market","Ulaşım","Yakıt","Yemek","Sağlık","Eğitim","Kredi Kartı","Diğer"].map(v=>`<option value="${v}" ${v===value?"selected":""}>${v}</option>`).join("")}</select></div>`;if(type==="checkbox")return `<label class="checkfield full"><input name="${name}" type="checkbox"> <span>${label}</span></label>`;if(type==="select"){const opts=["expense","income","obligation"].map(v=>`<option value="${v}">${v==="expense"?"Gider":v==="income"?"Gelir":"Borç / ödeme"}</option>`).join("");return `<div class="field"><label>${label}</label><select name="${name}">${opts}</select></div>`}return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${required?"required":""} ${type==="number"?"step=\"0.01\" min=\"0\"":""}></div>`}
function editMove(id){const x=state.moves.find(a=>a.id===id);if(!x)return;$("#modalTitle").textContent=x.type==="income"?"Geliri düzenle":"Gideri düzenle";$("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Açıklama</label><input name="name" value="${esc(x.name)}" required></div><div class="field"><label>Tutar</label><input name="amount" type="number" step="0.01" min="0" value="${num(x.amount)}" required></div><div class="field"><label>Tarih</label><input name="date" type="date" value="${esc(x.date)}" required></div></div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);x.name=f.get("name");x.amount=num(f.get("amount"));x.date=f.get("date");await put("moves",x);closeModal();await refresh();toast("Kayıt güncellendi")}}
function editObligation(id){const x=state.obligations.find(a=>a.id===id);if(!x)return;$("#modalTitle").textContent="Borç / gider düzenle";$("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Açıklama</label><input name="name" value="${esc(x.name)}" required></div><div class="field"><label>Tutar</label><input name="amount" type="number" step="0.01" min="0" value="${num(x.amount)}" required></div><div class="field"><label>Tarih</label><input name="date" type="date" value="${esc(x.date)}" required></div><div class="field"><label>Kategori</label><select name="category">${["Kira","Elektrik","Su","Doğalgaz","İnternet","Telefon","Market","Ulaşım","Yakıt","Yemek","Sağlık","Eğitim","Kredi Kartı","Diğer"].map(v=>`<option value="${v}" ${v===(x.category||"")?"selected":""}>${v}</option>`).join("")}</select></div></div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);x.name=f.get("name");x.amount=num(f.get("amount"));x.date=f.get("date");x.category=f.get("category")||"Diğer";await put("obligations",x);if(x.paid){const m=state.moves.find(v=>v.obligationId===x.id);if(m){m.name=x.name;m.amount=x.amount;m.date=x.date;m.category=x.category;await put("moves",m)}}closeModal();await refresh();toast("Kayıt güncellendi")}}
function closeModal(){$("#modal").classList.add("hidden")}
async function togglePaid(id){const x=state.obligations.find(a=>a.id===id);if(!x)return;x.paid=!x.paid;await put("obligations",x);await syncPaidObligationExpenses();await refresh();toast(x.paid?"Ödendi · gider olarak işlendi":"Ödeme geri alındı") }
async function removeRecord(store,id){
 if(store==="moves"){const m=state.moves.find(x=>x.id===id);if(m?.obligationId){toast("Borç giderini Borçlar ekranından geri alabilirsin.");return}}
 if(!confirm("Bu kaydı silmek istiyor musun?"))return;
 if(store==="obligations"){const o=state.obligations.find(x=>x.id===id);const linked=state.moves.find(x=>x.obligationId===id);if(linked)await del("moves",linked.id);}
 await del(store,id);await refresh();toast("Silindi")
}


const goldMeta={
 gram:{label:"Gram",unit:"gr",storage:"goldGram"},
 quarter:{label:"Çeyrek",unit:"adet",storage:"goldQuarter"},
 half:{label:"Yarım",unit:"adet",storage:"goldHalf"},
 full:{label:"Tam",unit:"adet",storage:"goldFull"},
 bracelet22:{label:"Bilezik",unit:"gr",storage:"goldBracelet"}
};
function goldHolding(type){return num(localStorage.getItem(goldMeta[type]?.storage||""))}
function renderGoldNotes(){
 const el=$("#goldNotesList"); if(!el)return;
 const rows=[...(state.goldNotes||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
 if(!rows.length){el.innerHTML='<div class="upcoming-empty">Henüz altın ekleme kaydı yok. “Altın Ekle” ile ilk kaydını oluşturabilirsin.</div>';return}
 el.innerHTML=rows.map(x=>{const meta=goldMeta[x.type]||goldMeta.gram;return `<div class="gold-note-row"><div class="gold-note-date"><b>${dateTRFull(x.date)}</b><small>${esc(meta.label)} · ${num(x.quantity)} ${meta.unit}</small></div><div class="gold-note-source"><label>Nereden alındı</label><input data-gold-source="${x.id}" value="${esc(x.source||"")}" placeholder="Banka / Kuyumcu / Hediye"></div><div class="gold-note-desc"><label>Açıklama</label><input data-gold-note="${x.id}" value="${esc(x.note||"")}" placeholder="Not yazabilirsin…"></div><button class="delete" onclick="removeGoldNote(${x.id})">×</button></div>`}).join("");
 el.querySelectorAll('[data-gold-source]').forEach(inp=>inp.addEventListener('change',()=>saveGoldNoteField(Number(inp.dataset.goldSource),'source',inp.value)));
 el.querySelectorAll('[data-gold-note]').forEach(inp=>inp.addEventListener('change',()=>saveGoldNoteField(Number(inp.dataset.goldNote),'note',inp.value)));
}
function dateTRFull(d){return d?new Date(d+"T12:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit",year:"numeric"}):"-"}
async function saveGoldNoteField(id,key,value){const x=(state.goldNotes||[]).find(a=>a.id===id);if(!x)return;x[key]=String(value||"");await put("goldNotes",x);}
async function removeGoldNote(id){if(!confirm("Bu altın ekleme notunu silmek istiyor musun? Altın miktarı değişmez."))return;await del("goldNotes",id);state.goldNotes=state.goldNotes.filter(x=>x.id!==id);renderGoldNotes();toast("Not silindi")}
async function addGoldEntry(){
 const types=Object.entries(goldMeta).map(([k,v])=>`<option value="${k}">${v.label}${v.unit==="gr"?" (gram)":""}</option>`).join("");
 $("#modalTitle").textContent="Altın Ekle";
 $("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Tarih</label><input type="date" name="date" value="${todayISO()}" required></div><div class="field"><label>Nereden alındı</label><input name="source" placeholder="Banka / Kuyumcu / Hediye"></div><div class="field"><label>Eklenen altın</label><select name="type">${types}</select></div><div class="field"><label>Miktar</label><input name="quantity" type="number" step="0.001" min="0.001" required placeholder="Örn. 1 veya 2"></div><div class="field"><label>Açıklama / Not</label><input name="note" placeholder="Açıklama yazabilirsiniz"></div></div><div class="gold-add-hint">Eklenen miktar mevcut altın toplamına otomatik eklenir ve bu kayıt yalnızca cihazında tutulur.</div><button class="formsubmit">Altını Ekle</button>`;
 $("#modal").classList.remove("hidden");
 $("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),type=f.get("type"),quantity=num(f.get("quantity"));if(quantity<=0)return;const meta=goldMeta[type],storage=meta.storage,current=goldHolding(type);localStorage.setItem(storage,String(current+quantity));const id=await add("goldNotes",{date:f.get("date")||todayISO(),source:String(f.get("source")||""),type,quantity,note:String(f.get("note")||"")});state.goldNotes.push({id,date:f.get("date")||todayISO(),source:String(f.get("source")||""),type,quantity,note:String(f.get("note")||"")});closeModal();renderGold();renderGoldNotes();renderNet();toast(`${meta.label} eklendi`)};
}
function goldValue(){return num(localStorage.getItem("goldGram"))*num(gold.gram)+num(localStorage.getItem("goldQuarter"))*num(gold.quarter)+num(localStorage.getItem("goldHalf"))*num(gold.half)+num(localStorage.getItem("goldFull"))*num(gold.full)+num(localStorage.getItem("goldBracelet"))*num(gold.bracelet22)}
async function updateGold(silent=false){if(!navigator.onLine){if(!silent)toast("İnternet yok. Son kayıtlı kur kullanılıyor.");return}try{const r=await fetch("https://finans.truncgil.com/today.json",{cache:"no-store"});if(!r.ok)throw new Error("Kur servisi yanıt vermedi");const d=await r.json();const sell=k=>num(d?.[k]?.Satış);const rates={gram:sell("gram-altin"),quarter:sell("ceyrek-altin"),half:sell("yarim-altin"),full:sell("tam-altin"),bracelet22:sell("22-ayar-bilezik")};if(Object.values(rates).some(v=>!v))throw new Error("Altın verisi eksik");gold={...rates,updatedAt:new Date().toISOString(),sourceDate:d.Update_Date||""};saveGold();renderGold();renderNet();if(!silent)toast("Altın kurları güncellendi")}catch(e){if(!silent)toast("Güncel kur alınamadı. Son kayıtlı kur kullanılıyor.")}}
function renderGold(){
 const map={goldGram:"gram",goldQuarter:"quarter",goldHalf:"half",goldFull:"full",goldBracelet:"bracelet22"};Object.entries(map).forEach(([id,k])=>{const el=$("#"+id);if(!el)return;if(document.activeElement!==el)el.value=localStorage.getItem(id)||"";el.oninput=()=>{localStorage.setItem(id,el.value);$("#goldValue").textContent=money(goldValue());const gt=$("#goldTotalValue");if(gt)gt.textContent=money(goldValue());$("#goldRateInfo").textContent=gold.updatedAt?`Son kur: ${new Date(gold.updatedAt).toLocaleString("tr-TR")}`:"Henüz güncel kur alınmadı";renderNet();renderGoals()}});
 ["gram","quarter","half","full","bracelet22"].forEach((k,i)=>{const ids=["goldGramValue","goldQuarterValue","goldHalfValue","goldFullValue","goldBraceletValue"];const qtyIds=["goldGram","goldQuarter","goldHalf","goldFull","goldBracelet"];const el=$("#"+ids[i]);if(el)el.textContent=money(num(localStorage.getItem(qtyIds[i]))*num(gold[k]));});
 const labels=["Gram","Çeyrek","Yarım","Tam","22 Ayar"];const rateLine=$("#goldRatesLine");if(rateLine)rateLine.innerHTML=["gram","quarter","half","full","bracelet22"].map((k,i)=>`<span><b>${labels[i]}</b> ${gold[k]?money(gold[k]):"—"}</span>`).join("");
 $("#goldValue").textContent=money(goldValue());const gt=$("#goldTotalValue");if(gt)gt.textContent=money(goldValue());$("#goldRateInfo").textContent=gold.updatedAt?`Son kur: ${new Date(gold.updatedAt).toLocaleString("tr-TR")}`:"Henüz güncel kur alınmadı"}
function stockValue(){return state.stocks.reduce((a,x)=>a+num(x.quantity)*num(x.currentPrice),0)}
function assetValue(){return state.assets.reduce((a,x)=>a+num(x.value),0)}
function renderStocks(){const el=$("#stockList");el.innerHTML=state.stocks.map(x=>{const value=num(x.quantity)*num(x.currentPrice),cost=num(x.quantity)*num(x.averagePrice),profit=value-cost;return `<div class="row"><div class="rowmain"><b>${esc(x.code||x.name)}</b><small>${num(x.quantity)} adet · ${money(x.currentPrice)} güncel${x.priceUpdatedAt?" · "+dateTimeTR(x.priceUpdatedAt):""}</small></div><strong class="${profit>=0?"incomeText":"expenseText"}">${money(value)}<small class="profit">${profit>=0?"+":""}${money(profit)}</small></strong><button class="delete" onclick="removeRecord('stocks',${x.id})">×</button></div>`}).join("")||empty("Borsa kaydı yok.")}
function dateTimeTR(d){try{return new Date(d).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}catch{return ""}}
function renderGoals(){const el=$("#goalList");if(!el)return;const auto=goldValue()+stockValue()+assetValue();el.innerHTML=state.goals.map(x=>{const manual=num(x.saved),total=manual+auto,p=x.target?Math.min(100,total/num(x.target)*100):0;return `<div class="goal"><div><b>${esc(x.name)}</b><small>Manuel ${money(manual)} · Varlıklardan ${money(auto)} · Toplam ${money(total)} / ${money(x.target)}</small></div><strong>%${p.toFixed(0)}</strong><button class="delete" onclick="removeRecord('goals',${x.id})">×</button></div>`}).join("")||empty("Birikim hedefi yok.")}
function renderNet(){const cash=state.moves.reduce((a,x)=>a+(x.type==="income"?num(x.amount):-num(x.amount)),0);const total=cash+goldValue()+stockValue()+assetValue();const el=$("#netWorth");if(el)el.textContent=money(total);const gt=$("#goldTotalValue");if(gt)gt.textContent=money(goldValue())}
function renderSettingsInfo(){const rules=state.recurring.filter(x=>x.active!==false).length;$("#recurringCount").textContent=String(rules)}

async function collectBackupData(){return {version:9,exportedAt:new Date().toISOString(),...state,gold,goldHoldings:{gram:localStorage.getItem("goldGram")||0,quarter:localStorage.getItem("goldQuarter")||0,half:localStorage.getItem("goldHalf")||0,full:localStorage.getItem("goldFull")||0,bracelet22:localStorage.getItem("goldBracelet")||0}}}
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))), unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function deriveKey(password,salt){const raw=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},key,256);return b64(bits)}
let lastActivity=Date.now();
function installAutoLock(){
 const mins=Number(localStorage.getItem("finansAutoLockMinutes")||5);
 const idleMs=mins>0?mins*60*1000:Infinity;
 const touch=()=>{lastActivity=Date.now()};
 ["click","touchstart","keydown","scroll"].forEach(ev=>window.addEventListener(ev,touch,{passive:true}));
 document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&Date.now()-lastActivity>idleMs){lockApp();}});
 setInterval(()=>{if(!$("#lockScreen")?.classList.contains("hidden")||document.visibilityState!=="visible")return;if(Date.now()-lastActivity>idleMs)lockApp();},30000);
}
function lockApp(){
 const screen=$("#lockScreen"); if(!screen)return; screen.classList.remove("hidden"); const pass=$("#lockPassword"),pass2=$("#lockPassword2"),textEl=$("#lockText"),submit=$("#lockSubmit"),err=$("#lockError");
 const cfg=JSON.parse(localStorage.getItem("finansAuth")||"null"); if(!cfg)return; pass.value="";pass2.value="";pass2.classList.add("hidden");pass2.required=false;submit.textContent="Giriş Yap";textEl.textContent="Devam etmek için şifrenizi girin.";err.textContent="";
 const form=$("#lockForm"); form.onsubmit=async e=>{e.preventDefault();const p=pass.value;if(p.length<4){err.textContent="Şifre en az 4 karakter olmalı.";return}if(await passwordHash(p,unb64(cfg.salt))!==cfg.hash){err.textContent="Şifre yanlış.";pass.select();return}screen.classList.add("hidden");lastActivity=Date.now();};
}

async function setupOrUnlock(){
 const cfg=JSON.parse(localStorage.getItem("finansAuth")||"null");
 const form=$("#lockForm"), pass=$("#lockPassword"), pass2=$("#lockPassword2"), textEl=$("#lockText"), submit=$("#lockSubmit"), err=$("#lockError");
 let setup=!cfg;
 if(setup){textEl.textContent="İlk kullanım için bir giriş şifresi oluşturun.";pass2.classList.remove("hidden");pass2.required=true;submit.textContent="Şifre Oluştur"}
 return new Promise(resolve=>{form.onsubmit=async e=>{e.preventDefault();err.textContent="";const p=pass.value;if(p.length<4){err.textContent="Şifre en az 4 karakter olmalı.";return}
   try{if(setup){if(p!==pass2.value){err.textContent="Şifreler eşleşmiyor.";return}const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await passwordHash(p,salt);localStorage.setItem("finansAuth",JSON.stringify({v:1,salt:b64(salt),hash}));setup=false;pass2.classList.add("hidden");pass2.required=false;submit.textContent="Giriş Yap";textEl.textContent="Şifre oluşturuldu. Finans Merkezi açılıyor…";$("#lockScreen").classList.add("hidden");resolve();}
   else {const salt=unb64(cfg.salt),hash=await passwordHash(p,salt);if(hash!==cfg.hash){err.textContent="Şifre yanlış.";pass.select();return}$("#lockScreen").classList.add("hidden");resolve()}}
   catch(ex){console.error(ex);err.textContent="Güvenli giriş başlatılamadı."}}
 })}
async function changePassword(){const cfg=JSON.parse(localStorage.getItem("finansAuth")||"null");if(!cfg){toast("Önce giriş şifresi oluşturulmalı");return}const old=prompt("Mevcut şifren:");if(old===null)return;if(await passwordHash(old,unb64(cfg.salt))!==cfg.hash){alert("Mevcut şifre yanlış.");return}const p=prompt("Yeni şifre (en az 4 karakter):");if(p===null)return;if(p.length<4){alert("Şifre en az 4 karakter olmalı.");return}const p2=prompt("Yeni şifre tekrar:");if(p!==p2){alert("Şifreler eşleşmiyor.");return}const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await passwordHash(p,salt);localStorage.setItem("finansAuth",JSON.stringify({v:1,salt:b64(salt),hash}));toast("Giriş şifresi değiştirildi")}
async function exportData(){try{const p=prompt("Yedek için bir şifre belirleyin:");if(p===null)return;if(p.length<4){alert("Yedek şifresi en az 4 karakter olmalı.");return}const p2=prompt("Yedek şifresini tekrar girin:");if(p!==p2){alert("Şifreler eşleşmiyor.");return}const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveKey(p,salt);const plain=new TextEncoder().encode(JSON.stringify(await collectBackupData()));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);const envelope={format:"FinansMerkeziEncryptedBackup",version:1,kdf:"PBKDF2-SHA256",iterations:210000,cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),data:b64(cipher)};const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(envelope)],{type:"application/octet-stream"}));a.download=`FinansMerkezi_${todayISO()}.fmbackup`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast("Şifreli yedek hazırlandı") }catch(e){console.error(e);alert("Yedek oluşturulamadı.")}}
async function importData(file){try{const env=JSON.parse(await file.text());if(env.format!=="FinansMerkeziEncryptedBackup"||!env.salt||!env.iv||!env.data)throw Error("Geçersiz");const p=prompt("Yedek şifresi:");if(p===null)return;const key=await deriveKey(p,unb64(env.salt));let d;try{const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(env.iv)},key,unb64(env.data));d=JSON.parse(new TextDecoder().decode(plain))}catch{throw Error("Şifre yanlış veya yedek bozuk")};if(!d.moves&&!d.obligations)throw Error("Geçersiz");if(!confirm("Bu işlem mevcut cihazdaki kayıtların üzerine yedeği yükleyecek. Devam edilsin mi?"))return;for(const s of STORES){await new Promise((resolve,reject)=>{const tx=db.transaction(s,"readwrite"),st=tx.objectStore(s);st.clear();for(const x of (d[s]||[])){const y={...x};delete y.id;st.add(y)}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}if(d.gold)localStorage.setItem("finansGoldRates",JSON.stringify(d.gold));const h=d.goldHoldings||{};Object.entries({goldGram:h.gram,goldQuarter:h.quarter,goldHalf:h.half,goldFull:h.full,goldBracelet:h.bracelet22}).forEach(([k,v])=>{if(v!==undefined)localStorage.setItem(k,v)});await refresh();toast("Şifreli yedek geri yüklendi")}catch(e){console.error(e);alert(e.message==="Şifre yanlış veya yedek bozuk"?e.message:"Geçerli bir Finans Merkezi .fmbackup dosyası seçmelisin.")}}
async function clearAll(){if(!confirm("TÜM VERİLER SİLİNECEK. Emin misin?"))return;for(const s of STORES){await new Promise((res,rej)=>{const tx=db.transaction(s,"readwrite");tx.objectStore(s).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}Object.keys(localStorage).filter(k=>k.startsWith("gold")||k==="finansGoldRates").forEach(k=>localStorage.removeItem(k));await refresh();toast("Veriler temizlendi")}
function toast(t){const x=$("#toast");x.textContent=t;x.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.classList.remove("show"),2400)}

$$("[data-page]").forEach(b=>b.onclick=()=>showPage(b.dataset.page));
function applySavingsTab(){if($('#goldPanel'))$('#goldPanel').classList.toggle('hidden',savingsTab!=='gold');if($('#stockPanel'))$('#stockPanel').classList.toggle('hidden',savingsTab!=='stocks');if($('#goldNotesPanel'))$('#goldNotesPanel').classList.toggle('hidden',savingsTab!=='notes')}
function showPage(id){$$('.page').forEach(p=>p.classList.toggle('active',p.id===id));$$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.page===id));if(id==='savings')applySavingsTab();if(id==='calendar')renderCalendar();window.scrollTo({top:0,behavior:'smooth'})}
$$('.monthSelect').forEach(el=>el.onchange=()=>{selectedMonth=el.value;buildMonthMenus();render()});
const bind=(id,fn)=>{const el=$(id);if(el)el.onclick=fn};

$$('.segmented').forEach(seg=>{
 const buttons=[...seg.querySelectorAll('button')];
 buttons.forEach((btn,i)=>btn.addEventListener('click',()=>{
  buttons.forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  const page=seg.closest('.page')?.id;
  if(page==='month'){moveFilter=['all','income','expense'][i]||'all';render();}
  else if(page==='debts'){debtFilter=['all','debts','payments'][i]||'all';render();}
  else if(page==='savings'){savingsTab=i===0?'gold':i===1?'stocks':'notes';applySavingsTab();if(savingsTab==='notes')renderGoldNotes();}
 }));
});

bind("#heroEye",()=>{amountsHidden=!amountsHidden;localStorage.setItem("finansAmountsHidden",amountsHidden?"1":"0");render();toast(amountsHidden?"Tutarlar gizlendi":"Tutarlar gösteriliyor")});
bind("#summaryMonthMenu",()=>{const action=prompt("Ana sayfa menüsü:\n1 · Tutarları gizle/göster\n2 · Bu aya dön\n3 · Şifreli yedek al\n\nSeçimin:","");if(action==="1"){$("#heroEye")?.click()}else if(action==="2"){selectedMonth=new Date().toISOString().slice(0,7);buildMonthMenus();render()}else if(action==="3")exportData()});
bind("#addGoldEntry",addGoldEntry);bind("#addGoldEntry2",addGoldEntry);
bind("#prevMonth",()=>changeMonth(-1));bind("#nextMonth",()=>changeMonth(1));bind("#prevMonth2",()=>changeMonth(-1));bind("#nextMonth2",()=>changeMonth(1));
bind("#calPrev",()=>shiftCalendar(-1));bind("#calNext",()=>shiftCalendar(1));
bind("#addIncome",()=>openForm("income"));bind("#addExpense",()=>openForm("expense"));bind("#addObligation",()=>openForm("obligation"));bind("#addRecurring",()=>openForm("recurring"));bind("#addIncome2",()=>openForm("income"));bind("#addExpense2",()=>openForm("expense"));bind("#addObligation2",()=>openForm("obligation"));
$("#refreshGold").onclick=updateGold;
const hideDefault=$("#hideAmountsDefault");if(hideDefault){hideDefault.checked=localStorage.getItem("finansHideDefault")==="1";hideDefault.onchange=()=>{localStorage.setItem("finansHideDefault",hideDefault.checked?"1":"0");amountsHidden=hideDefault.checked;localStorage.setItem("finansAmountsHidden",amountsHidden?"1":"0");render()}}
const autoLockSelect=$("#autoLockSelect");if(autoLockSelect){autoLockSelect.value=localStorage.getItem("finansAutoLockMinutes")||"5";autoLockSelect.onchange=()=>{localStorage.setItem("finansAutoLockMinutes",autoLockSelect.value);toast(autoLockSelect.value==="0"?"Otomatik kilit kapatıldı":"Otomatik kilit güncellendi")}}$("#refreshGold2").onclick=updateGold;$("#backupBtn").onclick=exportData;$("#exportBtn").onclick=exportData;$("#importBtn").onclick=()=>$("#importFile").click();$("#importFile").onchange=e=>e.target.files[0]&&importData(e.target.files[0]);$("#clearAll").onclick=clearAll;$("#changePasswordBtn").onclick=changePassword;
async function fetchStockPrice(symbol){symbol=String(symbol||"").trim().toUpperCase();if(!/^[A-Z0-9]{2,6}$/.test(symbol))throw new Error("Geçerli bir BIST kodu gir");const urls=[`https://api.bist-api.com/api/v1/stocks/${encodeURIComponent(symbol)}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?range=1d&interval=1d`)}`];for(const url of urls){try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)continue;const d=await r.json();const price=num(d?.current_price??d?.data?.price??d?.data?.current_price??d?.chart?.result?.[0]?.meta?.regularMarketPrice);if(price>0)return {price,change:num(d?.change??d?.data?.change??d?.chart?.result?.[0]?.meta?.regularMarketChangePercent),updatedAt:new Date().toISOString(),source:url.includes("bist-api")?"BIST API":"Yahoo"};}catch{}}throw new Error("Güncel hisse fiyatı alınamadı")}
async function refreshStockPrices(){if(!state.stocks.length){toast("Önce hisse ekle");return}let ok=0;for(const x of state.stocks){try{const q=await fetchStockPrice(x.code);x.currentPrice=q.price;x.changePercent=q.change;x.priceUpdatedAt=q.updatedAt;await put("stocks",x);ok++}catch{}}await refresh();toast(ok?`${ok} hisse güncellendi` : "Hisse fiyatları alınamadı")}
$("#refreshStocks").onclick=refreshStockPrices;
$("#addStock").onclick=()=>{const title="Borsa hissesi";$("#modalTitle").textContent=title;$("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Hisse / Kod</label><input id="stockCode" name="code" required maxlength="6" autocapitalize="characters" placeholder="Örn. THYAO"></div><div class="field"><label>Adet</label><input name="quantity" type="number" step="0.01" min="0" required></div><div class="field"><label>Ortalama alış</label><input name="averagePrice" type="number" step="0.01" min="0" required></div><div class="field"><label>Güncel fiyat</label><input id="stockPrice" name="currentPrice" type="number" step="0.01" min="0" required></div></div><div id="stockPriceStatus" class="stockstatus">Hisse kodunu yazınca güncel fiyat otomatik aranır.</div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");const codeEl=$("#stockCode"),priceEl=$("#stockPrice"),statusEl=$("#stockPriceStatus");let timer;const lookup=async()=>{clearTimeout(timer);timer=setTimeout(async()=>{try{statusEl.textContent="Güncel fiyat aranıyor…";const q=await fetchStockPrice(codeEl.value);priceEl.value=q.price;statusEl.textContent=`Güncel fiyat: ${money(q.price)} · ${q.source}`;}catch(e){statusEl.textContent="Fiyat otomatik alınamadı; fiyatı elle girebilirsin."}},450)};codeEl.oninput=lookup;codeEl.onblur=lookup;$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await add("stocks",{code:String(f.get("code")).trim().toUpperCase(),quantity:num(f.get("quantity")),averagePrice:num(f.get("averagePrice")),currentPrice:num(f.get("currentPrice")),priceUpdatedAt:new Date().toISOString()});closeModal();await refresh();toast("Hisse kaydedildi")}}
$("#addGoal").onclick=()=>{openSimple("Birikim hedefi",[{n:"name",l:"Hedef adı",t:"text"},{n:"target",l:"Hedef tutarı",t:"number"},{n:"saved",l:"Mevcut birikim",t:"number"}],"goals")};
$("#addAsset").onclick=()=>{openSimple("Diğer varlık",[{n:"name",l:"Varlık adı",t:"text"},{n:"value",l:"Değeri",t:"number"}],"assets")};
function openSimple(title,fields,store){$("#modalTitle").textContent=title;$("#modalForm").innerHTML=`<div class="formgrid">${fields.map(f=>`<div class="field"><label>${f.l}</label><input name="${f.n}" type="${f.t}" step="0.01" min="0" required></div>`).join("")}</div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),o={};fields.forEach(x=>o[x.n]=f.get(x.n));["target","saved","value"].forEach(k=>{if(k in o)o[k]=num(o[k])});await add(store,o);closeModal();await refresh();toast("Kaydedildi")}}
$("#closeModal").onclick=closeModal;$("#modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
const todayEl=$("#today");if(todayEl)todayEl.textContent=new Date().toLocaleDateString("tr-TR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js?v=14.0").catch(()=>{});
setupOrUnlock().then(()=>{installAutoLock();return openDB()}).then(refresh).catch(e=>{console.error(e);alert("Finans Merkezi başlatılamadı: "+e.message)});
window.removeRecord=removeRecord;window.togglePaid=togglePaid;window.editMove=editMove;window.editObligation=editObligation;window.removeGoldNote=removeGoldNote;

function updateConnectionStatus(){
  const el=$("#connectionStatus"); if(!el)return;
  if(navigator.onLine){el.textContent="● Cihazda saklanıyor · internet açık";el.className="connection online";}
  else{el.textContent="● Cihazda saklanıyor · çevrimdışı";el.className="connection offline";}
}
window.addEventListener("online",updateConnectionStatus);window.addEventListener("offline",updateConnectionStatus);updateConnectionStatus();
applySavingsTab();
