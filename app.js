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
  customThemes:[], themeWords:[],
  session:null, sessionIndex:0, sessionType:"daily", sessionResults:[], lastAnswerCorrect:null,
  settingSaveHandler:null, confirmHandler:null, recoveryMode:false,
  pendingWordSenses:[], translatorPayload:null, importedWordMeta:new Map(), photoDetectedWords:[], generatedThemeWords:[],
  themeForOnboarding:false, selectedBonusCount:3,
  onboarding:{step:0,categories:new Set(),dailyWords:3,dailyMinutes:5,notifications:false,time:"19:00"},
  crop:null
};

function localDateISO(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function dateFromISO(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDaysISO(s,days){ const d=dateFromISO(s); d.setDate(d.getDate()+days); return localDateISO(d); }
function daysInclusiveUntil(goal){ if(!goal) return null; const a=dateFromISO(localDateISO()), b=dateFromISO(goal); return Math.max(1,Math.floor((b-a)/86400000)+1); }
function formatMonthYear(iso){ const d=new Date(iso); return new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric"}).format(d); }
function normalizeText(s=""){
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-z0-9'\s-]/g," ").replace(/\s+/g," ").trim();
}
function normalizeEnglish(s=""){ return normalizeText(s).replace(/^to\s+/,""); }
function slugify(s=""){ return normalizeText(s).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function showLoading(v){ $("#loading").classList.toggle("hidden",!v); }
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove("show"),3000); }
function escapeHTML(s=""){ return String(s).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function appBaseUrl(){ return new URL("./",window.location.href).href.split("?")[0].split("#")[0]; }
function themeCategoryId(id){ return `theme:${id}`; }
function themeIdFromCategory(id){ return String(id||"").startsWith("theme:") ? String(id).slice(6) : null; }
function getThemeByCategory(id){ const tid=themeIdFromCategory(id); return tid ? state.customThemes.find(t=>t.id===tid) : null; }
function getCategoryLabel(id){ const t=getThemeByCategory(id); if(t) return t.name; for(const g of CATEGORY_GROUPS){ const hit=g.items.find(x=>x[0]===id); if(hit) return hit[1]; } return id||"Autre"; }
function getWord(id){ return state.userWords.get(id) || catalogMap.get(id) || null; }
function getSenses(w){
  if(!w) return [];
  const arr=Array.isArray(w.senses)?w.senses:[];
  if(arr.length) return arr.map(s=>({fr:s.fr||w.fr||"",example_en:s.example_en||s.example||"",example_fr:s.example_fr||""})).filter(s=>s.fr);
  return [{fr:w.fr||"",example_en:w.example||"",example_fr:w.example_fr||""}];
}
function pFor(id){ return state.progress.get(id) || {word_id:id,status:"new",difficulty:2,memory_status:"known",favorite:false,repetitions:0,interval_days:0,next_review:null,learned_on:null,correct_count:0,total_count:0,last_direction:null,mastery_score:20,sense_progress:{},queued:false}; }
function activityToday(){ return state.activity.get(localDateISO()) || {activity_date:localDateISO(),completed:false,new_done:0,daily_mix_new_done:0,collection_new_done:0,bonus_new_done:0,reviews_done:0,correct_count:0,total_count:0}; }

async function expect(result,label="Supabase"){
  const resolved=await result;
  if(resolved.error) throw new Error(`${label}: ${resolved.error.message}`);
  return resolved.data;
}

async function init(){
  if(!sb){ $("#authView").classList.remove("hidden"); $("#authMsg").textContent="Configuration Supabase manquante."; showLoading(false); return; }
  bindStaticEvents();
  const params=new URLSearchParams(location.search);
  state.recoveryMode=params.get("auth")==="reset";
  const {data:{session}}=await sb.auth.getSession();
  if(state.recoveryMode){ showPasswordResetForm(); }
  else if(session?.user) await bootUser(session.user);
  else showAuth();
  sb.auth.onAuthStateChange(async (event,session2)=>{
    if(event==="PASSWORD_RECOVERY"){
      state.recoveryMode=true; showPasswordResetForm(); return;
    }
    if(session2?.user && !state.recoveryMode && (!state.user || state.user.id!==session2.user.id)) await bootUser(session2.user);
    if(event==="SIGNED_OUT" && !state.recoveryMode) showAuth();
  });
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=5.0").catch(()=>{});
}

function hideAuthPanels(){ ["authLanding","loginForm","signupForm","confirmEmailView","passwordResetRequest","passwordResetForm"].forEach(id=>$("#"+id)?.classList.add("hidden")); }
function showAuthPanel(id){ hideAuthPanels(); $("#"+id)?.classList.remove("hidden"); $("#authMsg").textContent=""; }
function showAuth(){
  state.user=null; state.recoveryMode=false;
  $("#authView").classList.remove("hidden"); $("#onboardingView").classList.add("hidden"); $("#appShell").classList.add("hidden"); $("#bottomNav").classList.add("hidden");
  showAuthPanel("authLanding"); showLoading(false);
}
function showPasswordResetForm(){
  $("#authView").classList.remove("hidden"); $("#onboardingView").classList.add("hidden"); $("#appShell").classList.add("hidden"); $("#bottomNav").classList.add("hidden");
  showAuthPanel("passwordResetForm"); showLoading(false);
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
    if(!state.profile.onboarding_completed){ startOnboarding(); }
    else showApp();
    if(new URLSearchParams(location.search).get("auth")==="confirmed"){
      toast("Adresse e-mail confirmée ✓"); history.replaceState({},"",appBaseUrl());
    }
  }catch(e){
    console.error(e);
    $("#authMsg").textContent=/onboarding_completed|mastery_score|custom_themes|bonus_new_done|senses|queued/i.test(e.message) ? "La migration V5 doit d’abord être exécutée dans Supabase." : e.message;
    toast($("#authMsg").textContent);
  }finally{ showLoading(false); }
}
function showApp(){
  $("#onboardingView").classList.add("hidden"); $("#authView").classList.add("hidden"); $("#appShell").classList.remove("hidden"); $("#bottomNav").classList.remove("hidden"); go("home");
}
async function ensureProfile(){
  const data=await expect(sb.from("profiles").select("*").eq("user_id",state.user.id).maybeSingle(),"Profil");
  if(data){ state.profile=data; return; }
  const metaName=state.user.user_metadata?.display_name;
  const emailName=(state.user.email||"Learner").split("@")[0].split(/[._-]/)[0];
  const display=metaName || (emailName?emailName.charAt(0).toUpperCase()+emailName.slice(1):"Learner");
  state.profile=await expect(sb.from("profiles").insert({user_id:state.user.id,display_name:display}).select().single(),"Création profil");
}
async function ensureCategories(){
  const rows=await expect(sb.from("user_categories").select("category_id").eq("user_id",state.user.id),"Catégories");
  state.selectedCategories=new Set(rows.map(r=>r.category_id));
}
async function refreshAll(){
  const from60=addDaysISO(localDateISO(),-60);
  const [pr,cols,cw,uw,act,cats,prof,themes,tw]=await Promise.all([
    expect(sb.from("user_progress").select("*").eq("user_id",state.user.id),"Progression"),
    expect(sb.from("collections").select("*").eq("user_id",state.user.id).order("created_at",{ascending:true}),"Collections"),
    expect(sb.from("collection_words").select("*").eq("user_id",state.user.id),"Mots collections"),
    expect(sb.from("user_words").select("*").eq("user_id",state.user.id),"Mots personnels"),
    expect(sb.from("daily_activity").select("*").eq("user_id",state.user.id).gte("activity_date",from60).order("activity_date",{ascending:true}),"Activité"),
    expect(sb.from("user_categories").select("category_id").eq("user_id",state.user.id),"Catégories"),
    expect(sb.from("profiles").select("*").eq("user_id",state.user.id).single(),"Profil"),
    expect(sb.from("custom_themes").select("*").eq("user_id",state.user.id).order("created_at",{ascending:true}),"Thèmes"),
    expect(sb.from("custom_theme_words").select("*").eq("user_id",state.user.id),"Mots des thèmes")
  ]);
  state.progress=new Map(pr.map(r=>[r.word_id,{...r,sense_progress:r.sense_progress||{}}]));
  state.collections=cols; state.collectionWords=cw;
  state.userWords=new Map(uw.map(r=>[r.word_id,{id:r.word_id,en:r.en,fr:r.fr,category:r.category_id,example:r.example||"",example_fr:r.example_fr||"",normalized_en:r.normalized_en,senses:Array.isArray(r.senses)?r.senses:[],source:r.source||"manual"}]));
  state.activity=new Map(act.map(r=>[r.activity_date,r])); state.selectedCategories=new Set(cats.map(r=>r.category_id)); state.profile=prof; state.customThemes=themes; state.themeWords=tw;
  populateWordCategory(); renderAll();
}
async function loadAvatar(){
  state.avatarUrl=null;
  if(state.profile?.avatar_path){ const {data,error}=await sb.storage.from("avatars").createSignedUrl(state.profile.avatar_path,3600); if(!error) state.avatarUrl=data.signedUrl; }
  renderAvatar();
}
function renderAvatar(){
  const name=state.profile?.display_name||"Learner", initial=(name.trim()[0]||"L").toUpperCase();
  for(const el of [$("#topAvatar"),$("#profileAvatar")]){ if(!el) continue; el.innerHTML=state.avatarUrl?`<img src="${state.avatarUrl}" alt="Photo de profil">`:initial; }
}

function bindStaticEvents(){
  $("#showLoginBtn").onclick=()=>showAuthPanel("loginForm"); $("#showSignupBtn").onclick=()=>showAuthPanel("signupForm");
  $$('[data-auth-back]').forEach(b=>b.onclick=()=>showAuthPanel("authLanding")); $$('[data-auth-back-login]').forEach(b=>b.onclick=()=>showAuthPanel("loginForm"));
  $("#loginBtn").onclick=login; $("#signupBtn").onclick=signup; $("#forgotPasswordBtn").onclick=()=>{ $("#resetEmail").value=$("#loginEmail").value.trim(); showAuthPanel("passwordResetRequest"); };
  $("#sendResetBtn").onclick=sendPasswordReset; $("#saveNewPasswordBtn").onclick=saveNewPassword; $("#confirmBackLogin").onclick=()=>showAuthPanel("loginForm");
  $("#onboardBackBtn").onclick=()=>{ if(state.onboarding.step>0){ state.onboarding.step--; renderOnboarding(); } }; $("#onboardNextBtn").onclick=advanceOnboarding;
  $$("#bottomNav button").forEach(b=>b.onclick=()=>{ if(b.dataset.target==="learn"){ if(state.session&&state.sessionIndex<state.session.length){ go("learn",b); renderStudy(); } else handleHomeStart(); } else go(b.dataset.target,b); });
  $$('[data-open-memo]').forEach(b=>b.onclick=()=>openMemo(b.dataset.openMemo));
  $("#heroStartBtn").onclick=handleHomeStart; $("#sessionStartBtn").onclick=handleHomeStart; $("#leaveSessionBtn").onclick=()=>go("home");
  $("#searchInput").oninput=renderMemo; $$(".filters button").forEach(b=>b.onclick=()=>setMemoFilter(b.dataset.filter,b)); $("#reviewDifficultBtn").onclick=startDifficultSession;
  $("#newCollectionBtn").onclick=()=>openCollectionModal(); $("#collectionPhotoInput").onchange=e=>{ const f=e.target.files?.[0]; if(f) importVocabularyPhoto(f); e.target.value=""; };
  $("#addWordBtn").onclick=()=>{ state.pendingWordSenses=[]; renderWordSensePreview(); openModal("wordModal"); }; $("#smartCompleteWordBtn").onclick=smartCompleteWord; $("#saveWordBtn").onclick=saveStandaloneWord;
  $("#translatorBtn").onclick=()=>{ $("#translatorInput").value=""; $("#translatorResult").classList.add("hidden"); openModal("translatorModal"); }; $("#translateBtn").onclick=translateText;
  $("#editProfileBtn").onclick=openProfileModal; $("#editCategoriesBtn").onclick=openCategoriesModal; $("#saveProfileBtn").onclick=saveProfile; $("#removeAvatarBtn").onclick=removeAvatar;
  $("#avatarFileInput").onchange=e=>{ const f=e.target.files?.[0]; if(f) setupAvatarCrop(f); }; $("#avatarZoom").oninput=e=>{ if(state.crop){ state.crop.zoom=Number(e.target.value); drawCrop(); } }; $("#rotateAvatarBtn").onclick=()=>{ if(state.crop){ state.crop.rotation=(state.crop.rotation+90)%360; drawCrop(); } };
  bindCropDrag();
  $("#saveCategoriesBtn").onclick=saveCategories; $("#createThemeBtn").onclick=()=>openThemeModal(false); $("#themeCount").onchange=()=>$("#themeCountOther").classList.toggle("hidden",$("#themeCount").value!=="other"); $("#generateThemeBtn").onclick=generateTheme;
  $("#saveCollectionBtn").onclick=saveCollection; $("#archiveCollectionBtn").onclick=archiveCurrentCollection; $("#deleteCollectionBtn").onclick=deleteCurrentCollection; $("#acceptPhotoWordsBtn").onclick=acceptPhotoWords;
  $("#logoutBtn").onclick=()=>confirmAction("Se déconnecter ?","Es-tu sûre de vouloir te déconnecter de ton compte ?","Se déconnecter",async()=>{ await sb.auth.signOut(); showAuth(); });
  $("#topAvatar").onclick=()=>go("profile"); $("#wordsPerDaySetting").onclick=openWordsPerDaySetting; $("#dailyMinutesSetting").onclick=openDailyMinutesSetting; $("#notificationTimeSetting").onclick=openNotificationTimeSetting; $("#writtenToggle").onclick=toggleWrittenExercises; $("#notificationToggle").onclick=toggleNotifications; $("#notificationTestBtn").onclick=testNotification;
  $$('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close)); $$(".modal").forEach(m=>m.addEventListener("click",e=>{ if(e.target===m) closeModal(m.id); }));
  $("#confirmCancel").onclick=()=>closeModal("confirmModal"); $("#confirmOk").onclick=async()=>{ const fn=state.confirmHandler; closeModal("confirmModal"); state.confirmHandler=null; if(fn) await fn(); };
  $("#settingSave").onclick=async()=>{ const fn=state.settingSaveHandler; if(fn) await fn(); closeModal("settingModal"); state.settingSaveHandler=null; };
  $("#startBonusBtn").onclick=()=>{ closeModal("bonusModal"); startBonusSession(state.selectedBonusCount); };
}

async function login(){
  const email=$("#loginEmail").value.trim(), password=$("#loginPassword").value; $("#authMsg").textContent="";
  if(!email||!password){ $("#authMsg").textContent="Entre ton e-mail et ton mot de passe."; return; }
  showLoading(true); const {data,error}=await sb.auth.signInWithPassword({email,password}); showLoading(false); if(error){ $("#authMsg").textContent=error.message; return; } await bootUser(data.user);
}
async function signup(){
  const name=$("#signupName").value.trim(), email=$("#signupEmail").value.trim(), password=$("#signupPassword").value, password2=$("#signupPassword2").value; $("#authMsg").textContent="";
  if(!name){ $("#authMsg").textContent="Choisis un prénom ou un pseudo."; return; } if(!email){ $("#authMsg").textContent="Entre ton adresse e-mail."; return; } if(password.length<6){ $("#authMsg").textContent="Choisis un mot de passe d’au moins 6 caractères."; return; } if(password!==password2){ $("#authMsg").textContent="Les deux mots de passe ne correspondent pas."; return; }
  showLoading(true); const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:`${appBaseUrl()}?auth=confirmed`}}); showLoading(false); if(error){ $("#authMsg").textContent=error.message; return; }
  if(data.session) await bootUser(data.user); else showAuthPanel("confirmEmailView");
}
async function sendPasswordReset(){
  const email=$("#resetEmail").value.trim(); if(!email){ $("#authMsg").textContent="Entre ton adresse e-mail."; return; }
  showLoading(true); const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:`${appBaseUrl()}?auth=reset`}); showLoading(false); if(error){ $("#authMsg").textContent=error.message; return; } $("#authMsg").style.color="var(--green)"; $("#authMsg").textContent="Lien envoyé. Regarde ta boîte mail.";
}
async function saveNewPassword(){
  const p1=$("#newPassword").value,p2=$("#newPassword2").value; if(p1.length<6){ $("#authMsg").textContent="Choisis au moins 6 caractères."; return; } if(p1!==p2){ $("#authMsg").textContent="Les deux mots de passe ne correspondent pas."; return; }
  showLoading(true); const {error}=await sb.auth.updateUser({password:p1}); if(!error) await sb.auth.signOut(); showLoading(false); if(error){ $("#authMsg").textContent=error.message; return; } state.recoveryMode=false; history.replaceState({},"",appBaseUrl()); showAuthPanel("loginForm"); $("#authMsg").style.color="var(--green)"; $("#authMsg").textContent="Mot de passe modifié. Tu peux te connecter.";
}

