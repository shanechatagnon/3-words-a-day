const cfg = window.APP_CONFIG || {};
const publicKey = cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_ANON_KEY || "";
const sb = (cfg.SUPABASE_URL && publicKey) ? supabase.createClient(cfg.SUPABASE_URL, publicKey) : null;

const CATALOG = window.CATALOG || [];
const CATEGORY_GROUPS = window.CATEGORY_GROUPS || [];
const catalogMap = new Map(CATALOG.map(w => [w.id, w]));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  user:null, profile:null, selectedCategories:new Set(), progress:new Map(), collections:[],
  collectionWords:[], userWords:new Map(), activity:new Map(), avatarUrl:null, memoFilter:"all",
  session:null, sessionIndex:0, sessionType:"daily", selectedDifficulty:2, lastAnswerCorrect:null,
  settingSaveHandler:null, confirmHandler:null
};

const DEFAULT_CATEGORIES = ["conversation","verbs","travel","hotel","commerce"];

function localDateISO(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function dateFromISO(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDaysISO(s,days){ const d=dateFromISO(s); d.setDate(d.getDate()+days); return localDateISO(d); }
function daysInclusiveUntil(goal){ if(!goal) return null; const a=dateFromISO(localDateISO()), b=dateFromISO(goal); return Math.max(1, Math.floor((b-a)/86400000)+1); }
function formatMonthYear(iso){ const d=new Date(iso); return new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric"}).format(d); }
function normalizeText(s=""){
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-z0-9'\s-]/g," ").replace(/\s+/g," ").trim();
}
function normalizeEnglish(s=""){ return normalizeText(s).replace(/^to\s+/,""); }
function slugify(s=""){ return normalizeText(s).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function showLoading(v){ $("#loading").classList.toggle("hidden",!v); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove("show"),2600); }
function escapeHTML(s=""){ return s.replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function getCategoryLabel(id){ for(const g of CATEGORY_GROUPS){ const hit=g.items.find(x=>x[0]===id); if(hit) return hit[1]; } return id; }
function getWord(id){ return catalogMap.get(id) || state.userWords.get(id) || null; }
function pFor(id){ return state.progress.get(id) || {word_id:id,status:"new",difficulty:2,memory_status:"known",favorite:false,repetitions:0,interval_days:0,next_review:null,learned_on:null,correct_count:0,total_count:0,last_direction:null}; }
function activityToday(){ return state.activity.get(localDateISO()) || {activity_date:localDateISO(),completed:false,new_done:0,daily_mix_new_done:0,collection_new_done:0,reviews_done:0,correct_count:0,total_count:0}; }

async function expect(result, label="Supabase"){
  const resolved = await result;
  if(resolved.error) throw new Error(`${label}: ${resolved.error.message}`);
  return resolved.data;
}

async function init(){
  if(!sb){ $("#authView").classList.remove("hidden"); $("#authMsg").textContent="Configuration Supabase manquante."; showLoading(false); return; }
  bindStaticEvents();
  const {data:{session}} = await sb.auth.getSession();
  if(session?.user) await bootUser(session.user); else showAuth();
  sb.auth.onAuthStateChange(async (_event,session2)=>{
    if(session2?.user && (!state.user || state.user.id!==session2.user.id)) await bootUser(session2.user);
  });
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

function showAuth(){
  state.user=null;
  $("#authView").classList.remove("hidden");
  $("#appShell").classList.add("hidden");
  $("#bottomNav").classList.add("hidden");
  showLoading(false);
}

async function bootUser(user){
  showLoading(true);
  try{
    state.user=user;
    await ensureProfile();
    await ensureCategories();
    await refreshAll();
    await loadAvatar();
    $("#authView").classList.add("hidden");
    $("#appShell").classList.remove("hidden");
    $("#bottomNav").classList.remove("hidden");
    go("home");
  }catch(e){
    console.error(e);
    $("#authMsg").textContent=e.message.includes("profiles") ? "La migration V4 doit d’abord être exécutée dans Supabase." : e.message;
    toast(e.message);
  }finally{ showLoading(false); }
}

async function ensureProfile(){
  const data = await expect(await sb.from("profiles").select("*").eq("user_id",state.user.id).maybeSingle(),"Profil");
  if(data){ state.profile=data; return; }
  const emailName=(state.user.email||"Learner").split("@")[0].split(/[._-]/)[0];
  const display=emailName ? emailName.charAt(0).toUpperCase()+emailName.slice(1) : "Learner";
  state.profile = await expect(await sb.from("profiles").insert({user_id:state.user.id,display_name:display}).select().single(),"Création profil");
}
async function ensureCategories(){
  const rows=await expect(await sb.from("user_categories").select("category_id").eq("user_id",state.user.id),"Catégories");
  if(rows.length){ state.selectedCategories=new Set(rows.map(r=>r.category_id)); return; }
  await expect(await sb.from("user_categories").insert(DEFAULT_CATEGORIES.map(category_id=>({user_id:state.user.id,category_id}))),"Catégories par défaut");
  state.selectedCategories=new Set(DEFAULT_CATEGORIES);
}

async function refreshAll(){
  const from60=addDaysISO(localDateISO(),-60);
  const [pr,cols,cw,uw,act,cats,prof] = await Promise.all([
    expect(sb.from("user_progress").select("*").eq("user_id",state.user.id),"Progression"),
    expect(sb.from("collections").select("*").eq("user_id",state.user.id).order("created_at",{ascending:true}),"Collections"),
    expect(sb.from("collection_words").select("*").eq("user_id",state.user.id),"Mots collections"),
    expect(sb.from("user_words").select("*").eq("user_id",state.user.id),"Mots personnels"),
    expect(sb.from("daily_activity").select("*").eq("user_id",state.user.id).gte("activity_date",from60).order("activity_date",{ascending:true}),"Activité"),
    expect(sb.from("user_categories").select("category_id").eq("user_id",state.user.id),"Catégories"),
    expect(sb.from("profiles").select("*").eq("user_id",state.user.id).single(),"Profil")
  ]);
  state.progress=new Map(pr.map(r=>[r.word_id,r]));
  state.collections=cols;
  state.collectionWords=cw;
  state.userWords=new Map(uw.map(r=>[r.word_id,{id:r.word_id,en:r.en,fr:r.fr,category:r.category_id,example:r.example||"",example_fr:r.example_fr||"",normalized_en:r.normalized_en}]));
  state.activity=new Map(act.map(r=>[r.activity_date,r]));
  state.selectedCategories=new Set(cats.map(r=>r.category_id));
  state.profile=prof;
  renderAll();
}

async function loadAvatar(){
  state.avatarUrl=null;
  if(state.profile?.avatar_path){
    const {data,error}=await sb.storage.from("avatars").createSignedUrl(state.profile.avatar_path,3600);
    if(!error) state.avatarUrl=data.signedUrl;
  }
  renderAvatar();
}

function renderAvatar(){
  const name=state.profile?.display_name||"Learner";
  const initial=(name.trim()[0]||"L").toUpperCase();
  for(const el of [$("#topAvatar"),$("#profileAvatar")]){
    if(!el) continue;
    el.innerHTML=state.avatarUrl ? `<img src="${state.avatarUrl}" alt="Photo de profil">` : initial;
  }
}

function bindStaticEvents(){
  $("#loginBtn").onclick=login;
  $("#signupBtn").onclick=signup;
  $$("#bottomNav button").forEach(b=>b.onclick=()=>{ if(b.dataset.target==="learn"){ if(state.session && state.sessionIndex < state.session.length){ go("learn",b); renderStudy(); } else startDailySession(); } else go(b.dataset.target,b); });
  $$('[data-open-memo]').forEach(b=>b.onclick=()=>openMemo(b.dataset.openMemo));
  $("#heroStartBtn").onclick=()=>startDailySession();
  $("#sessionStartBtn").onclick=()=>startDailySession();
  $("#leaveSessionBtn").onclick=()=>go("home");
  $("#searchInput").oninput=renderMemo;
  $$(".filters button").forEach(b=>b.onclick=()=>setMemoFilter(b.dataset.filter,b));
  $("#reviewDifficultBtn").onclick=()=>startDifficultSession();
  $("#newCollectionBtn").onclick=()=>openCollectionModal();
  $("#addWordBtn").onclick=()=>openModal("wordModal");
  $("#editProfileBtn").onclick=()=>openProfileModal();
  $("#editCategoriesBtn").onclick=()=>openCategoriesModal();
  $("#saveProfileBtn").onclick=saveProfile;
  $("#removeAvatarBtn").onclick=removeAvatar;
  $("#saveCategoriesBtn").onclick=saveCategories;
  $("#saveCollectionBtn").onclick=saveCollection;
  $("#archiveCollectionBtn").onclick=archiveCurrentCollection;
  $("#deleteCollectionBtn").onclick=deleteCurrentCollection;
  $("#saveWordBtn").onclick=saveStandaloneWord;
  $("#logoutBtn").onclick=()=>confirmAction("Se déconnecter ?","Es-tu sûre de vouloir te déconnecter de ton compte ?","Se déconnecter",async()=>{ await sb.auth.signOut(); showAuth(); });
  $("#topAvatar").onclick=()=>go("profile");
  $("#wordsPerDaySetting").onclick=openWordsPerDaySetting;
  $("#notificationTimeSetting").onclick=openNotificationTimeSetting;
  $("#writtenToggle").onclick=toggleWrittenExercises;
  $("#notificationToggle").onclick=toggleNotifications;
  $("#notificationTestBtn").onclick=testNotification;
  $$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  $$(".modal").forEach(m=>m.addEventListener("click",e=>{ if(e.target===m) closeModal(m.id); }));
  $("#confirmCancel").onclick=()=>closeModal("confirmModal");
  $("#confirmOk").onclick=async()=>{ const fn=state.confirmHandler; closeModal("confirmModal"); state.confirmHandler=null; if(fn) await fn(); };
  $("#settingSave").onclick=async()=>{ const fn=state.settingSaveHandler; if(fn) await fn(); closeModal("settingModal"); state.settingSaveHandler=null; };
}

async function login(){
  const email=$("#authEmail").value.trim(), password=$("#authPassword").value;
  $("#authMsg").textContent="";
  if(!email||!password){ $("#authMsg").textContent="Entre ton e-mail et ton mot de passe."; return; }
  showLoading(true);
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  showLoading(false);
  if(error){ $("#authMsg").textContent=error.message; return; }
  await bootUser(data.user);
}
async function signup(){
  const email=$("#authEmail").value.trim(), password=$("#authPassword").value;
  if(!email||password.length<6){ $("#authMsg").textContent="Choisis un mot de passe d’au moins 6 caractères."; return; }
  showLoading(true);
  const {data,error}=await sb.auth.signUp({email,password});
  showLoading(false);
  if(error){ $("#authMsg").textContent=error.message; return; }
  $("#authMsg").textContent=data.session ? "Compte créé." : "Compte créé. Confirme ton adresse avec l’e-mail reçu, puis connecte-toi.";
}

function go(id,btn){
  $$(".screen").forEach(s=>s.classList.remove("active"));
  const screen=$("#"+id); if(screen) screen.classList.add("active");
  $$("#bottomNav button").forEach(b=>b.classList.remove("active"));
  const target=btn || $(`#bottomNav button[data-target="${id}"]`); if(target) target.classList.add("active");
  if(id==="home") renderHome(); if(id==="memo") renderMemo(); if(id==="collections") renderCollections(); if(id==="profile") renderProfile();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderAll(){ renderHome(); renderMemo(); renderCollections(); renderProfile(); }

function progressRows(){ return [...state.progress.values()]; }
function masteredCount(){ return progressRows().filter(p=>p.status==="mastered").length; }
function encounteredCount(){ return progressRows().filter(p=>p.learned_on || p.status!=="new").length; }
function reviewBankIds(){ return progressRows().filter(p=>p.memory_status==="review" || Number(p.difficulty)>=3).map(p=>p.word_id).filter(id=>getWord(id)); }
function dueReviewIds(){ const today=localDateISO(); return progressRows().filter(p=>p.learned_on && p.next_review && p.next_review<=today).map(p=>p.word_id).filter(id=>getWord(id)); }
function collectionWordIds(collectionId){ return state.collectionWords.filter(r=>r.collection_id===collectionId).map(r=>r.word_id); }
function collectionMembershipSet(){ return new Set(state.collectionWords.map(r=>r.word_id)); }
function isUnseen(id){ const p=state.progress.get(id); return !p || (!p.learned_on && (p.status==="new" || !p.status)); }

function mixByCategories(items,limit){
  const groups=new Map();
  for(const w of items){ if(!groups.has(w.category)) groups.set(w.category,[]); groups.get(w.category).push(w); }
  const keys=[...groups.keys()].sort();
  if(!keys.length) return [];
  const daySeed=dateFromISO(localDateISO()).getDate()%keys.length;
  const rotated=keys.slice(daySeed).concat(keys.slice(0,daySeed));
  const out=[]; let i=0;
  while(out.length<limit){ let added=false; for(const k of rotated){ const arr=groups.get(k); if(arr[i]){ out.push(arr[i]); added=true; if(out.length>=limit) break; } } if(!added) break; i++; }
  return out;
}
function getDailyMixNewIds(){
  const todayAct=activityToday();
  const target=Number(state.profile?.daily_new_words||3);
  const remaining=Math.max(0,target-Number(todayAct.daily_mix_new_done||0));
  if(!remaining) return [];
  const membership=collectionMembershipSet();
  const standalone=[...state.userWords.values()].filter(w=>!membership.has(w.id) && isUnseen(w.id));
  const selected = CATALOG.filter(w=>state.selectedCategories.has(w.category) && isUnseen(w.id));
  const personalFirst=standalone.sort((a,b)=>a.en.localeCompare(b.en));
  const mixed=mixByCategories(selected,remaining);
  return [...personalFirst.slice(0,remaining), ...mixed].slice(0,remaining).map(w=>w.id);
}

function getCollectionQuota(c, ids){
  const unseen=ids.filter(isUnseen); if(!unseen.length) return 0;
  if(c.learning_mode==="all_now") return unseen.length;
  const learnedToday=ids.filter(id=>state.progress.get(id)?.learned_on===localDateISO()).length;
  let target=Number(c.daily_target||state.profile.daily_new_words||3);
  if(c.learning_mode==="automatic" && c.goal_date){ const days=daysInclusiveUntil(c.goal_date); target=Math.max(1,Math.ceil(unseen.length/days)); }
  return Math.max(0,Math.min(unseen.length,target-learnedToday));
}

function buildDailySession(){
  const items=[]; const seen=new Set(); const active=state.collections.filter(c=>c.status==="active");
  const collectionHasWork = c => { const ids=collectionWordIds(c.id); const q=getCollectionQuota(c,ids); const due=ids.some(id=>state.progress.get(id)?.next_review && state.progress.get(id).next_review<=localDateISO()); const allDaily=c.review_mode==="all_daily" && ids.some(id=>!isUnseen(id)); return q>0 || due || allDaily; };
  const priority=active.filter(c=>c.mode==="priority" && collectionHasWork(c));
  const addItem=(id,kind,sourceType,sourceLabel,collectionId=null)=>{ if(seen.has(id)||!getWord(id)) return; seen.add(id); items.push({id,kind,sourceType,sourceLabel,collectionId}); };

  for(const id of dueReviewIds()) addItem(id,"review","review","Révision");
  for(const c of active.filter(c=>c.review_mode==="all_daily")){
    for(const id of collectionWordIds(c.id)){ if(!isUnseen(id)) addItem(id,"review","review",c.name,c.id); }
  }

  if(priority.length){
    for(const c of priority){ const ids=collectionWordIds(c.id); const unseen=ids.filter(isUnseen); const q=getCollectionQuota(c,ids); unseen.slice(0,q).forEach(id=>addItem(id,"new","collection",c.name,c.id)); }
  }else{
    for(const c of active.filter(c=>c.mode==="complement")){ const ids=collectionWordIds(c.id); const unseen=ids.filter(isUnseen); const q=getCollectionQuota(c,ids); unseen.slice(0,q).forEach(id=>addItem(id,"new","collection",c.name,c.id)); }
    getDailyMixNewIds().forEach(id=>addItem(id,"new","daily","Daily Mix"));
  }
  return items;
}

function buildCollectionSession(collectionId){
  const c=state.collections.find(x=>x.id===collectionId); if(!c) return [];
  const ids=collectionWordIds(c.id); const items=[]; const seen=new Set();
  const add=(id,kind)=>{ if(seen.has(id)||!getWord(id)) return; seen.add(id); items.push({id,kind,sourceType:"collection",sourceLabel:c.name,collectionId:c.id}); };
  if(c.review_mode==="all_daily") ids.filter(id=>!isUnseen(id)).forEach(id=>add(id,"review"));
  else ids.filter(id=>state.progress.get(id)?.next_review && state.progress.get(id).next_review<=localDateISO()).forEach(id=>add(id,"review"));
  const q=getCollectionQuota(c,ids); ids.filter(isUnseen).slice(0,q).forEach(id=>add(id,"new"));
  return items;
}

function renderHome(){
  if(!state.profile) return;
  const daily=buildDailySession();
  const newToday=daily.filter(i=>i.kind==="new").length;
  const reviews=daily.filter(i=>i.kind==="review").length;
  const mastered=masteredCount(); const target=Number(state.profile.daily_new_words||3)*365; const pct=Math.min(100,Math.round(mastered/Math.max(1,target)*100));
  const streak=computeCurrentStreak(), record=computeStreakRecord();
  $("#helloName").textContent=`Hi ${state.profile.display_name}`;
  $("#heroStreak").textContent=streak;
  $("#heroQuote").textContent=`${state.profile.daily_new_words} word${state.profile.daily_new_words>1?"s":""} today. ${target.toLocaleString("en-GB")} in a year.`;
  $("#goalMastered").textContent=mastered; $("#goalTarget").textContent=target.toLocaleString("en-GB"); $("#goalPercent").textContent=pct+"%"; $("#goalBar").style.width=pct+"%";
  $("#heroNew").textContent=`${newToday} nouveau${newToday>1?"x":""}`; $("#heroReviews").textContent=`${reviews} révision${reviews>1?"s":""}`;
  $("#newCount").textContent=newToday;
  $("#reviewCount").textContent=reviewBankIds().length;
  $("#masteredCount").textContent=mastered;
  $("#sessionSummary").textContent=`${newToday} nouveau${newToday>1?"x":""} • ${reviews} révision${reviews>1?"s":""}`;
  $("#sessionMinutes").textContent=`≈ ${Math.max(1,Math.ceil(daily.length*.55))} min`;
  const priority=state.collections.find(c=>c.status==="active"&&c.mode==="priority"); $("#sessionSource").textContent=priority?priority.name:"Daily Mix";
  $("#heroStartBtn").disabled=daily.length===0; $("#sessionStartBtn").disabled=daily.length===0;
  renderWeek(); renderStats();
  $("#weekStreak").textContent=`${streak} jour${streak>1?"s":""}`; $("#streakRecord").textContent=record;
}

function computeCurrentStreak(){
  const done=new Set([...state.activity.values()].filter(a=>a.completed).map(a=>a.activity_date));
  let d=dateFromISO(localDateISO()); if(!done.has(localDateISO())) d.setDate(d.getDate()-1);
  let count=0; while(done.has(localDateISO(d))){ count++; d.setDate(d.getDate()-1); } return count;
}
function computeStreakRecord(){
  const dates=[...new Set([...state.activity.values()].filter(a=>a.completed).map(a=>a.activity_date))].sort();
  let best=0,cur=0,prev=null;
  for(const s of dates){ const d=dateFromISO(s); if(prev && (d-prev)===86400000) cur++; else cur=1; best=Math.max(best,cur); prev=d; } return best;
}
function renderWeek(){
  const today=new Date(); const dow=(today.getDay()+6)%7; const monday=new Date(today); monday.setDate(today.getDate()-dow);
  const labels=["LUN","MAR","MER","JEU","VEN","SAM","DIM"];
  $("#weekCalendar").innerHTML=labels.map((lab,i)=>{ const d=new Date(monday); d.setDate(monday.getDate()+i); const iso=localDateISO(d); const a=state.activity.get(iso); const cls=a?.completed?"done":iso===localDateISO()?"today":""; return `<div class="weekday"><span>${lab}</span><div class="daydot ${cls}">${a?.completed?"":d.getDate()}</div></div>`; }).join("");
}
function last7Dates(){ const out=[]; for(let i=6;i>=0;i--) out.push(addDaysISO(localDateISO(),-i)); return out; }
function renderStats(){
  const dates=last7Dates(); const vals=dates.map(d=>state.activity.get(d)?.total_count||0); const max=Math.max(1,...vals); $("#chart").innerHTML=vals.map(v=>`<div class="bar" style="height:${Math.max(8,Math.round(v/max*100))}%"></div>`).join("");
  const acts=dates.map(d=>state.activity.get(d)).filter(Boolean); const total=acts.reduce((s,a)=>s+Number(a.total_count||0),0), correct=acts.reduce((s,a)=>s+Number(a.correct_count||0),0), learned=acts.reduce((s,a)=>s+Number(a.new_done||0),0);
  $("#weekWords").textContent=`+${learned} words`; $("#successRate").textContent=total?Math.round(correct/total*100)+"%":"0%";
  const cats=new Set(progressRows().filter(p=>p.learned_on).map(p=>getWord(p.word_id)?.category).filter(Boolean)); $("#categoryStat").textContent=cats.size;
}

async function startDailySession(){
  const q=buildDailySession(); if(!q.length){ toast("Ta séance du jour est déjà terminée."); return; }
  state.session=q; state.sessionIndex=0; state.sessionType="daily"; renderStudy(); go("learn");
}
async function startDifficultSession(){
  const ids=reviewBankIds(); if(!ids.length){ toast("Aucun mot difficile pour l’instant."); return; }
  state.session=ids.map(id=>({id,kind:"review",sourceType:"review",sourceLabel:"Mots difficiles"})); state.sessionIndex=0; state.sessionType="difficult"; renderStudy(); go("learn");
}
async function startCollectionSession(id){
  const q=buildCollectionSession(id); if(!q.length){ toast("Rien à travailler dans cette collection aujourd’hui."); return; }
  state.session=q; state.sessionIndex=0; state.sessionType="collection"; renderStudy(); go("learn");
}

function renderStudy(){
  if(!state.session || state.sessionIndex>=state.session.length){ finishSession(); return; }
  const item=state.session[state.sessionIndex], w=getWord(item.id), p=pFor(item.id);
  state.selectedDifficulty=Number(p.difficulty||2); state.lastAnswerCorrect=null;
  const direction=item.kind==="new" ? "en-fr" : ((Number(p.total_count||0)%2===0)?"fr-en":"en-fr");
  const typed=item.kind!=="new" && direction==="fr-en" && state.profile.written_exercises && Number(p.repetitions||0)>=1;
  const prompt=direction==="en-fr"?w.en:w.fr;
  const instruction=direction==="en-fr"?"Trouve le sens en français.":"Retrouve le mot en anglais.";
  $("#learnCounter").textContent=`${state.sessionIndex+1} / ${state.session.length}`;
  $("#learnBar").style.width=`${Math.round((state.sessionIndex)/state.session.length*100)}%`;
  $("#studyCard").innerHTML=`
    <div class="study-top">
      <div><span class="pill">${escapeHTML(item.sourceLabel)} · ${item.kind==="new"?"nouveau":"révision"}</span><div class="word">${escapeHTML(prompt)}</div><p class="muted">${instruction}</p></div>
      <div style="display:flex;gap:8px"><button id="speakBtn" class="speaker" title="Écouter"><svg class="icon"><use href="#i-volume"></use></svg></button><button id="micBtn" class="speaker" title="S’entraîner à prononcer"><svg class="icon"><use href="#i-mic"></use></svg></button></div>
    </div>
    ${typed?`<input id="typedAnswer" class="prompt-input" autocomplete="off" placeholder="Tape ta réponse en anglais…"><button id="checkTypedBtn" class="primary full">Vérifier</button><div id="typedFeedback" class="feedback"></div>`:`<button id="revealBtn" class="primary full">Voir la réponse</button>`}
    <div id="answerBox" class="answer hidden"><strong>${escapeHTML(direction==="en-fr"?w.fr:w.en)}</strong><p><b>${escapeHTML(w.example||"")}</b>${w.example_fr?`<br><span class="muted">${escapeHTML(w.example_fr)}</span>`:""}</p></div>
    <div id="ratingArea" class="hidden">
      <div class="group-title">Difficulté du mot</div><div class="levels">${[1,2,3,4].map((n,i)=>`<button data-difficulty="${n}" class="${n===state.selectedDifficulty?"selected":""}">${["Très facile","Facile","Difficile","Très difficile"][i]}</button>`).join("")}</div>
      <div class="group-title">Mémorisation aujourd’hui</div><div class="memory"><button id="memoryReview" class="again">↻ À revoir</button><button id="memoryKnown" class="know">✓ Je connais</button></div>
      <button id="favStudyBtn" class="secondary fav-btn"><svg class="icon icon-sm" style="${p.favorite?"fill:currentColor":""}"><use href="#i-heart"></use></svg>${p.favorite?" Retirer des favoris":" Ajouter aux favoris"}</button>
    </div>`;
  $("#speakBtn").onclick=()=>speak(w.en);
  $("#micBtn").onclick=()=>practicePronunciation(w.en);
  if(typed){ $("#checkTypedBtn").onclick=()=>checkTypedAnswer(w); $("#typedAnswer").addEventListener("keydown",e=>{ if(e.key==="Enter") checkTypedAnswer(w); }); }
  else $("#revealBtn").onclick=()=>{ state.lastAnswerCorrect=null; revealRating(); };
  $$("[data-difficulty]").forEach(b=>b.onclick=()=>{ state.selectedDifficulty=Number(b.dataset.difficulty); $$("[data-difficulty]").forEach(x=>x.classList.toggle("selected",x===b)); });
  $("#memoryReview").onclick=()=>rateCurrent("review",direction);
  $("#memoryKnown").onclick=()=>rateCurrent("known",direction);
  $("#favStudyBtn").onclick=async()=>{ await toggleFavorite(item.id); renderStudy(); };
}
function revealRating(){ $("#answerBox").classList.remove("hidden"); $("#ratingArea").classList.remove("hidden"); const r=$("#revealBtn"); if(r) r.classList.add("hidden"); const c=$("#checkTypedBtn"); if(c) c.classList.add("hidden"); }
function levenshtein(a,b){ const dp=Array.from({length:b.length+1},(_,i)=>i); for(let i=1;i<=a.length;i++){ let prev=dp[0]; dp[0]=i; for(let j=1;j<=b.length;j++){ const tmp=dp[j]; dp[j]=a[i-1]===b[j-1]?prev:1+Math.min(prev,dp[j],dp[j-1]); prev=tmp; } } return dp[b.length]; }
function checkTypedAnswer(w){
  const input=normalizeEnglish($("#typedAnswer").value), target=normalizeEnglish(w.en), dist=levenshtein(input,target); const fb=$("#typedFeedback");
  if(input===target){ state.lastAnswerCorrect=true; fb.textContent="Correct ✓"; fb.className="feedback good"; }
  else if(target.length>=5 && dist<=1){ state.lastAnswerCorrect=true; fb.textContent="Presque ! Une petite faute de frappe."; fb.className="feedback almost"; }
  else{ state.lastAnswerCorrect=false; fb.textContent="À revoir — regarde la bonne réponse ci-dessous."; fb.className="feedback bad"; }
  revealRating();
}

async function rateCurrent(memory,direction){
  const item=state.session[state.sessionIndex], old=pFor(item.id), reps=Number(old.repetitions||0), currentInterval=Number(old.interval_days||0), difficulty=state.selectedDifficulty;
  let interval,repetitions,status;
  if(memory==="review") { interval=1; repetitions=0; status="learning"; }
  else {
    repetitions=reps+1;
    if(reps===0) interval=({1:7,2:4,3:2,4:1})[difficulty];
    else interval=Math.max(1,Math.round(Math.max(1,currentInterval)*({1:2.4,2:2.0,3:1.5,4:1.2})[difficulty]));
    status=repetitions>=2 ? "mastered" : "learning";
  }
  const correct = state.lastAnswerCorrect===null ? memory==="known" : state.lastAnswerCorrect;
  const row={user_id:state.user.id,word_id:item.id,status,difficulty,memory_status:memory,favorite:Boolean(old.favorite),interval_days:interval,repetitions,next_review:addDaysISO(localDateISO(),interval),last_review:new Date().toISOString(),learned_on:old.learned_on||localDateISO(),correct_count:Number(old.correct_count||0)+(correct?1:0),total_count:Number(old.total_count||0)+1,last_direction:direction,updated_at:new Date().toISOString()};
  await expect(await sb.from("user_progress").upsert(row),"Enregistrement mot"); state.progress.set(item.id,{...old,...row});
  if(state.sessionType!=="difficult") await incrementActivity(item,correct);
  state.sessionIndex++; renderAll(); renderStudy();
}

async function incrementActivity(item,correct){
  const today=localDateISO(), old=activityToday();
  const row={user_id:state.user.id,activity_date:today,completed:Boolean(old.completed),new_done:Number(old.new_done||0)+(item.kind==="new"?1:0),daily_mix_new_done:Number(old.daily_mix_new_done||0)+(item.kind==="new"&&item.sourceType==="daily"?1:0),collection_new_done:Number(old.collection_new_done||0)+(item.kind==="new"&&item.sourceType==="collection"?1:0),reviews_done:Number(old.reviews_done||0)+(item.kind==="review"?1:0),correct_count:Number(old.correct_count||0)+(correct?1:0),total_count:Number(old.total_count||0)+1,updated_at:new Date().toISOString()};
  await expect(await sb.from("daily_activity").upsert(row),"Statistiques"); state.activity.set(today,row);
}
async function finishSession(){
  if(state.sessionType==="daily"){
    const old=activityToday(), row={...old,user_id:state.user.id,activity_date:localDateISO(),completed:true,updated_at:new Date().toISOString()}; await expect(await sb.from("daily_activity").upsert(row),"Fin de séance"); state.activity.set(localDateISO(),row);
  }
  const total=state.session?.length||0, streak=computeCurrentStreak();
  $("#studyCard").innerHTML=`<div style="text-align:center;padding:26px 10px"><div class="logo" style="margin:0 auto 18px"><span>3W</span></div><h2>Day completed</h2><p class="muted">${total} carte${total>1?"s":""} travaillée${total>1?"s":""} aujourd’hui.</p><div class="profile-stats" style="margin:22px 0"><div class="profile-stat"><b>${total}</b><small>cartes</small></div><div class="profile-stat"><b>${streak}</b><small>série actuelle</small></div><div class="profile-stat"><b>${masteredCount()}</b><small>maîtrisés</small></div></div><button id="finishHome" class="primary full">Retour à l’accueil</button><button id="finishHard" class="secondary" style="width:100%;margin-top:9px">Continuer avec mes mots difficiles</button></div>`;
  $("#learnCounter").textContent="✓"; $("#learnBar").style.width="100%"; $("#finishHome").onclick=()=>go("home"); $("#finishHard").onclick=startDifficultSession; renderAll();
}

function speak(text){ if(!("speechSynthesis" in window)){ toast("La synthèse vocale n’est pas disponible ici."); return; } speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text.replace(/^to\s+/i,"")); u.lang=state.profile?.pronunciation_locale||"en-GB"; u.rate=.9; speechSynthesis.speak(u); }
function practicePronunciation(target){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR){ toast("La reconnaissance vocale n’est pas disponible sur ce navigateur."); return; }
  const r=new SR(); r.lang="en-GB"; r.interimResults=false; r.maxAlternatives=1; toast("Je t’écoute…");
  r.onresult=e=>{ const heard=e.results[0][0].transcript; const ok=normalizeEnglish(heard)===normalizeEnglish(target); toast(ok?`Très bien : “${heard}” ✓`:`J’ai entendu “${heard}”. Réessaie si besoin.`); };
  r.onerror=()=>toast("Je n’ai pas réussi à t’entendre correctement."); r.start();
}

async function toggleFavorite(id){
  const old=pFor(id), row={...old,user_id:state.user.id,word_id:id,favorite:!Boolean(old.favorite),updated_at:new Date().toISOString()}; delete row.id;
  await expect(await sb.from("user_progress").upsert(row),"Favoris"); state.progress.set(id,row); renderMemo(); renderHome();
}

function setMemoFilter(filter,btn){ state.memoFilter=filter; $$(".filters button").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); renderMemo(); }
function openMemo(filter){ go("memo"); state.memoFilter=filter; $$(".filters button").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter)); renderMemo(); }
function memoWordIds(){
  const ids=new Set([...state.userWords.keys()]);
  for(const p of progressRows()) if(getWord(p.word_id)) ids.add(p.word_id);
  for(const cw of state.collectionWords) if(getWord(cw.word_id)) ids.add(cw.word_id);
  buildDailySession().filter(i=>i.kind==="new").forEach(i=>ids.add(i.id));
  return [...ids];
}
function renderMemo(){
  if(!state.user) return; const q=normalizeText($("#searchInput")?.value||""); const currentNew=new Set(buildDailySession().filter(i=>i.kind==="new").map(i=>i.id)); let ids=memoWordIds();
  ids=ids.filter(id=>{ const w=getWord(id); if(!w) return false; const p=pFor(id); const text=normalizeText(`${w.en} ${w.fr} ${getCategoryLabel(w.category)}`); if(q&&!text.includes(q)) return false; if(state.memoFilter==="new") return currentNew.has(id) || (!p.learned_on && p.status==="new"); if(state.memoFilter==="review") return p.memory_status==="review" || Number(p.difficulty)>=3; if(state.memoFilter==="mastered") return p.status==="mastered"; if(state.memoFilter==="fav") return Boolean(p.favorite); return true; });
  ids.sort((a,b)=>getWord(a).en.localeCompare(getWord(b).en,"en"));
  $("#wordlist").innerHTML=ids.length?ids.map(id=>{ const w=getWord(id),p=pFor(id); return `<div class="worditem"><div><b>${escapeHTML(w.en)}</b><small>${escapeHTML(w.fr)}</small></div><div class="word-actions"><span class="tag">${escapeHTML(getCategoryLabel(w.category))}</span><button class="heart-btn ${p.favorite?"active":""}" data-fav="${id}"><svg class="icon icon-sm"><use href="#i-heart"></use></svg></button></div></div>`; }).join(""):`<div class="card"><b>Aucun mot ici pour l’instant.</b><p class="muted" style="margin-bottom:0">Ta liste apparaîtra ici au fur et à mesure.</p></div>`;
  $$('[data-fav]').forEach(b=>b.onclick=()=>toggleFavorite(b.dataset.fav));
}

function renderCollections(){
  if(!state.user) return; const active=state.collections.filter(c=>c.status==="active"), archived=state.collections.filter(c=>c.status==="archived");
  const daily=`<div class="collection locked"><div class="collection-icon"><svg class="icon"><use href="#i-spark"></use></svg></div><h3>Daily Mix</h3><small>${state.profile.daily_new_words} mot${state.profile.daily_new_words>1?"s":""}/jour · ${state.selectedCategories.size} catégories</small><div class="mini"><i style="width:${Math.min(100,masteredCount()/Math.max(1,state.profile.daily_new_words*365)*100)}%"></i></div><div class="collection-actions"><button class="secondary" data-nav-profile>Personnaliser</button><button class="primary" data-start-daily>Apprendre</button></div></div>`;
  const custom=active.map(c=>collectionCard(c)).join(""); $("#collectionsGrid").innerHTML=daily+custom;
  $$('[data-nav-profile]').forEach(b=>b.onclick=()=>go("profile")); $$('[data-start-daily]').forEach(b=>b.onclick=startDailySession); $$('[data-edit-col]').forEach(b=>b.onclick=()=>openCollectionModal(b.dataset.editCol)); $$('[data-start-col]').forEach(b=>b.onclick=()=>startCollectionSession(b.dataset.startCol));
  $("#archivedArea").classList.toggle("hidden",!archived.length); $("#archivedCollections").innerHTML=archived.map(c=>`<div class="worditem"><div><b>${escapeHTML(c.name)}</b><small>Collection archivée</small></div><button class="secondary" data-restore="${c.id}">Réactiver</button></div>`).join(""); $$('[data-restore]').forEach(b=>b.onclick=()=>restoreCollection(b.dataset.restore));
}
function collectionCard(c){
  const ids=collectionWordIds(c.id), mastered=ids.filter(id=>state.progress.get(id)?.status==="mastered").length, pct=ids.length?Math.round(mastered/ids.length*100):0;
  return `<div class="collection"><div class="collection-icon" style="background:linear-gradient(145deg,${c.mode==="priority"?"#e34858,#f08a96":"#2457f5,#6b8cff"})"><svg class="icon"><use href="#i-collection"></use></svg></div><h3>${escapeHTML(c.name)}</h3><small>${c.mode==="priority"?"Priorité":"Complément"} · ${ids.length} mot${ids.length>1?"s":""}${c.goal_date?` · ${escapeHTML(c.goal_date)}`:""}</small><div class="mini"><i style="width:${pct}%"></i></div><div class="collection-actions"><button class="secondary" data-edit-col="${c.id}">Modifier</button><button class="primary" data-start-col="${c.id}">Travailler</button></div></div>`;
}

function openCollectionModal(id=null){
  const c=id?state.collections.find(x=>x.id===id):null; $("#editingCollectionId").value=c?.id||""; $("#collectionModalTitle").textContent=c?"Modifier la collection":"Nouvelle collection"; $("#collectionName").value=c?.name||""; $("#collectionMode").value=c?.mode||"complement"; $("#collectionLearningMode").value=c?.learning_mode||"automatic"; $("#collectionReviewMode").value=c?.review_mode||"smart"; $("#collectionGoalDate").value=c?.goal_date||""; $("#collectionDailyTarget").value=c?.daily_target||"";
  $("#archiveCollectionBtn").classList.toggle("hidden",!c); $("#deleteCollectionBtn").classList.toggle("hidden",!c);
  if(c){ $("#collectionWordsText").value=collectionWordIds(c.id).map(id=>{ const w=getWord(id); return w?`${w.en} = ${w.fr}`:""; }).filter(Boolean).join("\n"); } else $("#collectionWordsText").value="";
  openModal("collectionModal");
}
function parseWordLines(text){
  const lines=text.split(/\n+/).map(s=>s.trim()).filter(Boolean); return lines.map(line=>{ const parts=line.split(/\s*[=;\t]\s*/); if(parts.length<2||!parts[0]||!parts.slice(1).join(" ").trim()) throw new Error(`Ligne à corriger : “${line}”. Utilise anglais = français.`); return {en:parts[0].trim(),fr:parts.slice(1).join(" = ").trim()}; });
}
async function resolveWordId(en,fr,category="conversation"){
  const n=normalizeEnglish(en); const catalog=CATALOG.find(w=>normalizeEnglish(w.en)===n); if(catalog) return catalog.id;
  const existing=[...state.userWords.values()].find(w=>w.normalized_en===n); if(existing) return existing.id;
  const word_id=`custom-${crypto.randomUUID()}`; const row={user_id:state.user.id,word_id,normalized_en:n,en,fr,category_id:category}; await expect(await sb.from("user_words").insert(row),"Ajout mot personnel"); state.userWords.set(word_id,{id:word_id,en,fr,category,example:"",example_fr:"",normalized_en:n}); return word_id;
}
async function saveCollection(){
  try{
    const id=$("#editingCollectionId").value||null, name=$("#collectionName").value.trim(); if(!name) throw new Error("Donne un nom à la collection.");
    const payload={user_id:state.user.id,name,mode:$("#collectionMode").value,learning_mode:$("#collectionLearningMode").value,review_mode:$("#collectionReviewMode").value,goal_date:$("#collectionGoalDate").value||null,daily_target:Number($("#collectionDailyTarget").value)||null,updated_at:new Date().toISOString()};
    let collection;
    if(id) collection=await expect(await sb.from("collections").update(payload).eq("id",id).eq("user_id",state.user.id).select().single(),"Modification collection");
    else collection=await expect(await sb.from("collections").insert(payload).select().single(),"Création collection");
    const parsed=parseWordLines($("#collectionWordsText").value);
    const ids=[]; for(const w of parsed) ids.push(await resolveWordId(w.en,w.fr));
    await expect(await sb.from("collection_words").delete().eq("collection_id",collection.id).eq("user_id",state.user.id),"Mise à jour mots");
    if(ids.length) await expect(await sb.from("collection_words").insert([...new Set(ids)].map(word_id=>({collection_id:collection.id,user_id:state.user.id,word_id}))),"Ajout mots collection");
    closeModal("collectionModal"); await refreshAll(); go("collections"); toast("Collection enregistrée.");
  }catch(e){ toast(e.message); }
}
async function archiveCurrentCollection(){ const id=$("#editingCollectionId").value; if(!id) return; await expect(await sb.from("collections").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id),"Archivage"); closeModal("collectionModal"); await refreshAll(); toast("Collection archivée. Tes mots restent dans Mémo."); }
async function restoreCollection(id){ await expect(await sb.from("collections").update({status:"active",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id),"Réactivation"); await refreshAll(); }
function deleteCurrentCollection(){ const id=$("#editingCollectionId").value; if(!id) return; confirmAction("Supprimer cette collection ?","Les mots déjà appris resteront dans ton Mémo et ta progression. Seule la collection sera supprimée.","Supprimer",async()=>{ await expect(await sb.from("collections").delete().eq("id",id).eq("user_id",state.user.id),"Suppression"); closeModal("collectionModal"); await refreshAll(); toast("Collection supprimée."); }); }

function populateWordCategory(){ $("#wordCategory").innerHTML=CATEGORY_GROUPS.flatMap(g=>g.items).map(([id,label])=>`<option value="${id}">${escapeHTML(label)}</option>`).join(""); }
async function saveStandaloneWord(){
  try{ const en=$("#wordEn").value.trim(),fr=$("#wordFr").value.trim(); if(!en||!fr) throw new Error("Entre le mot anglais et sa traduction française."); const id=await resolveWordId(en,fr,$("#wordCategory").value); if(id.startsWith("custom-")){ const row=state.userWords.get(id); row.example=$("#wordExample").value.trim(); row.example_fr=$("#wordExampleFr").value.trim(); await expect(await sb.from("user_words").update({example:row.example||null,example_fr:row.example_fr||null,category_id:$("#wordCategory").value}).eq("user_id",state.user.id).eq("word_id",id),"Exemple mot"); }
    closeModal("wordModal"); $("#wordEn").value=$("#wordFr").value=$("#wordExample").value=$("#wordExampleFr").value=""; await refreshAll(); go("memo"); toast("Mot ajouté à ton Mémo et à ta file d’apprentissage.");
  }catch(e){ toast(e.message); }
}

function renderProfile(){
  if(!state.profile) return; const streak=computeCurrentStreak(),record=computeStreakRecord(); $("#profileName").textContent=state.profile.display_name; $("#memberSince").textContent=`Member since ${formatMonthYear(state.profile.created_at)}`; $("#profileMastered").textContent=masteredCount(); $("#profileStreak").textContent=streak; $("#profileRecord").textContent=record; $("#dailyWordsValue").textContent=state.profile.daily_new_words; $("#writtenToggle").classList.toggle("on",Boolean(state.profile.written_exercises)); $("#notificationToggle").classList.toggle("on",Boolean(state.profile.notifications_enabled)); $("#notificationTimeSetting").classList.toggle("hidden",!state.profile.notifications_enabled); const t=(state.profile.notification_time||"19:00").slice(0,5); $("#notificationTimeValue").textContent=t; $("#notificationSettingText").textContent=state.profile.notifications_enabled?`Rappel souhaité à ${t}`:"Rappel désactivé"; renderAvatar();
  $("#profileCategoryChips").innerHTML=[...state.selectedCategories].map(id=>`<span class="meta-chip">${escapeHTML(getCategoryLabel(id))}</span>`).join("");
}
function openProfileModal(){ $("#profileNameInput").value=state.profile.display_name; $("#avatarFileInput").value=""; openModal("profileModal"); }
async function saveProfile(){
  try{ const name=$("#profileNameInput").value.trim()||"Learner"; let avatar_path=state.profile.avatar_path; const file=$("#avatarFileInput").files[0]; if(file){ const ext=(file.name.split(".").pop()||"jpg").toLowerCase(); const path=`${state.user.id}/avatar-${Date.now()}.${ext}`; await expect(await sb.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type||undefined}),"Photo de profil"); if(avatar_path) await sb.storage.from("avatars").remove([avatar_path]); avatar_path=path; }
    await expect(await sb.from("profiles").update({display_name:name,avatar_path,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Profil"); closeModal("profileModal"); await refreshAll(); await loadAvatar(); toast("Profil mis à jour.");
  }catch(e){ toast(e.message); }
}
async function removeAvatar(){ try{ if(state.profile.avatar_path) await sb.storage.from("avatars").remove([state.profile.avatar_path]); await expect(await sb.from("profiles").update({avatar_path:null,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Avatar"); state.profile.avatar_path=null; state.avatarUrl=null; closeModal("profileModal"); renderAvatar(); toast("Avatar avec initiale réactivé."); }catch(e){toast(e.message);} }

function openCategoriesModal(){
  $("#categoryGroups").innerHTML=CATEGORY_GROUPS.map(g=>`<div class="category-group"><h3>${escapeHTML(g.group)}</h3><div class="cat-grid">${g.items.map(([id,label])=>`<button class="cat ${state.selectedCategories.has(id)?"selected":""}" data-cat="${id}">${escapeHTML(label)}</button>`).join("")}</div></div>`).join(""); $$('[data-cat]').forEach(b=>b.onclick=()=>b.classList.toggle("selected")); openModal("categoriesModal");
}
async function saveCategories(){ const selected=$$('[data-cat].selected').map(b=>b.dataset.cat); if(!selected.length){ toast("Choisis au moins une catégorie."); return; } showLoading(true); try{ await expect(await sb.from("user_categories").delete().eq("user_id",state.user.id),"Catégories"); await expect(await sb.from("user_categories").insert(selected.map(category_id=>({user_id:state.user.id,category_id}))),"Catégories"); closeModal("categoriesModal"); await refreshAll(); toast("Catégories mises à jour."); }catch(e){toast(e.message);}finally{showLoading(false);} }

async function updateProfileField(patch){ await expect(await sb.from("profiles").update({...patch,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Réglage profil"); state.profile={...state.profile,...patch}; renderAll(); }
function openWordsPerDaySetting(){ $("#settingTitle").textContent="Nouveaux mots par jour"; $("#settingContent").innerHTML=`<p class="muted">3 reste la valeur par défaut, mais tu peux choisir ton propre rythme.</p><input id="settingNumber" class="input" type="number" min="1" max="30" value="${state.profile.daily_new_words}">`; state.settingSaveHandler=async()=>{ const n=Math.max(1,Math.min(30,Number($("#settingNumber").value)||3)); await updateProfileField({daily_new_words:n}); toast("Le nouveau rythme s’appliquera à la prochaine séance."); }; openModal("settingModal"); }
function openNotificationTimeSetting(){ $("#settingTitle").textContent="Heure du rappel"; $("#settingContent").innerHTML=`<input id="settingTime" class="input" type="time" value="${(state.profile.notification_time||"19:00").slice(0,5)}"><p class="muted">L’heure est enregistrée dans ton profil. Le push automatique quotidien sera activé dans l’étape notifications.</p>`; state.settingSaveHandler=async()=>{ await updateProfileField({notification_time:$("#settingTime").value||"19:00"}); toast("Heure enregistrée."); }; openModal("settingModal"); }
async function toggleWrittenExercises(){ await updateProfileField({written_exercises:!state.profile.written_exercises}); }
async function toggleNotifications(){
  const enabling=!state.profile.notifications_enabled;
  if(enabling && "Notification" in window){ const perm=await Notification.requestPermission(); if(perm!=="granted"){ toast("Autorisation de notification non accordée."); return; } }
  await updateProfileField({notifications_enabled:enabling}); if(enabling) toast("Notifications activées dans ton profil.");
}
async function testNotification(){
  if(!state.profile?.notifications_enabled){ toast("Active d’abord les notifications dans Profil."); return; }
  if(!("Notification" in window) || Notification.permission!=="granted"){ toast("Les notifications ne sont pas autorisées sur cet appareil."); return; }
  const reg=await navigator.serviceWorker?.ready; if(reg) reg.showNotification("3 Words a Day",{body:"Tes mots t’attendent — petite séance, gros progrès.",icon:"icon-192.png",badge:"icon-192.png"}); else new Notification("3 Words a Day",{body:"Tes mots t’attendent."});
}

function openModal(id){ $("#"+id).classList.add("show"); }
function closeModal(id){ $("#"+id).classList.remove("show"); }
function confirmAction(title,text,okLabel,handler){ $("#confirmTitle").textContent=title; $("#confirmText").textContent=text; $("#confirmOk").textContent=okLabel; state.confirmHandler=handler; openModal("confirmModal"); }

populateWordCategory();
init().catch(e=>{ console.error(e); toast(e.message); showLoading(false); });
