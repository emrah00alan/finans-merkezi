const DB_NAME="FinansMerkeziIOS", DB_VERSION=7;
const STORES=["obligations","moves","goals","stocks","recurring","assets","installments","cards"];
let db;
let state={obligations:[],moves:[],goals:[],stocks:[],recurring:[],assets:[],installments:[],cards:[]};
let selectedMonth=new Date().toISOString().slice(0,7);
let gold={};
let busy=false;

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
function calcMonth(m){const moves=monthMoves(m),obs=monthObligations(m);const income=moves.filter(x=>x.type==="income").reduce((a,x)=>a+num(x.amount),0);const expense=moves.filter(x=>x.type==="expense").reduce((a,x)=>a+num(x.amount),0);const paid=obs.filter(x=>x.paid).reduce((a,x)=>a+num(x.amount),0);const due=obs.filter(x=>!x.paid).reduce((a,x)=>a+num(x.amount),0);return {income,expense,paid,due,balance:income-expense-paid}}

async function syncRecurring(){
 const rules=state.recurring.filter(r=>r.active!==false);
 const months=[]; const now=new Date();
 for(let i=0;i<13;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1);months.push(d.toISOString().slice(0,7))}
 if(!months.includes(selectedMonth))months.push(selectedMonth);
 for(const r of rules){
  for(const m of months){
   if(r.startMonth&&m<r.startMonth)continue; if(r.endMonth&&m>r.endMonth)continue;
   const date=monthDate(m,r.day); const exists=r.kind==="move"?state.moves.some(x=>x.recurringId===r.id&&x.date===date):state.obligations.some(x=>x.recurringId===r.id&&x.date===date);
   if(exists)continue;
   if(r.kind==="move") { const id=await add("moves",{name:r.name,amount:num(r.amount),date,type:r.type,recurringId:r.id,category:r.category||"Aylık"}); state.moves.push({id,name:r.name,amount:num(r.amount),date,type:r.type,recurringId:r.id,category:r.category||"Aylık"}) }
   else { const id=await add("obligations",{name:r.name,amount:num(r.amount),date,paid:false,category:r.category||"Borç/Ödeme",recurringId:r.id}); state.obligations.push({id,name:r.name,amount:num(r.amount),date,paid:false,category:r.category||"Borç/Ödeme",recurringId:r.id}) }
  }
 }
}

async function refresh(){loadGold();await loadState();await syncRecurring();buildMonthMenus();render();if(navigator.onLine&&(!gold.updatedAt||Date.now()-new Date(gold.updatedAt).getTime()>10*60*1000))updateGold(true)}

function render(){
 const c=calcMonth(selectedMonth); $("#incomeTotal").textContent=money(c.income);$("#expenseTotal").textContent=money(c.expense);$("#dueTotal").textContent=money(c.due);$("#balanceTotal").textContent=money(c.balance);
 const hero=$("#heroBalance");hero.textContent=money(c.balance);hero.className=c.balance>0?"positive":c.balance<0?"negative":"neutral";
 $("#heroSub").textContent=`${monthLabel(selectedMonth)} · Gelir − gider − ödenen borç/ödemeler`;
 const badge=$("#heroBadge");badge.textContent=c.balance>0?"Kalan":c.balance<0?"Dikkat":"Dengede";badge.className="badge "+(c.balance>0?"positive":c.balance<0?"negative":"neutral");
 const moves=monthMoves(selectedMonth).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt)));
 $("#moveList").innerHTML=moves.map(moveRow).join("")||empty("Bu ay henüz hareket yok.");
 const obs=monthObligations(selectedMonth).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
 $("#obligationList").innerHTML=obs.map(obligationRow).join("")||empty("Bu ay borç veya ödeme yok.");
 $("#monthTotal").textContent=money(obs.reduce((a,x)=>a+num(x.amount),0));
 renderGold();renderStocks();renderGoals();renderNet();renderSettingsInfo();
}
function empty(t){return `<div class="empty">${t}</div>`}
function moveRow(x){return `<div class="row"><div class="rowmain"><b>${esc(x.name)}</b><small>${dateTR(x.date)} · ${x.type==="income"?"Gelir":"Gider"}${x.recurringId?" · Her ay":""}</small></div><strong class="${x.type==="income"?"incomeText":"expenseText"}">${x.type==="income"?"+":"−"}${money(x.amount)}</strong><button class="editBtn" onclick="editMove(${x.id})">✎</button><button class="delete" onclick="removeRecord('moves',${x.id})">×</button></div>`}
function obligationRow(x){return `<div class="row ${x.paid?"isPaid":"isUnpaid"}"><div class="statusDot"></div><div class="rowmain"><b>${esc(x.name)}</b><small>${dateTR(x.date)} · ${esc(x.category||"Borç/Ödeme")}${x.recurringId?" · Her ay":""}</small></div><strong>${money(x.amount)}</strong><button class="editBtn" onclick="editObligation(${x.id})">✎</button><button class="payBtn ${x.paid?"done":""}" onclick="togglePaid(${x.id})">${x.paid?"✓ Ödendi":"Ödendi"}</button><button class="delete" onclick="removeRecord('obligations',${x.id})">×</button></div>`}
function recurringRow(x){return `<div class="row"><div class="repeat">↻</div><div class="rowmain"><b>${esc(x.name)}</b><small>Her ayın ${x.day}. günü · ${x.kind==="move"?(x.type==="income"?"Gelir":"Gider"):"Borç/Ödeme"}</small></div><strong>${money(x.amount)}</strong><button class="delete" onclick="removeRecord('recurring',${x.id})">×</button></div>`}