function startOnboarding(){
  state.onboarding={step:0,categories:new Set(state.selectedCategories),dailyWords:Number(state.profile.daily_new_words||3),dailyMinutes:Number(state.profile.daily_minutes||5),notifications:Boolean(state.profile.notifications_enabled),time:(state.profile.notification_time||"19:00").slice(0,5)};
  $("#appShell").classList.add("hidden"); $("#bottomNav").classList.add("hidden"); $("#onboardingView").classList.remove("hidden"); renderOnboarding();
}
function renderOnboarding(){
  const o=state.onboarding, steps=4; $("#onboardBar").style.width=`${((o.step+1)/steps)*100}%`; $("#onboardBackBtn").classList.toggle("hidden",o.step===0); $("#onboardNextBtn").textContent=o.step===steps-1?"Préparer mon Daily Mix":"Continuer";
  if(o.step===0){
    $("#onboardContent").innerHTML=`<div class="eyebrow">ÉTAPE 1/4</div><h2>Qu’est-ce que tu veux apprendre ?</h2><p class="muted">Choisis au moins une catégorie. Rien n’est sélectionné à ta place.</p>${renderCategoryGroupsHTML(o.categories,true)}<div class="custom-theme-cta"><div><b>Tu as un sujet précis ?</b><small>Aviation, mécanique, jardinage… l’application peut créer le vocabulaire.</small></div><button id="onboardThemeBtn" class="secondary">✨ Créer mon thème</button></div>`;
    $$('[data-oncat]').forEach(b=>b.onclick=()=>{ const id=b.dataset.oncat; if(o.categories.has(id)) o.categories.delete(id); else o.categories.add(id); b.classList.toggle("selected"); }); $("#onboardThemeBtn").onclick=()=>openThemeModal(true);
  }else if(o.step===1){
    $("#onboardContent").innerHTML=`<div class="eyebrow">ÉTAPE 2/4</div><h2>Combien de nouveaux mots par jour ?</h2><p class="muted"><b>3</b> est le rythme conseillé et reste présélectionné. Tu pourras changer plus tard.</p><div id="onboardWordChoices" class="number-choices">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button class="${o.dailyWords===n?"selected":""}" data-ow="${n}">${n}</button>`).join("")}<button class="${o.dailyWords>10?"selected":""}" data-ow="other">Autre</button></div><div id="onboardWordOther" class="${o.dailyWords>10?"":"hidden"}"><input id="onboardWordOtherInput" class="input" type="number" min="1" max="30" value="${o.dailyWords>10?o.dailyWords:12}"></div>`;
    $$('[data-ow]').forEach(b=>b.onclick=()=>{ const v=b.dataset.ow; if(v==="other"){ o.dailyWords=Math.max(11,o.dailyWords); $("#onboardWordOther").classList.remove("hidden"); }else{o.dailyWords=Number(v); $("#onboardWordOther").classList.add("hidden");} $$('[data-ow]').forEach(x=>x.classList.toggle("selected",x===b)); });
  }else if(o.step===2){
    $("#onboardContent").innerHTML=`<div class="eyebrow">ÉTAPE 3/4</div><h2>Quel rythme te semble réaliste ?</h2><p class="muted">Le but est de tenir dans la durée, pas d’en faire trop le premier jour.</p><div class="onboard-options">${[5,10,15,20].map(n=>`<button class="onboard-option ${o.dailyMinutes===n?"selected":""}" data-minutes="${n}">${n} minutes par jour</button>`).join("")}<button class="onboard-option ${![5,10,15,20].includes(o.dailyMinutes)?"selected":""}" data-minutes="other">Autre durée</button></div><div id="minutesOther" class="${![5,10,15,20].includes(o.dailyMinutes)?"":"hidden"}" style="margin-top:10px"><input id="minutesOtherInput" class="input" type="number" min="3" max="60" value="${![5,10,15,20].includes(o.dailyMinutes)?o.dailyMinutes:25}"></div>`;
    $$('[data-minutes]').forEach(b=>b.onclick=()=>{ const v=b.dataset.minutes; if(v==="other"){ o.dailyMinutes=25; $("#minutesOther").classList.remove("hidden"); }else{o.dailyMinutes=Number(v); $("#minutesOther").classList.add("hidden");} $$('[data-minutes]').forEach(x=>x.classList.toggle("selected",x===b)); });
  }else{
    $("#onboardContent").innerHTML=`<div class="eyebrow">ÉTAPE 4/4</div><h2>Un petit rappel ?</h2><p class="muted">Tu peux enregistrer l’heure à laquelle tu aimerais penser à ta séance.</p><div class="onboard-options"><button class="onboard-option ${o.notifications?"selected":""}" data-reminder="yes">Oui, me le rappeler</button><button class="onboard-option ${!o.notifications?"selected":""}" data-reminder="no">Pas pour l’instant</button></div><div id="onboardTimeWrap" class="${o.notifications?"":"hidden"}" style="margin-top:12px"><label class="form-label">Heure souhaitée</label><input id="onboardTime" class="input" type="time" value="${o.time}"><p class="ai-note">L’heure est enregistrée dans ton profil. Les notifications automatiques nécessitent l’autorisation de ton appareil.</p></div>`;
    $$('[data-reminder]').forEach(b=>b.onclick=()=>{ o.notifications=b.dataset.reminder==="yes"; $$('[data-reminder]').forEach(x=>x.classList.toggle("selected",x===b)); $("#onboardTimeWrap").classList.toggle("hidden",!o.notifications); });
  }
}
async function advanceOnboarding(){
  const o=state.onboarding;
  if(o.step===0 && !o.categories.size){ toast("Choisis au moins une catégorie ou crée ton propre thème."); return; }
  if(o.step===1 && o.dailyWords>10){ o.dailyWords=Math.max(1,Math.min(30,Number($("#onboardWordOtherInput")?.value)||o.dailyWords)); }
  if(o.step===2 && ![5,10,15,20].includes(o.dailyMinutes)){ o.dailyMinutes=Math.max(3,Math.min(60,Number($("#minutesOtherInput")?.value)||25)); }
  if(o.step===3){ o.time=$("#onboardTime")?.value||o.time; await saveOnboarding(); return; }
  o.step++; renderOnboarding();
}
async function saveOnboarding(){
  const o=state.onboarding; showLoading(true);
  try{
    await expect(sb.from("user_categories").delete().eq("user_id",state.user.id),"Catégories");
    if(o.categories.size) await expect(sb.from("user_categories").insert([...o.categories].map(category_id=>({user_id:state.user.id,category_id}))),"Catégories");
    let notifications=o.notifications;
    if(notifications && "Notification" in window){ const perm=await Notification.requestPermission(); if(perm!=="granted") notifications=false; }
    await expect(sb.from("profiles").update({daily_new_words:o.dailyWords,daily_minutes:o.dailyMinutes,notifications_enabled:notifications,notification_time:o.time,onboarding_completed:true,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Onboarding");
    await refreshAll(); showApp(); toast("Ton Daily Mix est prêt ✓");
  }catch(e){ toast(e.message); }finally{ showLoading(false); }
}

function go(id,btn){
  $$(".screen").forEach(s=>s.classList.remove("active")); const screen=$("#"+id); if(screen) screen.classList.add("active"); $$("#bottomNav button").forEach(b=>b.classList.remove("active")); const target=btn||$(`#bottomNav button[data-target="${id}"]`); if(target) target.classList.add("active");
  if(id==="home") renderHome(); if(id==="memo") renderMemo(); if(id==="collections") renderCollections(); if(id==="profile") renderProfile(); window.scrollTo({top:0,behavior:"smooth"});
}
function renderAll(){ renderHome(); renderMemo(); renderCollections(); renderProfile(); }
function progressRows(){ return [...state.progress.values()]; }
function masteredCount(){ return progressRows().filter(p=>p.status==="mastered").length; }
function encounteredCount(){ return progressRows().filter(p=>p.learned_on||p.status!=="new").length; }
function masteryScore(id){ return Number(pFor(id).mastery_score??20); }
function reviewBankIds(){ return progressRows().filter(p=>p.learned_on && (p.memory_status==="review" || Number(p.mastery_score??50)<55)).map(p=>p.word_id).filter(id=>getWord(id)); }
function dueReviewIds(){ const today=localDateISO(); return progressRows().filter(p=>p.learned_on&&p.next_review&&p.next_review<=today).map(p=>p.word_id).filter(id=>getWord(id)); }
function collectionWordIds(collectionId){ return state.collectionWords.filter(r=>r.collection_id===collectionId).map(r=>r.word_id); }
function collectionMembershipSet(){ return new Set(state.collectionWords.map(r=>r.word_id)); }
function themeWordIds(themeId){ return state.themeWords.filter(r=>r.theme_id===themeId).map(r=>r.word_id); }
function isUnseen(id){ const p=state.progress.get(id); return !p || (!p.learned_on&&(p.status==="new"||!p.status)); }
function weakestSenseIndex(id){
  const w=getWord(id), senses=getSenses(w); if(senses.length<=1) return null; const p=pFor(id), sp=p.sense_progress||{}; let best=0,score=101; senses.forEach((_,i)=>{ const s=Number(sp[i]??p.mastery_score??20); if(s<score){score=s;best=i;} }); return best;
}
function mixCandidateRecords(items,limit){
  const groups=new Map(); for(const item of items){ if(!groups.has(item.categoryKey)) groups.set(item.categoryKey,[]); groups.get(item.categoryKey).push(item); }
  const keys=[...groups.keys()].sort(); if(!keys.length) return []; const daySeed=dateFromISO(localDateISO()).getDate()%keys.length, rotated=keys.slice(daySeed).concat(keys.slice(0,daySeed)); const out=[]; let i=0;
  while(out.length<limit){ let added=false; for(const k of rotated){ const arr=groups.get(k); if(arr[i]){out.push(arr[i]);added=true;if(out.length>=limit)break;} } if(!added)break; i++; } return out;
}
function eligibleDailyCandidates(){
  const membership=collectionMembershipSet(), seen=new Set(), forced=[], regular=[]; const add=(id,categoryKey,priority=false)=>{ if(seen.has(id)||!getWord(id)||!isUnseen(id)||membership.has(id)) return; seen.add(id); (priority?forced:regular).push({id,categoryKey}); };
  for(const p of progressRows()) if(p.queued && isUnseen(p.word_id)) add(p.word_id,"__queued",true);
  for(const w of state.userWords.values()) if((w.source==="manual"||w.source==="translator") && isUnseen(w.id)) add(w.id,"__personal",true);
  for(const cat of state.selectedCategories){
    const tid=themeIdFromCategory(cat); if(tid){ for(const id of themeWordIds(tid)) add(id,cat); }
    else for(const w of CATALOG) if(w.category===cat) add(w.id,cat);
  }
  return [...forced,...mixCandidateRecords(regular,regular.length)];
}
function getDailyMixNewIds(){ const target=Number(state.profile?.daily_new_words||3), remaining=Math.max(0,target-Number(activityToday().daily_mix_new_done||0)); return eligibleDailyCandidates().slice(0,remaining).map(x=>x.id); }
function getBonusNewIds(count){ return eligibleDailyCandidates().slice(0,count).map(x=>x.id); }
function getCollectionQuota(c,ids){ const unseen=ids.filter(isUnseen); if(!unseen.length)return 0; if(c.learning_mode==="all_now")return unseen.length; const learnedToday=ids.filter(id=>state.progress.get(id)?.learned_on===localDateISO()).length; let target=Number(c.daily_target||state.profile.daily_new_words||3); if(c.learning_mode==="automatic"&&c.goal_date){ const days=daysInclusiveUntil(c.goal_date); target=Math.max(1,Math.ceil(unseen.length/days)); } return Math.max(0,Math.min(unseen.length,target-learnedToday)); }
function buildDailySession(){
  const items=[],seen=new Set(),active=state.collections.filter(c=>c.status==="active"); const collectionHasWork=c=>{const ids=collectionWordIds(c.id),q=getCollectionQuota(c,ids),due=ids.some(id=>state.progress.get(id)?.next_review&&state.progress.get(id).next_review<=localDateISO()),allDaily=c.review_mode==="all_daily"&&ids.some(id=>!isUnseen(id));return q>0||due||allDaily;}; const priority=active.filter(c=>c.mode==="priority"&&collectionHasWork(c));
  const addItem=(id,kind,sourceType,sourceLabel,collectionId=null,senseIndex=null)=>{if(seen.has(id)||!getWord(id))return;seen.add(id);items.push({id,kind,sourceType,sourceLabel,collectionId,senseIndex});};
  for(const id of dueReviewIds()) addItem(id,"review","review","Révision",null,weakestSenseIndex(id));
  for(const c of active.filter(c=>c.review_mode==="all_daily")) for(const id of collectionWordIds(c.id)) if(!isUnseen(id)) addItem(id,"review","review",c.name,c.id,weakestSenseIndex(id));
  if(priority.length){ for(const c of priority){const ids=collectionWordIds(c.id),unseen=ids.filter(isUnseen),q=getCollectionQuota(c,ids);unseen.slice(0,q).forEach(id=>addItem(id,"new","collection",c.name,c.id));} }
  else{ for(const c of active.filter(c=>c.mode==="complement")){const ids=collectionWordIds(c.id),unseen=ids.filter(isUnseen),q=getCollectionQuota(c,ids);unseen.slice(0,q).forEach(id=>addItem(id,"new","collection",c.name,c.id));} getDailyMixNewIds().forEach(id=>addItem(id,"new","daily","Daily Mix")); }
  return items;
}
function buildCollectionSession(collectionId){ const c=state.collections.find(x=>x.id===collectionId); if(!c)return[]; const ids=collectionWordIds(c.id),items=[],seen=new Set(); const add=(id,kind)=>{if(seen.has(id)||!getWord(id))return;seen.add(id);items.push({id,kind,sourceType:"collection",sourceLabel:c.name,collectionId:c.id,senseIndex:kind==="review"?weakestSenseIndex(id):null});}; if(c.review_mode==="all_daily")ids.filter(id=>!isUnseen(id)).forEach(id=>add(id,"review"));else ids.filter(id=>state.progress.get(id)?.next_review&&state.progress.get(id).next_review<=localDateISO()).forEach(id=>add(id,"review")); const q=getCollectionQuota(c,ids);ids.filter(isUnseen).slice(0,q).forEach(id=>add(id,"new"));return items; }

function renderHome(){
  if(!state.profile)return; const daily=buildDailySession(),newToday=daily.filter(i=>i.kind==="new").length,reviews=daily.filter(i=>i.kind==="review").length,mastered=masteredCount(),target=Number(state.profile.daily_new_words||3)*365,pct=Math.min(100,Math.round(mastered/Math.max(1,target)*100)),streak=computeCurrentStreak(),record=computeStreakRecord(),act=activityToday(),done=Boolean(act.completed);
  $("#helloName").textContent=`Hi ${state.profile.display_name}`; $("#heroStreak").textContent=streak; $("#heroQuote").textContent=`${state.profile.daily_new_words} word${state.profile.daily_new_words>1?"s":""} today. ${target.toLocaleString("en-GB")} in a year.`; $("#goalMastered").textContent=mastered; $("#goalTarget").textContent=target.toLocaleString("en-GB"); $("#goalPercent").textContent=pct+"%"; $("#goalBar").style.width=pct+"%";
  $("#heroNew").textContent=`${newToday} nouveau${newToday>1?"x":""}`; $("#heroReviews").textContent=`${reviews} révision${reviews>1?"s":""}`; $("#newCount").textContent=newToday; $("#reviewCount").textContent=reviewBankIds().length; $("#masteredCount").textContent=mastered; $("#sessionSummary").textContent=done?"Objectif du jour terminé ✓":`${newToday} nouveau${newToday>1?"x":""} • ${reviews} révision${reviews>1?"s":""}`; $("#sessionMinutes").textContent=done?"✓ fait":`≈ ${Math.max(1,Math.ceil(daily.length*.55))} min`; const priority=state.collections.find(c=>c.status==="active"&&c.mode==="priority"); $("#sessionSource").textContent=priority?priority.name:"Daily Mix";
  const bonus=Number(act.bonus_new_done||0); $("#bonusToday").classList.toggle("hidden",!bonus); $("#bonusToday").textContent=bonus?`+${bonus} mot${bonus>1?"s":""} bonus aujourd’hui`:"";
  $("#heroStartBtn").disabled=!done&&daily.length===0; $("#sessionStartBtn").disabled=!done&&daily.length===0; $("#heroStartBtn").textContent=done?"Apprendre encore":"Commencer ma séance"; $("#sessionStartBtn").textContent=done?"Session bonus":"Lancer";
  renderWeek();renderStats();$("#weekStreak").textContent=`${streak} jour${streak>1?"s":""}`;$("#streakRecord").textContent=record;
}
function computeCurrentStreak(){ const done=new Set([...state.activity.values()].filter(a=>a.completed).map(a=>a.activity_date)); let d=dateFromISO(localDateISO()); if(!done.has(localDateISO()))d.setDate(d.getDate()-1);let count=0;while(done.has(localDateISO(d))){count++;d.setDate(d.getDate()-1);}return count; }
function computeStreakRecord(){ const dates=[...new Set([...state.activity.values()].filter(a=>a.completed).map(a=>a.activity_date))].sort();let best=0,cur=0,prev=null;for(const s of dates){const d=dateFromISO(s);if(prev&&(d-prev)===86400000)cur++;else cur=1;best=Math.max(best,cur);prev=d;}return best; }
function renderWeek(){ const today=new Date(),dow=(today.getDay()+6)%7,monday=new Date(today);monday.setDate(today.getDate()-dow);const labels=["LUN","MAR","MER","JEU","VEN","SAM","DIM"];$("#weekCalendar").innerHTML=labels.map((lab,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);const iso=localDateISO(d),a=state.activity.get(iso),cls=a?.completed?"done":iso===localDateISO()?"today":"";return `<div class="weekday"><span>${lab}</span><div class="daydot ${cls}">${a?.completed?"":d.getDate()}</div></div>`;}).join(""); }
function last7Dates(){const out=[];for(let i=6;i>=0;i--)out.push(addDaysISO(localDateISO(),-i));return out;}
function renderStats(){ const dates=last7Dates(),vals=dates.map(d=>state.activity.get(d)?.total_count||0),max=Math.max(1,...vals);$("#chart").innerHTML=vals.map(v=>`<div class="bar" style="height:${Math.max(8,Math.round(v/max*100))}%"></div>`).join("");const acts=dates.map(d=>state.activity.get(d)).filter(Boolean),total=acts.reduce((s,a)=>s+Number(a.total_count||0),0),correct=acts.reduce((s,a)=>s+Number(a.correct_count||0),0),learned=acts.reduce((s,a)=>s+Number(a.new_done||0),0);$("#weekWords").textContent=`+${learned} words`;$("#successRate").textContent=total?Math.round(correct/total*100)+"%":"0%";const cats=new Set(progressRows().filter(p=>p.learned_on).map(p=>getWord(p.word_id)?.category).filter(Boolean));$("#categoryStat").textContent=cats.size; }