function openForm(kind){
 let title="",store="",fields=[],preset={};
 if(kind==="income"||kind==="expense"){
  title=kind==="income"?"Gelir ekle":"Gider ekle";store="moves";preset={type:kind==="income"?"income":"expense"};
  fields=[field("name","Açıklama","text","",true),field("amount","Tutar","number","",true),field("date","Tarih","date",todayISO(),true),field("repeat","Her ay tekrarla","checkbox",false,false)];
 } else if(kind==="obligation"){
  title="Borç / ödeme ekle";store="obligations";fields=[field("name","Borç / ödeme adı","text","",true),field("amount","Tutar","number","",true),field("date","Son ödeme tarihi","date",todayISO(),true),field("category","Kategori","text","Kredi / Fatura"),field("repeat","Her ay tekrarla","checkbox",false,false)];
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
    const repeat=!!o.repeat;delete o.repeat;o.date=o.date||todayISO();await add("moves",o);
    if(repeat)await add("recurring",{name:o.name,amount:o.amount,day:new Date(o.date+"T12:00:00").getDate(),kind:"move",type:o.type,startMonth:o.date.slice(0,7),category:"Aylık"});
   } else if(kind==="obligation"){
    const repeat=!!o.repeat;delete o.repeat;o.paid=false;await add("obligations",o);
    if(repeat)await add("recurring",{name:o.name,amount:o.amount,day:new Date(o.date+"T12:00:00").getDate(),kind:"obligation",startMonth:o.date.slice(0,7),category:o.category||"Borç/Ödeme"});
   } else if(kind==="recurring"){
    const type=o.kind;const rec={name:o.name,amount:o.amount,day:o.day||1,startMonth:o.startMonth||selectedMonth,kind:type==="obligation"?"obligation":"move",type:type==="obligation"?undefined:type,category:type==="obligation"?"Borç/Ödeme":"Aylık",active:true};delete rec.kind; // set below
    rec.kind=type==="obligation"?"obligation":"move";if(type!=="obligation")rec.type=type;await add("recurring",rec);
   }
   closeModal();await refresh();toast("Kaydedildi");
  }catch(err){toast("Kayıt başarısız: "+(err?.message||"bilinmeyen hata"))}finally{busy=false;btn.disabled=false;btn.textContent="Kaydet"}
 };
}
function field(name,label,type,value="",required=false){return [name,label,type,value,required]}
function fieldHTML(f){const [name,label,type,value,required]=f;if(type==="checkbox")return `<label class="checkfield full"><input name="${name}" type="checkbox"> <span>${label}</span></label>`;if(type==="select"){const opts=["expense","income","obligation"].map(v=>`<option value="${v}">${v==="expense"?"Gider":v==="income"?"Gelir":"Borç / ödeme"}</option>`).join("");return `<div class="field"><label>${label}</label><select name="${name}">${opts}</select></div>`}return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${required?"required":""} ${type==="number"?"step=\"0.01\" min=\"0\"":""}></div>`}
function editMove(id){const x=state.moves.find(a=>a.id===id);if(!x)return;$("#modalTitle").textContent=x.type==="income"?"Geliri düzenle":"Gideri düzenle";$("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Açıklama</label><input name="name" value="${esc(x.name)}" required></div><div class="field"><label>Tutar</label><input name="amount" type="number" step="0.01" min="0" value="${num(x.amount)}" required></div><div class="field"><label>Tarih</label><input name="date" type="date" value="${esc(x.date)}" required></div></div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);x.name=f.get("name");x.amount=num(f.get("amount"));x.date=f.get("date");await put("moves",x);closeModal();await refresh();toast("Kayıt güncellendi")}}
function editObligation(id){const x=state.obligations.find(a=>a.id===id);if(!x)return;$("#modalTitle").textContent="Borç / ödeme düzenle";$("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Açıklama</label><input name="name" value="${esc(x.name)}" required></div><div class="field"><label>Tutar</label><input name="amount" type="number" step="0.01" min="0" value="${num(x.amount)}" required></div><div class="field"><label>Tarih</label><input name="date" type="date" value="${esc(x.date)}" required></div><div class="field"><label>Kategori</label><input name="category" value="${esc(x.category||"Borç/Ödeme")}"></div></div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);x.name=f.get("name");x.amount=num(f.get("amount"));x.date=f.get("date");x.category=f.get("category")||"Borç/Ödeme";await put("obligations",x);closeModal();await refresh();toast("Kayıt güncellendi")}}
function closeModal(){$("#modal").classList.add("hidden")}
async function togglePaid(id){const x=state.obligations.find(a=>a.id===id);if(!x)return;x.paid=!x.paid;await put("obligations",x);await refresh();toast(x.paid?"Ödendi olarak işaretlendi":"Ödeme geri alındı")}
async function removeRecord(store,id){if(!confirm("Bu kaydı silmek istiyor musun?"))return;await del(store,id);await refresh();toast("Silindi")}

function goldValue(){return num(localStorage.getItem("goldGram"))*num(gold.gram)+num(localStorage.getItem("goldQuarter"))*num(gold.quarter)+num(localStorage.getItem("goldHalf"))*num(gold.half)+num(localStorage.getItem("goldFull"))*num(gold.full)+num(localStorage.getItem("goldBracelet"))*num(gold.bracelet22)}
async function updateGold(silent=false){if(!navigator.onLine){if(!silent)toast("İnternet yok. Son kayıtlı kur kullanılıyor.");return}try{const r=await fetch("https://finans.truncgil.com/today.json",{cache:"no-store"});if(!r.ok)throw new Error("Kur servisi yanıt vermedi");const d=await r.json();const sell=k=>num(d?.[k]?.Satış);const rates={gram:sell("gram-altin"),quarter:sell("ceyrek-altin"),half:sell("yarim-altin"),full:sell("tam-altin"),bracelet22:sell("22-ayar-bilezik")};if(Object.values(rates).some(v=>!v))throw new Error("Altın verisi eksik");gold={...rates,updatedAt:new Date().toISOString(),sourceDate:d.Update_Date||""};saveGold();renderGold();renderNet();if(!silent)toast("Altın kurları güncellendi")}catch(e){if(!silent)toast("Güncel kur alınamadı. Son kayıtlı kur kullanılıyor.")}}
function renderGold(){
 const map={goldGram:"gram",goldQuarter:"quarter",goldHalf:"half",goldFull:"full",goldBracelet:"bracelet22"};Object.entries(map).forEach(([id,k])=>{const el=$("#"+id);if(!el)return;if(document.activeElement!==el)el.value=localStorage.getItem(id)||"";el.oninput=()=>{localStorage.setItem(id,el.value);$("#goldValue").textContent=money(goldValue());$("#goldRateInfo").textContent=gold.updatedAt?`Son kur: ${new Date(gold.updatedAt).toLocaleString("tr-TR")}`:"Henüz güncel kur alınmadı";renderNet()}});
 ["gram","quarter","half","full","bracelet22"].forEach((k,i)=>{const ids=["goldGramValue","goldQuarterValue","goldHalfValue","goldFullValue","goldBraceletValue"];const qtyIds=["goldGram","goldQuarter","goldHalf","goldFull","goldBracelet"];const el=$("#"+ids[i]);if(el)el.textContent=money(num(localStorage.getItem(qtyIds[i]))*num(gold[k]));});
 const labels=["Gram","Çeyrek","Yarım","Tam","22 Ayar"];const rateLine=$("#goldRatesLine");if(rateLine)rateLine.innerHTML=["gram","quarter","half","full","bracelet22"].map((k,i)=>`<span><b>${labels[i]}</b> ${gold[k]?money(gold[k]):"—"}</span>`).join("");
 $("#goldValue").textContent=money(goldValue());$("#goldRateInfo").textContent=gold.updatedAt?`Son kur: ${new Date(gold.updatedAt).toLocaleString("tr-TR")}`:"Henüz güncel kur alınmadı"}
function stockValue(){return state.stocks.reduce((a,x)=>a+num(x.quantity)*num(x.currentPrice),0)}
function assetValue(){return state.assets.reduce((a,x)=>a+num(x.value),0)}
function renderStocks(){const el=$("#stockList");el.innerHTML=state.stocks.map(x=>{const value=num(x.quantity)*num(x.currentPrice),cost=num(x.quantity)*num(x.averagePrice),profit=value-cost;return `<div class="row"><div class="rowmain"><b>${esc(x.code||x.name)}</b><small>${num(x.quantity)} adet · ${money(x.currentPrice)} güncel${x.priceUpdatedAt?" · "+dateTimeTR(x.priceUpdatedAt):""}</small></div><strong class="${profit>=0?"incomeText":"expenseText"}">${money(value)}<small class="profit">${profit>=0?"+":""}${money(profit)}</small></strong><button class="delete" onclick="removeRecord('stocks',${x.id})">×</button></div>`}).join("")||empty("Borsa kaydı yok.")}
function dateTimeTR(d){try{return new Date(d).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}catch{return ""}}
function renderGoals(){const el=$("#goalList");el.innerHTML=state.goals.map(x=>{const p=x.target?Math.min(100,num(x.saved)/num(x.target)*100):0;return `<div class="goal"><div><b>${esc(x.name)}</b><small>${money(x.saved)} / ${money(x.target)}</small></div><strong>%${p.toFixed(0)}</strong><button class="delete" onclick="removeRecord('goals',${x.id})">×</button></div>`}).join("")||empty("Birikim hedefi yok.")}
function renderNet(){const cash=state.moves.reduce((a,x)=>a+(x.type==="income"?num(x.amount):-num(x.amount)),0),paid=state.obligations.filter(x=>x.paid).reduce((a,x)=>a+num(x.amount),0);$("#netWorth").textContent=money(cash-paid+goldValue()+stockValue()+assetValue())}
function renderSettingsInfo(){const rules=state.recurring.filter(x=>x.active!==false).length;$("#recurringCount").textContent=String(rules)}

async function collectBackupData(){return {version:8,exportedAt:new Date().toISOString(),...state,gold,goldHoldings:{gram:localStorage.getItem("goldGram")||0,quarter:localStorage.getItem("goldQuarter")||0,half:localStorage.getItem("goldHalf")||0,full:localStorage.getItem("goldFull")||0,bracelet22:localStorage.getItem("goldBracelet")||0}}}
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a))), unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function deriveKey(password,salt){const raw=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function passwordHash(password,salt){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},key,256);return b64(bits)}
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
function showPage(id){$$('.page').forEach(p=>p.classList.toggle('active',p.id===id));$$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.page===id));window.scrollTo({top:0,behavior:'smooth'})}
$$('.monthSelect').forEach(el=>el.onchange=()=>{selectedMonth=el.value;buildMonthMenus();render()});
$("#prevMonth").onclick=()=>changeMonth(-1);$("#nextMonth").onclick=()=>changeMonth(1);$("#prevMonth2").onclick=()=>changeMonth(-1);$("#nextMonth2").onclick=()=>changeMonth(1);
$("#addIncome").onclick=()=>openForm("income");$("#addExpense").onclick=()=>openForm("expense");$("#addObligation").onclick=()=>openForm("obligation");$("#addIncome2").onclick=()=>openForm("income");$("#addExpense2").onclick=()=>openForm("expense");$("#addObligation2").onclick=()=>openForm("obligation");
$("#refreshGold").onclick=updateGold;$("#backupBtn").onclick=exportData;$("#exportBtn").onclick=exportData;$("#importBtn").onclick=()=>$("#importFile").click();$("#importFile").onchange=e=>e.target.files[0]&&importData(e.target.files[0]);$("#clearAll").onclick=clearAll;
async function fetchStockPrice(symbol){symbol=String(symbol||"").trim().toUpperCase();if(!/^[A-Z0-9]{2,6}$/.test(symbol))throw new Error("Geçerli bir BIST kodu gir");const urls=[`https://api.bist-api.com/api/v1/stocks/${encodeURIComponent(symbol)}`,`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?range=1d&interval=1d`)}`];for(const url of urls){try{const r=await fetch(url,{cache:"no-store"});if(!r.ok)continue;const d=await r.json();const price=num(d?.current_price??d?.data?.price??d?.data?.current_price??d?.chart?.result?.[0]?.meta?.regularMarketPrice);if(price>0)return {price,change:num(d?.change??d?.data?.change??d?.chart?.result?.[0]?.meta?.regularMarketChangePercent),updatedAt:new Date().toISOString(),source:url.includes("bist-api")?"BIST API":"Yahoo"};}catch{}}throw new Error("Güncel hisse fiyatı alınamadı")}
async function refreshStockPrices(){if(!state.stocks.length){toast("Önce hisse ekle");return}let ok=0;for(const x of state.stocks){try{const q=await fetchStockPrice(x.code);x.currentPrice=q.price;x.changePercent=q.change;x.priceUpdatedAt=q.updatedAt;await put("stocks",x);ok++}catch{}}await refresh();toast(ok?`${ok} hisse güncellendi` : "Hisse fiyatları alınamadı")}
$("#refreshStocks").onclick=refreshStockPrices;
$("#addStock").onclick=()=>{const title="Borsa hissesi";$("#modalTitle").textContent=title;$("#modalForm").innerHTML=`<div class="formgrid"><div class="field"><label>Hisse / Kod</label><input id="stockCode" name="code" required maxlength="6" autocapitalize="characters" placeholder="Örn. THYAO"></div><div class="field"><label>Adet</label><input name="quantity" type="number" step="0.01" min="0" required></div><div class="field"><label>Ortalama alış</label><input name="averagePrice" type="number" step="0.01" min="0" required></div><div class="field"><label>Güncel fiyat</label><input id="stockPrice" name="currentPrice" type="number" step="0.01" min="0" required></div></div><div id="stockPriceStatus" class="stockstatus">Hisse kodunu yazınca güncel fiyat otomatik aranır.</div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");const codeEl=$("#stockCode"),priceEl=$("#stockPrice"),statusEl=$("#stockPriceStatus");let timer;const lookup=async()=>{clearTimeout(timer);timer=setTimeout(async()=>{try{statusEl.textContent="Güncel fiyat aranıyor…";const q=await fetchStockPrice(codeEl.value);priceEl.value=q.price;statusEl.textContent=`Güncel fiyat: ${money(q.price)} · ${q.source}`;}catch(e){statusEl.textContent="Fiyat otomatik alınamadı; fiyatı elle girebilirsin."}},450)};codeEl.oninput=lookup;codeEl.onblur=lookup;$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await add("stocks",{code:String(f.get("code")).trim().toUpperCase(),quantity:num(f.get("quantity")),averagePrice:num(f.get("averagePrice")),currentPrice:num(f.get("currentPrice")),priceUpdatedAt:new Date().toISOString()});closeModal();await refresh();toast("Hisse kaydedildi")}}
$("#addGoal").onclick=()=>{openSimple("Birikim hedefi",[{n:"name",l:"Hedef adı",t:"text"},{n:"target",l:"Hedef tutarı",t:"number"},{n:"saved",l:"Mevcut birikim",t:"number"}],"goals")};
$("#addAsset").onclick=()=>{openSimple("Diğer varlık",[{n:"name",l:"Varlık adı",t:"text"},{n:"value",l:"Değeri",t:"number"}],"assets")};
function openSimple(title,fields,store){$("#modalTitle").textContent=title;$("#modalForm").innerHTML=`<div class="formgrid">${fields.map(f=>`<div class="field"><label>${f.l}</label><input name="${f.n}" type="${f.t}" step="0.01" min="0" required></div>`).join("")}</div><button class="formsubmit">Kaydet</button>`;$("#modal").classList.remove("hidden");$("#modalForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),o={};fields.forEach(x=>o[x.n]=f.get(x.n));["target","saved","value"].forEach(k=>{if(k in o)o[k]=num(o[k])});await add(store,o);closeModal();await refresh();toast("Kaydedildi")}}
$("#closeModal").onclick=closeModal;$("#modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
$("#today").textContent=new Date().toLocaleDateString("tr-TR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
if("serviceWorker" in navigator)navigator.serviceWorker.register("service-worker.js?v=11").catch(()=>{});
setupOrUnlock().then(()=>openDB()).then(refresh).catch(e=>{console.error(e);alert("Finans Merkezi başlatılamadı: "+e.message)});
window.removeRecord=removeRecord;window.togglePaid=togglePaid;window.editMove=editMove;window.editObligation=editObligation;

function updateConnectionStatus(){
  const el=$("#connectionStatus"); if(!el)return;
  if(navigator.onLine){el.textContent="● Cihazda saklanıyor · internet açık";el.className="connection online";}
  else{el.textContent="● Cihazda saklanıyor · çevrimdışı";el.className="connection offline";}
}
window.addEventListener("online",updateConnectionStatus);window.addEventListener("offline",updateConnectionStatus);updateConnectionStatus();