function handleHomeStart(){ if(activityToday().completed) openBonusModal(); else startDailySession(); }
async function startDailySession(){ const q=buildDailySession(); if(!q.length){ if(activityToday().completed)openBonusModal();else toast("Rien à travailler pour l’instant.");return;} state.session=q;state.sessionIndex=0;state.sessionType="daily";state.sessionResults=[];renderStudy();go("learn"); }
async function startDifficultSession(){ const ids=reviewBankIds();if(!ids.length){toast("Aucun mot à consolider pour l’instant.");return;}state.session=ids.map(id=>({id,kind:"review",sourceType:"review",sourceLabel:"Mots à consolider",senseIndex:weakestSenseIndex(id)}));state.sessionIndex=0;state.sessionType="difficult";state.sessionResults=[];renderStudy();go("learn"); }
async function startCollectionSession(id){ const q=buildCollectionSession(id);if(!q.length){toast("Rien à travailler dans cette collection aujourd’hui.");return;}state.session=q;state.sessionIndex=0;state.sessionType="collection";state.sessionResults=[];renderStudy();go("learn"); }
function openBonusModal(){ state.selectedBonusCount=3; const choices=[1,2,3,4,5,10,"other"];$("#bonusChoices").innerHTML=choices.map(v=>`<button data-bonus="${v}" class="${v===3?"selected":""}">${v==="other"?"Autre":v}</button>`).join("");$("#bonusOtherWrap").classList.add("hidden");$$('[data-bonus]').forEach(b=>b.onclick=()=>{const v=b.dataset.bonus;if(v==="other"){state.selectedBonusCount=Math.max(1,Number($("#bonusOther").value)||3);$("#bonusOtherWrap").classList.remove("hidden");}else{state.selectedBonusCount=Number(v);$("#bonusOtherWrap").classList.add("hidden");}$$('[data-bonus]').forEach(x=>x.classList.toggle("selected",x===b));});$("#bonusOther").oninput=e=>state.selectedBonusCount=Math.max(1,Math.min(30,Number(e.target.value)||3));openModal("bonusModal"); }
function startBonusSession(count){ const ids=getBonusNewIds(count);if(!ids.length){toast("Tu as déjà rencontré tous les mots disponibles dans tes catégories.");return;}state.session=ids.map(id=>({id,kind:"new",sourceType:"bonus",sourceLabel:"Bonus",senseIndex:null}));state.sessionIndex=0;state.sessionType="bonus";state.sessionResults=[];renderStudy();go("learn"); }

function renderAnswerHTML(w,direction,item){
  const senses=getSenses(w), selected=item.senseIndex!=null?senses[item.senseIndex]:null;
  if(direction==="en-fr"){
    return `<div class="answer-senses">${senses.map((s,i)=>`<div class="answer-sense"><strong>${senses.length>1?`${i+1}. `:""}${escapeHTML(s.fr)}</strong>${s.example_en?`<div class="answer-audio-row"><button class="mini-speaker" data-speak="${escapeHTML(s.example_en)}" title="Écouter la phrase"><svg class="icon icon-sm"><use href="#i-volume"></use></svg></button><div><b>${escapeHTML(s.example_en)}</b>${s.example_fr?`<br><span class="muted">${escapeHTML(s.example_fr)}</span>`:""}</div></div>`:""}</div>`).join("")}</div>`;
  }
  const s=selected||senses[0]; return `<strong>${escapeHTML(w.en)}</strong><div class="study-audio-after"><button class="speaker" data-speak="${escapeHTML(w.en)}" title="Écouter le mot"><svg class="icon"><use href="#i-volume"></use></svg></button><button class="speaker" data-practice="${escapeHTML(w.en)}" title="S’entraîner à prononcer"><svg class="icon"><use href="#i-mic"></use></svg></button></div>${s?.example_en?`<div class="answer-audio-row"><button class="mini-speaker" data-speak="${escapeHTML(s.example_en)}" title="Écouter la phrase"><svg class="icon icon-sm"><use href="#i-volume"></use></svg></button><div><b>${escapeHTML(s.example_en)}</b>${s.example_fr?`<br><span class="muted">${escapeHTML(s.example_fr)}</span>`:""}</div></div>`:""}`;
}
function bindStudyAudio(){ $$('[data-speak]').forEach(b=>b.onclick=()=>speak(b.dataset.speak)); $$('[data-practice]').forEach(b=>b.onclick=()=>practicePronunciation(b.dataset.practice)); }
function renderStudy(){
  if(!state.session||state.sessionIndex>=state.session.length){finishSession();return;} const item=state.session[state.sessionIndex],w=getWord(item.id),p=pFor(item.id),senses=getSenses(w);state.lastAnswerCorrect=null;
  let direction=item.kind==="new"?"en-fr":((Number(p.total_count||0)%2===0)?"fr-en":"en-fr"); if(item.senseIndex!=null&&senses.length>1)direction="fr-en";
  const selected=item.senseIndex!=null?senses[item.senseIndex]:null,typed=item.kind!=="new"&&direction==="fr-en"&&state.profile.written_exercises&&Number(p.repetitions||0)>=1,prompt=direction==="en-fr"?w.en:(selected?.fr||w.fr),instruction=direction==="en-fr"?(senses.length>1?"Retrouve les sens utiles en français.":"Trouve le sens en français."):"Retrouve le mot en anglais.",canHearPrompt=direction==="en-fr";
  $("#learnCounter").textContent=`${state.sessionIndex+1} / ${state.session.length}`;$("#learnBar").style.width=`${Math.round(state.sessionIndex/state.session.length*100)}%`;
  $("#studyCard").innerHTML=`<div class="study-top"><div><span class="pill">${escapeHTML(item.sourceLabel)} · ${item.kind==="new"?"nouveau":"révision"}</span><div class="word ${String(prompt).length>24?"long":""}">${escapeHTML(prompt)}</div><p class="muted">${instruction}</p></div>${canHearPrompt?`<div style="display:flex;gap:8px"><button id="speakBtn" class="speaker" title="Écouter"><svg class="icon"><use href="#i-volume"></use></svg></button><button id="micBtn" class="speaker" title="S’entraîner à prononcer"><svg class="icon"><use href="#i-mic"></use></svg></button></div>`:""}</div>${typed?`<input id="typedAnswer" class="prompt-input" autocomplete="off" placeholder="Tape ta réponse en anglais…"><button id="checkTypedBtn" class="primary full">Vérifier</button><div id="typedFeedback" class="feedback"></div>`:`<button id="revealBtn" class="primary full">Voir la réponse</button>`}<div id="answerBox" class="answer hidden">${renderAnswerHTML(w,direction,item)}</div><div id="ratingArea" class="hidden"><div class="group-title">Mémorisation aujourd’hui</div><div class="memory"><button id="memoryReview" class="again">↻ À revoir</button><button id="memoryKnown" class="know">✓ Je connais</button></div><button id="favStudyBtn" class="secondary fav-btn"><svg class="icon icon-sm" style="${p.favorite?"fill:currentColor":""}"><use href="#i-heart"></use></svg>${p.favorite?" Retirer des favoris":" Ajouter aux favoris"}</button></div>`;
  if(canHearPrompt){$("#speakBtn").onclick=()=>speak(w.en);$("#micBtn").onclick=()=>practicePronunciation(w.en);} if(typed){$("#checkTypedBtn").onclick=()=>checkTypedAnswer(w);$("#typedAnswer").addEventListener("keydown",e=>{if(e.key==="Enter")checkTypedAnswer(w);});}else $("#revealBtn").onclick=()=>{state.lastAnswerCorrect=null;revealRating();}; $("#memoryReview").onclick=()=>rateCurrent("review",direction);$("#memoryKnown").onclick=()=>rateCurrent("known",direction);$("#favStudyBtn").onclick=async()=>{await toggleFavorite(item.id);renderStudy();};
}
function revealRating(){ $("#answerBox").classList.remove("hidden");$("#ratingArea").classList.remove("hidden");const r=$("#revealBtn");if(r)r.classList.add("hidden");const c=$("#checkTypedBtn");if(c)c.classList.add("hidden");bindStudyAudio(); }
function levenshtein(a,b){const dp=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=b.length;j++){const tmp=dp[j];dp[j]=a[i-1]===b[j-1]?prev:1+Math.min(prev,dp[j],dp[j-1]);prev=tmp;}}return dp[b.length];}
function checkTypedAnswer(w){ const input=normalizeEnglish($("#typedAnswer").value),target=normalizeEnglish(w.en),dist=levenshtein(input,target),fb=$("#typedFeedback");if(input===target){state.lastAnswerCorrect=true;fb.textContent="Correct ✓";fb.className="feedback good";}else if(target.length>=5&&dist<=1){state.lastAnswerCorrect=true;fb.textContent="Presque ! Une petite faute de frappe.";fb.className="feedback almost";}else{state.lastAnswerCorrect=false;fb.textContent="À revoir — regarde la bonne réponse ci-dessous.";fb.className="feedback bad";}revealRating(); }
function nextMasteryScore(oldScore,memory,correct){ const s=Number(oldScore??20);if(memory==="review")return Math.max(5,s-20);if(!correct)return Math.max(8,s-12);return Math.min(100,s+(s<45?18:s<70?14:s<85?10:6)); }
function intervalForScore(score,oldInterval,memory){ if(memory==="review")return 1;if(score<40)return 1;if(score<60)return 2;if(score<75)return Math.max(3,Math.round(Math.max(2,oldInterval)*1.45));if(score<90)return Math.max(5,Math.round(Math.max(3,oldInterval)*1.7));return Math.max(10,Math.round(Math.max(5,oldInterval)*2)); }
async function rateCurrent(memory,direction){
  const item=state.session[state.sessionIndex],old=pFor(item.id),w=getWord(item.id),senses=getSenses(w),typedCorrect=state.lastAnswerCorrect,correct=typedCorrect===null?memory==="known":typedCorrect,oldSP={...(old.sense_progress||{})},indexes=item.senseIndex!=null?[item.senseIndex]:senses.map((_,i)=>i); for(const i of indexes) oldSP[i]=nextMasteryScore(Number(oldSP[i]??old.mastery_score??20),memory,correct);
  const senseScores=senses.length?senses.map((_,i)=>Number(oldSP[i]??old.mastery_score??20)):[nextMasteryScore(old.mastery_score,memory,correct)],score=Math.round(senseScores.reduce((a,b)=>a+b,0)/senseScores.length),effectiveKnown=memory==="known"&&correct,repetitions=effectiveKnown?Number(old.repetitions||0)+1:memory==="review"?0:Number(old.repetitions||0),allAnchored=senseScores.every(x=>x>=68),status=(score>=72&&repetitions>=2&&allAnchored)?"mastered":"learning",interval=intervalForScore(score,Number(old.interval_days||0),effectiveKnown?"known":"review");
  const row={user_id:state.user.id,word_id:item.id,status,difficulty:Number(old.difficulty||2),mastery_score:score,sense_progress:oldSP,memory_status:memory,favorite:Boolean(old.favorite),queued:false,interval_days:interval,repetitions,next_review:addDaysISO(localDateISO(),interval),last_review:new Date().toISOString(),learned_on:old.learned_on||localDateISO(),correct_count:Number(old.correct_count||0)+(correct?1:0),total_count:Number(old.total_count||0)+1,last_direction:direction,updated_at:new Date().toISOString()};
  await expect(sb.from("user_progress").upsert(row),"Enregistrement mot");state.progress.set(item.id,{...old,...row});state.sessionResults.push({item,correct,memory});if(state.sessionType!=="difficult")await incrementActivity(item,correct);state.sessionIndex++;renderAll();renderStudy();
}
async function incrementActivity(item,correct){ const today=localDateISO(),old=activityToday(),row={user_id:state.user.id,activity_date:today,completed:Boolean(old.completed),new_done:Number(old.new_done||0)+(item.kind==="new"?1:0),daily_mix_new_done:Number(old.daily_mix_new_done||0)+(item.kind==="new"&&item.sourceType==="daily"?1:0),collection_new_done:Number(old.collection_new_done||0)+(item.kind==="new"&&item.sourceType==="collection"?1:0),bonus_new_done:Number(old.bonus_new_done||0)+(item.kind==="new"&&item.sourceType==="bonus"?1:0),reviews_done:Number(old.reviews_done||0)+(item.kind==="review"?1:0),correct_count:Number(old.correct_count||0)+(correct?1:0),total_count:Number(old.total_count||0)+1,updated_at:new Date().toISOString()};await expect(sb.from("daily_activity").upsert(row),"Statistiques");state.activity.set(today,row); }
async function finishSession(){
  if(state.sessionType==="daily"){const old=activityToday(),row={...old,user_id:state.user.id,activity_date:localDateISO(),completed:true,updated_at:new Date().toISOString()};await expect(sb.from("daily_activity").upsert(row),"Fin de séance");state.activity.set(localDateISO(),row);} const total=state.session?.length||0,newN=state.session?.filter(i=>i.kind==="new").length||0,revN=total-newN,correct=state.sessionResults.filter(r=>r.correct).length,success=total?Math.round(correct/total*100):0,streak=computeCurrentStreak(),bonus=state.sessionType==="bonus";
  $("#studyCard").innerHTML=`<div style="text-align:center;padding:26px 10px"><div class="logo" style="margin:0 auto 18px"><span>3W</span></div><h2>${bonus?"Bonus terminé":"Day completed"}</h2><p class="muted">${newN} nouveau${newN>1?"x":""} • ${revN} révision${revN>1?"s":""} • ${success}% de réussite</p><div class="profile-stats" style="margin:22px 0"><div class="profile-stat"><b>${total}</b><small>cartes</small></div><div class="profile-stat"><b>${streak}</b><small>série actuelle</small></div><div class="profile-stat"><b>${masteredCount()}</b><small>maîtrisés</small></div></div><button id="finishHome" class="primary full">Retour à l’accueil</button><button id="finishBonus" class="secondary" style="width:100%;margin-top:9px">Apprendre d’autres mots</button><button id="finishHard" class="secondary" style="width:100%;margin-top:9px">Revoir mes mots à consolider</button></div>`;$("#learnCounter").textContent="✓";$("#learnBar").style.width="100%";$("#finishHome").onclick=()=>go("home");$("#finishBonus").onclick=openBonusModal;$("#finishHard").onclick=startDifficultSession;renderAll();
}
function speak(text){ if(!("speechSynthesis" in window)){toast("La synthèse vocale n’est pas disponible ici.");return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text).replace(/^to\s+/i,""));u.lang=state.profile?.pronunciation_locale||"en-GB";u.rate=.9;speechSynthesis.speak(u); }
function practicePronunciation(target){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast("La reconnaissance vocale n’est pas disponible sur ce navigateur.");return;}const r=new SR();r.lang="en-GB";r.interimResults=false;r.maxAlternatives=1;toast("Je t’écoute…");r.onresult=e=>{const heard=e.results[0][0].transcript,ok=normalizeEnglish(heard)===normalizeEnglish(target);toast(ok?`Très bien : “${heard}” ✓`:`J’ai entendu “${heard}”. Réessaie si besoin.`);};r.onerror=()=>toast("Je n’ai pas réussi à t’entendre correctement.");r.start();}
async function toggleFavorite(id){const old=pFor(id),row={...old,user_id:state.user.id,word_id:id,favorite:!Boolean(old.favorite),updated_at:new Date().toISOString()};delete row.id;await expect(sb.from("user_progress").upsert(row),"Favoris");state.progress.set(id,row);renderMemo();renderHome();}

function setMemoFilter(filter,btn){state.memoFilter=filter;$$(".filters button").forEach(b=>b.classList.remove("active"));btn.classList.add("active");renderMemo();}
function openMemo(filter){go("memo");state.memoFilter=filter;$$(".filters button").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));renderMemo();}
function memoWordIds(){const ids=new Set([...state.userWords.keys()]);for(const p of progressRows())if(getWord(p.word_id))ids.add(p.word_id);for(const cw of state.collectionWords)if(getWord(cw.word_id))ids.add(cw.word_id);for(const tw of state.themeWords)if(getWord(tw.word_id))ids.add(tw.word_id);buildDailySession().filter(i=>i.kind==="new").forEach(i=>ids.add(i.id));return[...ids];}
function wordSearchText(w){return normalizeText(`${w.en} ${w.fr} ${getCategoryLabel(w.category)} ${getSenses(w).map(s=>`${s.fr} ${s.example_en} ${s.example_fr}`).join(" ")}`);}
function emptyMemoText(){const map={new:["Aucun nouveau mot pour l’instant.","Les prochains mots de ton Daily Mix apparaîtront ici."],review:["Rien à consolider 🎉","Les mots qui demandent un peu plus de travail apparaîtront ici."],mastered:["Aucun mot bien ancré pour l’instant.","Continue tes petites révisions : ils arriveront vite."],fav:["Aucun favori pour l’instant.","Ajoute un cœur aux mots que tu veux retrouver ici."],all:["Ton Mémo est encore vide.","Tes mots apparaîtront ici au fur et à mesure."]};return map[state.memoFilter]||map.all;}
function renderMemo(){
  if(!state.user)return;const q=normalizeText($("#searchInput")?.value||""),currentNew=new Set(buildDailySession().filter(i=>i.kind==="new").map(i=>i.id));let ids=memoWordIds();ids=ids.filter(id=>{const w=getWord(id);if(!w)return false;const p=pFor(id);if(q&&!wordSearchText(w).includes(q))return false;if(state.memoFilter==="new")return currentNew.has(id)||(!p.learned_on&&p.status==="new");if(state.memoFilter==="review")return p.learned_on&&(p.memory_status==="review"||Number(p.mastery_score??50)<55);if(state.memoFilter==="mastered")return p.status==="mastered";if(state.memoFilter==="fav")return Boolean(p.favorite);return true;});ids.sort((a,b)=>getWord(a).en.localeCompare(getWord(b).en,"en"));
  if(!ids.length){const [title,sub]=emptyMemoText();$("#wordlist").innerHTML=`<div class="empty-state"><div class="empty-icon"><svg class="icon"><use href="#i-search"></use></svg></div><b>${title}</b><p class="muted" style="margin-bottom:0">${sub}</p></div>`;return;}
  $("#wordlist").innerHTML=ids.map(id=>{const w=getWord(id),p=pFor(id);return `<div class="worditem clickable" data-word-detail="${id}"><div><b>${escapeHTML(w.en)}</b><small>${escapeHTML(w.fr)}</small></div><div class="word-actions"><span class="tag">${escapeHTML(getCategoryLabel(w.category))}</span><button class="word-audio" data-word-audio="${id}" title="Écouter"><svg class="icon icon-sm"><use href="#i-volume"></use></svg></button><button class="heart-btn ${p.favorite?"active":""}" data-fav="${id}"><svg class="icon icon-sm"><use href="#i-heart"></use></svg></button></div></div>`;}).join("");
  $$('[data-word-detail]').forEach(el=>el.onclick=()=>openWordDetail(el.dataset.wordDetail));$$('[data-word-audio]').forEach(b=>b.onclick=e=>{e.stopPropagation();speak(getWord(b.dataset.wordAudio).en);});$$('[data-fav]').forEach(b=>b.onclick=e=>{e.stopPropagation();toggleFavorite(b.dataset.fav);});
}
function masteryGaugeHTML(score){const s=Math.max(0,Math.min(100,Number(score||0)));return `<div class="mastery-block"><div class="mastery-labels"><span>À consolider</span><span>Bien ancré</span></div><div class="mastery-track"><i class="mastery-marker" style="left:${s}%"></i></div></div>`;}
function openWordDetail(id){
  const w=getWord(id),p=pFor(id),senses=getSenses(w),cols=state.collectionWords.filter(r=>r.word_id===id).map(r=>state.collections.find(c=>c.id===r.collection_id)?.name).filter(Boolean),themes=state.themeWords.filter(r=>r.word_id===id).map(r=>state.customThemes.find(t=>t.id===r.theme_id)?.name).filter(Boolean),members=[...new Set([...cols,...themes])];
  $("#wordDetailContent").innerHTML=`<div class="detail-title"><div><div class="eyebrow">${escapeHTML(getCategoryLabel(w.category))}</div><h2>${escapeHTML(w.en)}</h2><div class="muted">${escapeHTML(w.fr)}</div></div><button id="detailSpeakWord" class="speaker"><svg class="icon"><use href="#i-volume"></use></svg></button></div>${masteryGaugeHTML(p.mastery_score??20)}<div class="detail-meta"><span class="tag">${p.status==="mastered"?"Maîtrisé":"En apprentissage"}</span>${members.map(x=>`<span class="tag">${escapeHTML(x)}</span>`).join("")}</div><div style="margin-top:16px"><div class="group-title">Sens et exemples</div>${senses.map((s,i)=>`<div class="sense-card"><div class="sense-head"><b>${senses.length>1?`${i+1}. `:""}${escapeHTML(s.fr)}</b>${s.example_en?`<button class="sense-audio" data-detail-speak="${escapeHTML(s.example_en)}"><svg class="icon icon-sm"><use href="#i-volume"></use></svg></button>`:""}</div>${s.example_en?`<p><b>${escapeHTML(s.example_en)}</b><br><span class="muted">${escapeHTML(s.example_fr||"")}</span></p>`:"<p class=\"muted\">Exemple à compléter.</p>"}</div>`).join("")}</div><button id="detailFav" class="secondary full" style="margin-top:14px"><svg class="icon icon-sm" style="vertical-align:-3px;${p.favorite?"fill:currentColor":""}"><use href="#i-heart"></use></svg> ${p.favorite?"Retirer des favoris":"Ajouter aux favoris"}</button>`;
  $("#detailSpeakWord").onclick=()=>speak(w.en);$$('[data-detail-speak]').forEach(b=>b.onclick=()=>speak(b.dataset.detailSpeak));$("#detailFav").onclick=async()=>{await toggleFavorite(id);openWordDetail(id);};openModal("wordDetailModal");
}

function renderCollections(){
  if(!state.user)return;const active=state.collections.filter(c=>c.status==="active"),archived=state.collections.filter(c=>c.status==="archived");const daily=`<div class="collection locked"><div class="collection-icon"><svg class="icon"><use href="#i-spark"></use></svg></div><h3>Daily Mix</h3><small>${state.profile.daily_new_words} mot${state.profile.daily_new_words>1?"s":""}/jour · ${state.selectedCategories.size} catégories/thèmes</small><div class="mini"><i style="width:${Math.min(100,masteredCount()/Math.max(1,state.profile.daily_new_words*365)*100)}%"></i></div><div class="collection-actions"><button class="secondary" data-nav-profile>Personnaliser</button><button class="primary" data-start-daily>Apprendre</button></div></div>`;$("#collectionsGrid").innerHTML=daily+active.map(c=>collectionCard(c)).join("");$$('[data-nav-profile]').forEach(b=>b.onclick=()=>go("profile"));$$('[data-start-daily]').forEach(b=>b.onclick=handleHomeStart);$$('[data-edit-col]').forEach(b=>b.onclick=()=>openCollectionModal(b.dataset.editCol));$$('[data-start-col]').forEach(b=>b.onclick=()=>startCollectionSession(b.dataset.startCol));$("#archivedArea").classList.toggle("hidden",!archived.length);$("#archivedCollections").innerHTML=archived.map(c=>`<div class="worditem"><div><b>${escapeHTML(c.name)}</b><small>Collection archivée</small></div><button class="secondary" data-restore="${c.id}">Réactiver</button></div>`).join("");$$('[data-restore]').forEach(b=>b.onclick=()=>restoreCollection(b.dataset.restore));
}
function collectionCard(c){const ids=collectionWordIds(c.id),mastered=ids.filter(id=>state.progress.get(id)?.status==="mastered").length,pct=ids.length?Math.round(mastered/ids.length*100):0;return `<div class="collection"><div class="collection-icon" style="background:linear-gradient(145deg,${c.mode==="priority"?"#e34858,#f08a96":"#2457f5,#6b8cff"})"><svg class="icon"><use href="#i-collection"></use></svg></div><h3>${escapeHTML(c.name)}</h3><small>${c.mode==="priority"?"Priorité":"Complément"} · ${ids.length} mot${ids.length>1?"s":""}${c.goal_date?` · ${escapeHTML(c.goal_date)}`:""}</small><div class="mini"><i style="width:${pct}%"></i></div><div class="collection-actions"><button class="secondary" data-edit-col="${c.id}">Modifier</button><button class="primary" data-start-col="${c.id}">Travailler</button></div></div>`;}
function openCollectionModal(id=null){const c=id?state.collections.find(x=>x.id===id):null;$("#editingCollectionId").value=c?.id||"";$("#collectionModalTitle").textContent=c?"Modifier la collection":"Nouvelle collection";$("#collectionName").value=c?.name||"";$("#collectionMode").value=c?.mode||"complement";$("#collectionLearningMode").value=c?.learning_mode||"automatic";$("#collectionReviewMode").value=c?.review_mode||"smart";$("#collectionGoalDate").value=c?.goal_date||"";$("#collectionDailyTarget").value=c?.daily_target||"";$("#archiveCollectionBtn").classList.toggle("hidden",!c);$("#deleteCollectionBtn").classList.toggle("hidden",!c);$("#collectionWordsText").value=c?collectionWordIds(c.id).map(id=>{const w=getWord(id);return w?`${w.en} = ${w.fr}`:"";}).filter(Boolean).join("\n"):"";state.importedWordMeta=new Map();openModal("collectionModal");}
function parseWordLines(text){return text.split(/\n+/).map(x=>x.trim()).filter(Boolean).map(line=>{const parts=line.split(/\s*(?:=|→|:|\|)\s*/);return{en:(parts[0]||"").trim(),fr:(parts.slice(1).join(" ")||"").trim()};}).filter(x=>x.en);}
function findCatalogByExact(en,fr=""){const ne=normalizeEnglish(en),nf=normalizeText(fr);return CATALOG.find(w=>normalizeEnglish(w.en)===ne||normalizeText(w.fr)===nf&&nf)||null;}
function findUserWordByEnglish(en){const ne=normalizeEnglish(en);return [...state.userWords.values()].find(w=>normalizeEnglish(w.en)===ne)||null;}
async function upsertRichWord(meta,defaultCategory="conversation",source="manual"){
  const en=String(meta.en||"").trim(),fr=String(meta.fr||meta.senses?.[0]?.fr||"").trim();if(!en||!fr)throw new Error("Un mot généré est incomplet.");const catHit=findCatalogByExact(en,fr),existing=findUserWordByEnglish(en),id=catHit?.id||existing?.id||`custom-${slugify(en)}-${Math.abs(hashString(en)).toString(36)}`;const senses=(meta.senses||[]).map(s=>({fr:s.fr||fr,example_en:s.example_en||s.example||"",example_fr:s.example_fr||""}));const first=senses[0]||{fr,example_en:meta.example||"",example_fr:meta.example_fr||""};const category=catHit?.category||existing?.category||meta.category||defaultCategory;const payload={user_id:state.user.id,word_id:id,normalized_en:normalizeEnglish(en),en:catHit?.en||en,fr:first.fr||fr,example:first.example_en||meta.example||null,example_fr:first.example_fr||meta.example_fr||null,category_id:category,senses:senses.length?senses:[first],source,created_at:new Date().toISOString()};await expect(sb.from("user_words").upsert(payload,{onConflict:"user_id,word_id"}),"Mot personnel");state.userWords.set(id,{id,en:payload.en,fr:payload.fr,category:payload.category_id,example:payload.example||"",example_fr:payload.example_fr||"",normalized_en:payload.normalized_en,senses:payload.senses,source});return id;
}
function hashString(s){let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h)+s.charCodeAt(i)|0;return h;}
async function resolveWordId(en,fr,category="conversation",meta=null,source="collection"){const cat=findCatalogByExact(en,fr);if(meta)return upsertRichWord({...meta,en:meta.en||en,fr:meta.fr||fr},category,source);if(cat)return cat.id;const existing=findUserWordByEnglish(en);if(existing)return existing.id;return upsertRichWord({en,fr,senses:[{fr,example_en:"",example_fr:""}]},category,source);}
async function enrichUnknownItems(items){
  if(!items.length)return[];const out=[];
  for(let i=0;i<items.length;i+=20){const data=await callLanguageTools("enrich_batch",{items:items.slice(i,i+20)});out.push(...(data.words||[]));}
  return out;
}
async function saveCollection(){
  showLoading(true);try{const id=$("#editingCollectionId").value||null,name=$("#collectionName").value.trim();if(!name)throw new Error("Donne un nom à la collection.");const payload={user_id:state.user.id,name,mode:$("#collectionMode").value,learning_mode:$("#collectionLearningMode").value,review_mode:$("#collectionReviewMode").value,goal_date:$("#collectionGoalDate").value||null,daily_target:Number($("#collectionDailyTarget").value)||null,updated_at:new Date().toISOString()};let collection;if(id)collection=await expect(sb.from("collections").update(payload).eq("id",id).eq("user_id",state.user.id).select().single(),"Modification collection");else collection=await expect(sb.from("collections").insert(payload).select().single(),"Création collection");const parsed=parseWordLines($("#collectionWordsText").value),ids=[],unknown=[];
    for(const w of parsed){const localMeta=state.importedWordMeta.get(normalizeEnglish(w.en)),cat=findCatalogByExact(w.en,w.fr),existing=findUserWordByEnglish(w.en);if(localMeta)ids.push(await resolveWordId(w.en,w.fr,"conversation",{...localMeta,fr:w.fr||localMeta.fr},"photo"));else if(cat)ids.push(cat.id);else if(existing&&getSenses(existing).some(s=>s.example_en))ids.push(existing.id);else unknown.push(w);}
    if(unknown.length){const rich=await enrichUnknownItems(unknown);for(const meta of rich)ids.push(await upsertRichWord(meta,"conversation","collection"));}
    await expect(sb.from("collection_words").delete().eq("collection_id",collection.id).eq("user_id",state.user.id),"Mise à jour mots");if(ids.length)await expect(sb.from("collection_words").insert([...new Set(ids)].map(word_id=>({collection_id:collection.id,user_id:state.user.id,word_id}))),"Ajout mots collection");closeModal("collectionModal");await refreshAll();go("collections");toast("Collection enregistrée.");
  }catch(e){toast(e.message);}finally{showLoading(false);}
}
async function archiveCurrentCollection(){const id=$("#editingCollectionId").value;if(!id)return;await expect(sb.from("collections").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id),"Archivage");closeModal("collectionModal");await refreshAll();toast("Collection archivée. Tes mots restent dans Mémo.");}
async function restoreCollection(id){await expect(sb.from("collections").update({status:"active",updated_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id),"Réactivation");await refreshAll();}
function deleteCurrentCollection(){const id=$("#editingCollectionId").value;if(!id)return;confirmAction("Supprimer cette collection ?","Les mots déjà appris resteront dans ton Mémo et ta progression. Seule la collection sera supprimée.","Supprimer",async()=>{await expect(sb.from("collections").delete().eq("id",id).eq("user_id",state.user.id),"Suppression");closeModal("collectionModal");await refreshAll();toast("Collection supprimée.");});}

function allCategoryOptions(){const base=CATEGORY_GROUPS.flatMap(g=>g.items.map(([id,label])=>[id,label]));const themes=state.customThemes.map(t=>[themeCategoryId(t.id),`✨ ${t.name}`]);return [...base,...themes];}
function populateWordCategory(){const el=$("#wordCategory");if(!el)return;el.innerHTML=allCategoryOptions().map(([id,label])=>`<option value="${id}">${escapeHTML(label)}</option>`).join("");}
function renderWordSensePreview(){const box=$("#wordSensePreview");if(!box)return;if(!state.pendingWordSenses.length){box.classList.add("hidden");box.innerHTML="";return;}box.classList.remove("hidden");box.innerHTML=`<div class="group-title">Sens proposés</div>${state.pendingWordSenses.map((s,i)=>`<div class="sense-card"><b>${i+1}. ${escapeHTML(s.fr)}</b>${s.example_en?`<p><b>${escapeHTML(s.example_en)}</b><br><span class="muted">${escapeHTML(s.example_fr||"")}</span></p>`:""}</div>`).join("")}`;}
function applyEnrichment(meta){$("#wordEn").value=meta.en||$("#wordEn").value;$("#wordFr").value=meta.fr||meta.senses?.[0]?.fr||$("#wordFr").value;if(meta.category&&allCategoryOptions().some(x=>x[0]===meta.category))$("#wordCategory").value=meta.category;state.pendingWordSenses=meta.senses||[];const first=state.pendingWordSenses[0];if(first){$("#wordExample").value=first.example_en||"";$("#wordExampleFr").value=first.example_fr||"";}renderWordSensePreview();}
async function smartCompleteWord(){const en=$("#wordEn").value.trim(),fr=$("#wordFr").value.trim();if(!en&&!fr){toast("Écris d’abord un mot en anglais ou en français.");return;}const local=findCatalogByExact(en,fr)||findUserWordByEnglish(en);if(local){applyEnrichment({en:local.en,fr:local.fr,category:local.category,senses:getSenses(local)});toast("Mot retrouvé dans le catalogue.");return;}showLoading(true);try{const data=await callLanguageTools("enrich",{en,fr});applyEnrichment(data);toast("Proposition prête ✓");}catch(e){toast(e.message);}finally{showLoading(false);}}
async function ensureRichWordMeta(en,fr){const local=findCatalogByExact(en,fr);if(local)return{en:local.en,fr:local.fr,category:local.category,senses:getSenses(local)};if(state.pendingWordSenses.length)return{en,fr,category:$("#wordCategory").value,senses:state.pendingWordSenses};return callLanguageTools("enrich",{en,fr});}
async function queueWord(id){const old=pFor(id),row={...old,user_id:state.user.id,word_id:id,queued:true,status:old.learned_on?old.status:"new",updated_at:new Date().toISOString()};delete row.id;await expect(sb.from("user_progress").upsert(row),"File d’apprentissage");state.progress.set(id,row);}
async function saveStandaloneWord(){showLoading(true);try{let en=$("#wordEn").value.trim(),fr=$("#wordFr").value.trim();if(!en&&!fr)throw new Error("Entre un mot anglais ou français.");const meta=await ensureRichWordMeta(en,fr);en=meta.en;fr=meta.fr||meta.senses?.[0]?.fr;const first=meta.senses?.[0]||{};if($("#wordExample").value.trim()){first.example_en=$("#wordExample").value.trim();first.example_fr=$("#wordExampleFr").value.trim();meta.senses=meta.senses?.length?meta.senses:[first];}const id=await upsertRichWord({...meta,category:$("#wordCategory").value},$("#wordCategory").value,"manual");await queueWord(id);closeModal("wordModal");$("#wordEn").value=$("#wordFr").value=$("#wordExample").value=$("#wordExampleFr").value="";state.pendingWordSenses=[];await refreshAll();go("memo");toast("Mot ajouté à ton Mémo et à ta file d’apprentissage.");}catch(e){toast(e.message);}finally{showLoading(false);}}

async function callLanguageTools(operation,payload={}){const {data,error}=await sb.functions.invoke("language-tools",{body:{operation,...payload}});if(error){console.error(error);throw new Error("Le module intelligent n’est pas encore activé ou a rencontré un problème.");}if(data?.error)throw new Error(data.error);return data;}
async function translateText(){const text=$("#translatorInput").value.trim();if(!text){toast("Écris un mot, une expression ou une phrase courte.");return;}const local=findCatalogByExact(text,text);showLoading(true);try{let data;if(local){const inputIsEn=normalizeEnglish(local.en)===normalizeEnglish(text);data={kind:"word",en:local.en,fr:local.fr,translation:inputIsEn?local.fr:local.en,category:local.category,senses:getSenses(local)};}else data=await callLanguageTools("translate",{text});state.translatorPayload=data;renderTranslatorResult(data);}catch(e){toast(e.message);}finally{showLoading(false);}}
function renderTranslatorResult(data){const box=$("#translatorResult");box.classList.remove("hidden");const english=data.en||((data.detected_language==="en")?data.source:data.translation),french=data.fr||((data.detected_language==="fr")?data.source:data.translation),isWord=data.kind==="word";box.innerHTML=`<div class="translation-main"><div class="eyebrow">TRADUCTION</div><strong>${escapeHTML(data.translation||"")}</strong>${english?`<div class="translation-actions"><button id="translatorSpeak" class="secondary"><svg class="icon icon-sm" style="vertical-align:-3px"><use href="#i-volume"></use></svg> Écouter l’anglais</button>${isWord?`<button id="translatorAdd" class="primary">Ajouter à mon Mémo</button>`:""}</div>`:""}${isWord&&data.senses?.length?`<div style="margin-top:12px">${data.senses.map((s,i)=>`<div class="sense-card"><div class="sense-head"><b>${i+1}. ${escapeHTML(s.fr)}</b>${s.example_en?`<button class="sense-audio" data-translator-speak="${escapeHTML(s.example_en)}" title="Écouter la phrase"><svg class="icon icon-sm"><use href="#i-volume"></use></svg></button>`:""}</div>${s.example_en?`<p><b>${escapeHTML(s.example_en)}</b><br><span class="muted">${escapeHTML(s.example_fr||"")}</span></p>`:""}</div>`).join("")}</div>`:""}</div>`;if(english)$("#translatorSpeak").onclick=()=>speak(english);$$('[data-translator-speak]').forEach(b=>b.onclick=()=>speak(b.dataset.translatorSpeak));if(isWord)$("#translatorAdd").onclick=async()=>{showLoading(true);try{const id=await upsertRichWord({...data,en:english,fr:french},data.category||"conversation","translator");await queueWord(id);closeModal("translatorModal");await refreshAll();go("memo");toast("Ajouté à ton Mémo ✓");}catch(e){toast(e.message);}finally{showLoading(false);}};}

function renderCategoryGroupsHTML(selected,onboarding=false){const attr=onboarding?"data-oncat":"data-cat";const base=CATEGORY_GROUPS.map(g=>`<div class="category-group"><h3>${escapeHTML(g.group)}</h3><div class="cat-grid">${g.items.map(([id,label])=>`<button class="cat ${selected.has(id)?"selected":""}" ${attr}="${id}">${escapeHTML(label)}</button>`).join("")}</div></div>`).join("");const themes=state.customThemes.length?`<div class="category-group"><h3>Mes thèmes personnalisés</h3><div class="cat-grid">${state.customThemes.map(t=>{const id=themeCategoryId(t.id);return `<button class="cat ${selected.has(id)?"selected":""}" ${attr}="${id}">✨ ${escapeHTML(t.name)}</button>`;}).join("")}</div></div>`:"";return `<div class="category-groups">${base}${themes}</div>`;}
function openCategoriesModal(){$("#categoryGroups").innerHTML=renderCategoryGroupsHTML(state.selectedCategories,false);$$('[data-cat]').forEach(b=>b.onclick=()=>b.classList.toggle("selected"));openModal("categoriesModal");}
async function saveCategories(){const selected=$$('[data-cat].selected').map(b=>b.dataset.cat);if(!selected.length){toast("Choisis au moins une catégorie.");return;}showLoading(true);try{await expect(sb.from("user_categories").delete().eq("user_id",state.user.id),"Catégories");await expect(sb.from("user_categories").insert(selected.map(category_id=>({user_id:state.user.id,category_id}))),"Catégories");closeModal("categoriesModal");await refreshAll();toast("Catégories mises à jour.");}catch(e){toast(e.message);}finally{showLoading(false);}}
function openThemeModal(forOnboarding=false){state.themeForOnboarding=forOnboarding;state.generatedThemeWords=[];$("#themeTopic").value="";$("#themeLevel").value="beginner";$("#themeCount").value="50";$("#themeCountOther").classList.add("hidden");$("#themePreview").classList.add("hidden");$("#themePreview").innerHTML="";openModal("themeModal");}
async function generateTheme(){const topic=$("#themeTopic").value.trim();if(!topic){toast("Écris le sujet que tu veux apprendre.");return;}let count=$("#themeCount").value==="other"?Number($("#themeCountOther").value):Number($("#themeCount").value);count=Math.max(5,Math.min(100,count||20));showLoading(true);try{const data=await callLanguageTools("theme",{topic,level:$("#themeLevel").value,count});state.generatedThemeWords=data.words||[];const box=$("#themePreview");box.classList.remove("hidden");box.innerHTML=`<div class="info-banner"><div><b>${escapeHTML(data.theme||topic)}</b><br>${state.generatedThemeWords.length} mots proposés. Décoche ceux que tu ne veux pas.</div></div><div class="theme-preview-list">${state.generatedThemeWords.map((w,i)=>`<label class="theme-word"><span><b>${escapeHTML(w.en)}</b><small style="display:block;color:var(--muted)">${escapeHTML(w.fr||w.senses?.[0]?.fr||"")}</small></span><input type="checkbox" data-theme-word="${i}" checked></label>`).join("")}</div><button id="saveThemeBtn" class="primary full" style="margin-top:12px">Ajouter ce thème</button>`;$("#saveThemeBtn").onclick=()=>saveGeneratedTheme(data.theme||topic,$("#themeLevel").value);}catch(e){toast(e.message);}finally{showLoading(false);}}
async function saveGeneratedTheme(name,level){const selected=$$('[data-theme-word]:checked').map(b=>state.generatedThemeWords[Number(b.dataset.themeWord)]).filter(Boolean);if(!selected.length){toast("Garde au moins un mot.");return;}showLoading(true);try{const theme=await expect(sb.from("custom_themes").insert({user_id:state.user.id,name,normalized_name:normalizeText(name),level,word_count:selected.length}).select().single(),"Création thème");const ids=[];for(const meta of selected)ids.push(await upsertRichWord({...meta,category:themeCategoryId(theme.id)},themeCategoryId(theme.id),"theme"));if(ids.length)await expect(sb.from("custom_theme_words").insert([...new Set(ids)].map(word_id=>({theme_id:theme.id,user_id:state.user.id,word_id}))),"Mots du thème");await expect(sb.from("user_categories").upsert({user_id:state.user.id,category_id:themeCategoryId(theme.id)}),"Activation thème");closeModal("themeModal");await refreshAll();if(state.themeForOnboarding){state.onboarding.categories.add(themeCategoryId(theme.id));renderOnboarding();}else{openCategoriesModal();}toast(`Thème “${name}” ajouté ✓`);}catch(e){toast(e.message);}finally{showLoading(false);}}

async function fileToCompressedData(file,max=1600,quality=.82){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext("2d").drawImage(img,0,0,c.width,c.height);const data=c.toDataURL("image/jpeg",quality);URL.revokeObjectURL(url);resolve({data:data.split(",")[1],mime_type:"image/jpeg"});};img.onerror=reject;img.src=url;});}
async function importVocabularyPhoto(file){showLoading(true);try{const image=await fileToCompressedData(file),data=await callLanguageTools("photo",{image});state.photoDetectedWords=data.words||[];if(!state.photoDetectedWords.length)throw new Error("Je n’ai pas trouvé de liste de vocabulaire sur cette photo.");renderPhotoReview();openModal("photoReviewModal");}catch(e){toast(e.message);}finally{showLoading(false);}}
function renderPhotoReview(){$("#photoReviewList").innerHTML=state.photoDetectedWords.map((w,i)=>`<div class="review-row"><input type="checkbox" data-photo-check="${i}" checked><input class="input" data-photo-en="${i}" value="${escapeHTML(w.en||"")}" placeholder="Anglais"><input class="input" data-photo-fr="${i}" value="${escapeHTML(w.fr||w.senses?.[0]?.fr||"")}" placeholder="Français"></div>`).join("");}
function acceptPhotoWords(){const lines=[];$$('[data-photo-check]:checked').forEach(ch=>{const i=Number(ch.dataset.photoCheck),en=$(`[data-photo-en="${i}"]`).value.trim(),fr=$(`[data-photo-fr="${i}"]`).value.trim();if(!en)return;const meta={...state.photoDetectedWords[i],en,fr:fr||state.photoDetectedWords[i].fr};state.importedWordMeta.set(normalizeEnglish(en),meta);lines.push(`${en} = ${fr||meta.fr||""}`);});if(!lines.length){toast("Sélectionne au moins un mot.");return;}const ta=$("#collectionWordsText");ta.value=[ta.value.trim(),...lines].filter(Boolean).join("\n");closeModal("photoReviewModal");toast(`${lines.length} mot${lines.length>1?"s":""} ajouté${lines.length>1?"s":""} à la liste.`);}

function renderProfile(){if(!state.profile)return;const streak=computeCurrentStreak(),record=computeStreakRecord();$("#profileName").textContent=state.profile.display_name;$("#memberSince").textContent=`Member since ${formatMonthYear(state.profile.created_at)}`;$("#profileMastered").textContent=masteredCount();$("#profileStreak").textContent=streak;$("#profileRecord").textContent=record;$("#dailyWordsValue").textContent=state.profile.daily_new_words;$("#dailyMinutesValue").textContent=`${state.profile.daily_minutes||5} min`;$("#writtenToggle").classList.toggle("on",Boolean(state.profile.written_exercises));$("#notificationToggle").classList.toggle("on",Boolean(state.profile.notifications_enabled));$("#notificationTimeSetting").classList.toggle("hidden",!state.profile.notifications_enabled);const t=(state.profile.notification_time||"19:00").slice(0,5);$("#notificationTimeValue").textContent=t;$("#notificationSettingText").textContent=state.profile.notifications_enabled?`Rappel souhaité à ${t}`:"Rappel désactivé";renderAvatar();$("#profileCategoryChips").innerHTML=state.selectedCategories.size?[...state.selectedCategories].map(id=>`<span class="meta-chip">${escapeHTML(getCategoryLabel(id))}</span>`).join(""):`<span class="muted">Aucune catégorie sélectionnée.</span>`;}
function openProfileModal(){$("#profileNameInput").value=state.profile.display_name;$("#avatarFileInput").value="";$("#avatarCropArea").classList.add("hidden");state.crop=null;openModal("profileModal");}
function setupAvatarCrop(file){const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{state.crop={img,url,zoom:1,rotation:0,offsetX:0,offsetY:0,dragging:false,lastX:0,lastY:0};$("#avatarZoom").value="1";$("#avatarCropArea").classList.remove("hidden");drawCrop();};img.onerror=()=>toast("Impossible de lire cette photo.");img.src=url;}
function drawCrop(){if(!state.crop)return;const c=$("#avatarCropCanvas"),ctx=c.getContext("2d"),{img,zoom,rotation,offsetX,offsetY}=state.crop;ctx.clearRect(0,0,c.width,c.height);ctx.save();ctx.translate(c.width/2+offsetX,c.height/2+offsetY);ctx.rotate(rotation*Math.PI/180);const swap=rotation%180!==0,iw=swap?img.height:img.width,ih=swap?img.width:img.height,base=Math.max(c.width/iw,c.height/ih),scale=base*zoom;ctx.scale(scale,scale);ctx.drawImage(img,-img.width/2,-img.height/2);ctx.restore();}
function bindCropDrag(){const c=$("#avatarCropCanvas");let active=false,lastX=0,lastY=0;c.addEventListener("pointerdown",e=>{if(!state.crop)return;active=true;lastX=e.clientX;lastY=e.clientY;c.setPointerCapture?.(e.pointerId);});c.addEventListener("pointermove",e=>{if(!active||!state.crop)return;const rect=c.getBoundingClientRect(),ratio=c.width/rect.width;state.crop.offsetX+=(e.clientX-lastX)*ratio;state.crop.offsetY+=(e.clientY-lastY)*ratio;lastX=e.clientX;lastY=e.clientY;drawCrop();});const stop=()=>active=false;c.addEventListener("pointerup",stop);c.addEventListener("pointercancel",stop);}
async function croppedAvatarBlob(){return new Promise(resolve=>$("#avatarCropCanvas").toBlob(resolve,"image/jpeg",.9));}
async function saveProfile(){showLoading(true);try{const name=$("#profileNameInput").value.trim()||"Learner";let avatar_path=state.profile.avatar_path;if(state.crop){const blob=await croppedAvatarBlob(),path=`${state.user.id}/avatar-${Date.now()}.jpg`;await expect(sb.storage.from("avatars").upload(path,blob,{upsert:true,contentType:"image/jpeg"}),"Photo de profil");if(avatar_path)await sb.storage.from("avatars").remove([avatar_path]);avatar_path=path;if(state.crop.url)URL.revokeObjectURL(state.crop.url);}await expect(sb.from("profiles").update({display_name:name,avatar_path,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Profil");closeModal("profileModal");state.crop=null;await refreshAll();await loadAvatar();toast("Profil mis à jour.");}catch(e){toast(e.message);}finally{showLoading(false);}}
async function removeAvatar(){try{if(state.profile.avatar_path)await sb.storage.from("avatars").remove([state.profile.avatar_path]);await expect(sb.from("profiles").update({avatar_path:null,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Avatar");state.profile.avatar_path=null;state.avatarUrl=null;closeModal("profileModal");renderAvatar();toast("Avatar avec initiale réactivé.");}catch(e){toast(e.message);}}

async function updateProfileField(patch){await expect(sb.from("profiles").update({...patch,updated_at:new Date().toISOString()}).eq("user_id",state.user.id),"Réglage profil");state.profile={...state.profile,...patch};renderAll();}
function renderNumberSetting(title,current,values,onSave,max=30){$("#settingTitle").textContent=title;$("#settingContent").innerHTML=`<div id="settingChoices" class="number-choices">${values.map(n=>`<button data-set-number="${n}" class="${current===n?"selected":""}">${n}</button>`).join("")}<button data-set-number="other" class="${!values.includes(current)?"selected":""}">Autre</button></div><div id="settingOtherWrap" class="${!values.includes(current)?"":"hidden"}"><input id="settingNumber" class="input" type="number" min="1" max="${max}" value="${!values.includes(current)?current:Math.min(max,values[values.length-1]+1)}"></div>`;let selected=current;$$('[data-set-number]').forEach(b=>b.onclick=()=>{const v=b.dataset.setNumber;if(v==="other"){$("#settingOtherWrap").classList.remove("hidden");selected=null;}else{$("#settingOtherWrap").classList.add("hidden");selected=Number(v);}$$('[data-set-number]').forEach(x=>x.classList.toggle("selected",x===b));});state.settingSaveHandler=async()=>{const n=selected??Number($("#settingNumber").value);await onSave(Math.max(1,Math.min(max,n||current)));};openModal("settingModal");}
function openWordsPerDaySetting(){renderNumberSetting("Nouveaux mots par jour",Number(state.profile.daily_new_words||3),[1,2,3,4,5,6,7,8,9,10],async n=>{await updateProfileField({daily_new_words:n});toast("Le nouveau rythme s’appliquera à la prochaine séance.");},30);}
function openDailyMinutesSetting(){renderNumberSetting("Objectif quotidien",Number(state.profile.daily_minutes||5),[5,10,15,20],async n=>{await updateProfileField({daily_minutes:n});toast("Objectif quotidien mis à jour.");},60);}
function openNotificationTimeSetting(){$("#settingTitle").textContent="Heure du rappel";$("#settingContent").innerHTML=`<input id="settingTime" class="input" type="time" value="${(state.profile.notification_time||"19:00").slice(0,5)}"><p class="muted">L’heure est enregistrée dans ton profil.</p>`;state.settingSaveHandler=async()=>{await updateProfileField({notification_time:$("#settingTime").value||"19:00"});toast("Heure enregistrée.");};openModal("settingModal");}
async function toggleWrittenExercises(){await updateProfileField({written_exercises:!state.profile.written_exercises});}
async function toggleNotifications(){const enabling=!state.profile.notifications_enabled;if(enabling&&"Notification" in window){const perm=await Notification.requestPermission();if(perm!=="granted"){toast("Autorisation de notification non accordée.");return;}}await updateProfileField({notifications_enabled:enabling});if(enabling)toast("Préférence de rappel activée.");}
async function testNotification(){if(!state.profile?.notifications_enabled){toast("Active d’abord les notifications dans Profil.");return;}if(!("Notification" in window)||Notification.permission!=="granted"){toast("Les notifications ne sont pas autorisées sur cet appareil.");return;}const reg=await navigator.serviceWorker?.ready;if(reg)reg.showNotification("3 Words a Day",{body:"Tes mots t’attendent — petite séance, gros progrès.",icon:"icon-192.png",badge:"icon-192.png"});else new Notification("3 Words a Day",{body:"Tes mots t’attendent."});}

function openModal(id){$("#"+id).classList.add("show");}
function closeModal(id){$("#"+id).classList.remove("show");}
function confirmAction(title,text,okLabel,handler){$("#confirmTitle").textContent=title;$("#confirmText").textContent=text;$("#confirmOk").textContent=okLabel;state.confirmHandler=handler;openModal("confirmModal");}

populateWordCategory();
init().catch(e=>{console.error(e);toast(e.message);showLoading(false);});
