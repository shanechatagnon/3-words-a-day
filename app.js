
const WORDS = [
  {
    "id": "pending",
    "en": "pending",
    "fr": "en attente / en cours de traitement",
    "example": "The payment is still pending.",
    "example_fr": "Le paiement est toujours en attente.",
    "cat": "Travail"
  },
  {
    "id": "upcoming",
    "en": "upcoming",
    "fr": "à venir / prochain",
    "example": "You can see your upcoming tasks.",
    "example_fr": "Tu peux voir tes tâches à venir.",
    "cat": "Travail"
  },
  {
    "id": "revenue",
    "en": "revenue",
    "fr": "chiffre d’affaires / revenus",
    "example": "The company increased its revenue.",
    "example_fr": "L’entreprise a augmenté son chiffre d’affaires.",
    "cat": "Commerce"
  },
  {
    "id": "overdue",
    "en": "overdue",
    "fr": "en retard / dépassé",
    "example": "This invoice is overdue.",
    "example_fr": "Cette facture est en retard.",
    "cat": "Travail"
  },
  {
    "id": "invoice",
    "en": "invoice",
    "fr": "facture",
    "example": "I sent the invoice this morning.",
    "example_fr": "J’ai envoyé la facture ce matin.",
    "cat": "Commerce"
  },
  {
    "id": "appointment",
    "en": "appointment",
    "fr": "rendez-vous",
    "example": "I have an appointment at ten.",
    "example_fr": "J’ai un rendez-vous à dix heures.",
    "cat": "Quotidien"
  },
  {
    "id": "as-well",
    "en": "as well",
    "fr": "aussi / également",
    "example": "I speak French and English as well.",
    "example_fr": "Je parle français et aussi anglais.",
    "cat": "Conversation"
  },
  {
    "id": "anyway",
    "en": "anyway",
    "fr": "de toute façon / quand même",
    "example": "Anyway, we can try again tomorrow.",
    "example_fr": "De toute façon, on peut réessayer demain.",
    "cat": "Conversation"
  },
  {
    "id": "while",
    "en": "while",
    "fr": "pendant que / alors que",
    "example": "I worked while she was travelling.",
    "example_fr": "J’ai travaillé pendant qu’elle voyageait.",
    "cat": "Conversation"
  },
  {
    "id": "keep",
    "en": "to keep",
    "fr": "garder / conserver",
    "example": "Keep this document for later.",
    "example_fr": "Garde ce document pour plus tard.",
    "cat": "Verbes"
  },
  {
    "id": "leave",
    "en": "to leave",
    "fr": "partir / quitter",
    "example": "I have to leave now.",
    "example_fr": "Je dois partir maintenant.",
    "cat": "Verbes"
  },
  {
    "id": "catch",
    "en": "to catch",
    "fr": "attraper / prendre",
    "example": "I need to catch the train.",
    "example_fr": "Je dois prendre le train.",
    "cat": "Voyage"
  },
  {
    "id": "actually",
    "en": "actually",
    "fr": "en fait / en réalité",
    "example": "Actually, I already know this word.",
    "example_fr": "En fait, je connais déjà ce mot.",
    "cat": "Conversation"
  },
  {
    "id": "however",
    "en": "however",
    "fr": "cependant / toutefois",
    "example": "The hotel is expensive; however, it is very well located.",
    "example_fr": "L’hôtel est cher ; cependant, il est très bien situé.",
    "cat": "Conversation"
  },
  {
    "id": "instead",
    "en": "instead",
    "fr": "à la place / plutôt",
    "example": "Let’s take the train instead.",
    "example_fr": "Prenons plutôt le train.",
    "cat": "Conversation"
  },
  {
    "id": "manage",
    "en": "to manage",
    "fr": "gérer / réussir à",
    "example": "I managed to finish the task.",
    "example_fr": "J’ai réussi à terminer la tâche.",
    "cat": "Verbes"
  },
  {
    "id": "improve",
    "en": "to improve",
    "fr": "améliorer / s’améliorer",
    "example": "I want to improve my English.",
    "example_fr": "Je veux améliorer mon anglais.",
    "cat": "Verbes"
  },
  {
    "id": "choose",
    "en": "to choose",
    "fr": "choisir",
    "example": "You can choose any room.",
    "example_fr": "Tu peux choisir n’importe quelle chambre.",
    "cat": "Verbes"
  },
  {
    "id": "book",
    "en": "to book",
    "fr": "réserver",
    "example": "I’d like to book a room.",
    "example_fr": "J’aimerais réserver une chambre.",
    "cat": "Hôtel"
  },
  {
    "id": "available",
    "en": "available",
    "fr": "disponible",
    "example": "Is this room available tonight?",
    "example_fr": "Cette chambre est-elle disponible ce soir ?",
    "cat": "Hôtel"
  },
  {
    "id": "fully-booked",
    "en": "fully booked",
    "fr": "complet",
    "example": "The hotel is fully booked.",
    "example_fr": "L’hôtel est complet.",
    "cat": "Hôtel"
  },
  {
    "id": "reception-desk",
    "en": "reception desk",
    "fr": "réception / comptoir d’accueil",
    "example": "Please ask at the reception desk.",
    "example_fr": "Demandez à la réception, s’il vous plaît.",
    "cat": "Hôtel"
  },
  {
    "id": "luggage",
    "en": "luggage",
    "fr": "bagages",
    "example": "Can I leave my luggage here?",
    "example_fr": "Puis-je laisser mes bagages ici ?",
    "cat": "Voyage"
  },
  {
    "id": "boarding-pass",
    "en": "boarding pass",
    "fr": "carte d’embarquement",
    "example": "Please show your boarding pass.",
    "example_fr": "Veuillez montrer votre carte d’embarquement.",
    "cat": "Voyage"
  },
  {
    "id": "departure",
    "en": "departure",
    "fr": "départ",
    "example": "The departure is at 7 a.m.",
    "example_fr": "Le départ est à 7 h.",
    "cat": "Voyage"
  },
  {
    "id": "settings",
    "en": "settings",
    "fr": "réglages / paramètres",
    "example": "Open the settings menu.",
    "example_fr": "Ouvre le menu des paramètres.",
    "cat": "Numérique"
  },
  {
    "id": "subscription",
    "en": "subscription",
    "fr": "abonnement",
    "example": "You can cancel your subscription anytime.",
    "example_fr": "Tu peux annuler ton abonnement à tout moment.",
    "cat": "Commerce"
  },
  {
    "id": "login",
    "en": "login",
    "fr": "connexion / identifiants selon le contexte",
    "example": "Use your work email to log in.",
    "example_fr": "Utilise ton e-mail professionnel pour te connecter.",
    "cat": "Numérique"
  },
  {
    "id": "save",
    "en": "to save",
    "fr": "enregistrer / sauvegarder",
    "example": "Don’t forget to save your work.",
    "example_fr": "N’oublie pas d’enregistrer ton travail.",
    "cat": "Numérique"
  },
  {
    "id": "hide",
    "en": "to hide",
    "fr": "masquer / cacher",
    "example": "You can hide this section.",
    "example_fr": "Tu peux masquer cette section.",
    "cat": "Numérique"
  },
  {
    "id": "allow",
    "en": "to allow",
    "fr": "permettre / autoriser",
    "example": "This feature allows users to save time.",
    "example_fr": "Cette fonction permet aux utilisateurs de gagner du temps.",
    "cat": "Numérique"
  },
  {
    "id": "common",
    "en": "common",
    "fr": "courant / fréquent",
    "example": "This is a common mistake.",
    "example_fr": "C’est une erreur fréquente.",
    "cat": "Conversation"
  },
  {
    "id": "mistake",
    "en": "mistake",
    "fr": "erreur",
    "example": "Everyone makes mistakes.",
    "example_fr": "Tout le monde fait des erreurs.",
    "cat": "Quotidien"
  },
  {
    "id": "someone",
    "en": "someone",
    "fr": "quelqu’un",
    "example": "Someone is waiting for you.",
    "example_fr": "Quelqu’un t’attend.",
    "cat": "Quotidien"
  },
  {
    "id": "office",
    "en": "office",
    "fr": "bureau",
    "example": "I’m at the office today.",
    "example_fr": "Je suis au bureau aujourd’hui.",
    "cat": "Travail"
  },
  {
    "id": "payroll",
    "en": "payroll",
    "fr": "paie / gestion de la paie",
    "example": "She works in payroll.",
    "example_fr": "Elle travaille dans la gestion de la paie.",
    "cat": "Travail"
  },
  {
    "id": "payslip",
    "en": "payslip",
    "fr": "bulletin de salaire",
    "example": "Your payslip is available online.",
    "example_fr": "Ton bulletin de salaire est disponible en ligne.",
    "cat": "Travail"
  },
  {
    "id": "setup",
    "en": "setup",
    "fr": "installation / configuration / mise en place",
    "example": "The setup only takes a few minutes.",
    "example_fr": "La configuration ne prend que quelques minutes.",
    "cat": "Numérique"
  },
  {
    "id": "browse",
    "en": "to browse",
    "fr": "parcourir / naviguer",
    "example": "You can browse the available offers.",
    "example_fr": "Tu peux parcourir les offres disponibles.",
    "cat": "Numérique"
  },
  {
    "id": "overview",
    "en": "overview",
    "fr": "vue d’ensemble",
    "example": "Here is an overview of the project.",
    "example_fr": "Voici une vue d’ensemble du projet.",
    "cat": "Travail"
  }
];
const cfg = window.APP_CONFIG || {};
const publicKey = cfg.SUPABASE_PUBLISHABLE_KEY || cfg.SUPABASE_ANON_KEY || "";
const hasSupabase = Boolean(cfg.SUPABASE_URL && publicKey);
const supabaseClient = hasSupabase ? supabase.createClient(cfg.SUPABASE_URL, publicKey) : null;

const $ = (s) => document.querySelector(s);
const todayISO = () => new Date().toISOString().slice(0,10);
let currentUser = null;
let progress = {};
let queue = [];
let queueIndex = 0;
let currentMode = "new";

function localKey() { return "threewords-progress-v1-1"; }
function loadLocal() {
  try { progress = JSON.parse(localStorage.getItem(localKey()) || "{}"); } catch { progress = {}; }
}
function saveLocal() { localStorage.setItem(localKey(), JSON.stringify(progress)); }

async function loadProgress() {
  if (!hasSupabase || !currentUser) { loadLocal(); return; }
  const { data, error } = await supabaseClient
    .from("user_progress")
    .select("*")
    .eq("user_id", currentUser.id);
  if (error) throw error;
  progress = {};
  (data || []).forEach(r => progress[r.word_id] = r);
}

async function persistWord(wordId) {
  const p = progress[wordId];
  if (!hasSupabase || !currentUser) { saveLocal(); return; }
  const row = {
    user_id: currentUser.id,
    word_id: wordId,
    status: p.status,
    interval_days: p.interval_days || 0,
    repetitions: p.repetitions || 0,
    last_grade: p.last_grade || null,
    next_review: p.next_review || null,
    last_review: p.last_review || null,
    learned_on: p.learned_on || null
  };
  const { error } = await supabaseClient.from("user_progress").upsert(row);
  if (error) throw error;
}

function getState(wordId) {
  return progress[wordId] || { status:"new", interval_days:0, repetitions:0, next_review:null };
}

function getNewWords() {
  return WORDS.filter(w => getState(w.id).status === "new").slice(0, 3);
}
function getDueWords() {
  const t = todayISO();
  return WORDS.filter(w => {
    const p = getState(w.id);
    return p.status !== "new" && p.next_review && p.next_review <= t;
  });
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}

function schedule(wordId, grade) {
  const p = getState(wordId);
  let reps = p.repetitions || 0;
  let interval = p.interval_days || 0;

  if (grade === "again") {
    reps = 0; interval = 1;
  } else if (grade === "hard") {
    reps = Math.max(1, reps);
    interval = Math.max(1, Math.round(interval ? interval * 1.4 : 1));
  } else if (grade === "good") {
    reps += 1;
    interval = reps === 1 ? 2 : Math.max(2, Math.round((interval || 1) * 2));
  } else {
    reps += 1;
    interval = reps === 1 ? 4 : Math.max(4, Math.round((interval || 2) * 2.5));
  }

  const status = (grade === "again" || grade === "hard") ? "learning" : "learned";
  progress[wordId] = {
    ...p,
    status,
    last_grade: grade,
    repetitions: reps,
    interval_days: interval,
    last_review: new Date().toISOString(),
    learned_on: p.learned_on || todayISO(),
    next_review: addDays(interval)
  };
}

function markKnown(wordId) {
  progress[wordId] = {
    ...getState(wordId),
    status: "learned",
    last_grade: "known",
    repetitions: 2,
    interval_days: 14,
    last_review: new Date().toISOString(),
    learned_on: getState(wordId).learned_on || todayISO(),
    next_review: addDays(14)
  };
}

function updateHome() {
  const learned = Object.values(progress).filter(p => p.status === "learned").length;
  const needsWork = Object.values(progress).filter(p => p.status === "learning").length;
  const fresh = getNewWords().length;
  $("#learnedCount").textContent = learned;
  $("#reviewCount").textContent = needsWork;
  $("#newCount").textContent = fresh;
  $("#modeBadge").textContent = hasSupabase && currentUser ? "Synchronisé" : "Mode local";
  $("#syncHint").textContent = hasSupabase && currentUser
    ? "Ta progression est synchronisée entre tes appareils."
    : "La version fonctionne déjà. Active Supabase pour synchroniser téléphone et ordinateur.";
  $("#startBtn").disabled = fresh === 0 && due === 0;
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/^to\s+/,""));
  u.lang = "en-GB";
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function startSession() {
  const due = getDueWords();
  const fresh = getNewWords();
  queue = [...due, ...fresh];
  currentMode = "mixed";
  queueIndex = 0;
  $("#home").hidden = true;
  $("#study").hidden = false;
  renderCard();
}

function renderCard() {
  if (queueIndex >= queue.length) {
    $("#study").innerHTML = `
      <div class="done">
        <div class="big">🎉</div>
        <h2>Séance terminée</h2>
        <p>Bravo ! Ta progression a été enregistrée.</p>
        <button class="primary" onclick="location.reload()">Retour à l’accueil</button>
      </div>`;
    return;
  }
  const w = queue[queueIndex];
  const isNew = getState(w.id).status === "new";
  $("#cardCounter").textContent = `${queueIndex+1} / ${queue.length}`;
  $("#cardCategory").textContent = w.cat + (isNew ? " · nouveau" : " · révision");
  $("#word").textContent = w.en;
  $("#answer").hidden = true;
  $("#translation").textContent = w.fr;
  $("#example").textContent = w.example;
  $("#exampleFr").textContent = w.example_fr;
  $("#knownBtn").hidden = !isNew;
  $("#ratingRow").hidden = true;
  $("#revealBtn").hidden = false;
}

async function reveal() {
  $("#answer").hidden = false;
  $("#ratingRow").hidden = false;
  $("#revealBtn").hidden = true;
}

async function answer(grade) {
  const w = queue[queueIndex];
  schedule(w.id, grade);
  await persistWord(w.id);
  queueIndex += 1;
  renderCard();
}

async function alreadyKnow() {
  const w = queue[queueIndex];
  markKnown(w.id);
  await persistWord(w.id);
  queueIndex += 1;
  renderCard();
}

async function signIn() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || !password) return showAuthMsg("Entre ton e-mail et ton mot de passe.");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return showAuthMsg(error.message);
  currentUser = data.user;
  $("#authPanel").hidden = true;
  await loadProgress(); updateHome();
}

async function signUp() {
  const email = $("#email").value.trim();
  const password = $("#password").value;
  if (!email || password.length < 6) return showAuthMsg("Choisis un mot de passe d’au moins 6 caractères.");
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) return showAuthMsg(error.message);
  showAuthMsg("Compte créé. Si Supabase demande une confirmation e-mail, valide-la puis connecte-toi.");
}

function showAuthMsg(msg) { $("#authMsg").textContent = msg; }

async function initAuth() {
  if (!hasSupabase) {
    $("#authPanel").hidden = true;
    $("#configBanner").hidden = false;
    loadLocal(); updateHome(); return;
  }
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  $("#authPanel").hidden = Boolean(currentUser);
  $("#configBanner").hidden = true;
  if (currentUser) await loadProgress(); else loadLocal();
  updateHome();
}

$("#startBtn").addEventListener("click", startSession);
$("#revealBtn").addEventListener("click", reveal);
$("#speakBtn").addEventListener("click", () => speak($("#word").textContent));
$("#againBtn").addEventListener("click", () => answer("again"));
$("#hardBtn").addEventListener("click", () => answer("hard"));
$("#goodBtn").addEventListener("click", () => answer("good"));
$("#easyBtn").addEventListener("click", () => answer("easy"));
$("#knownBtn").addEventListener("click", alreadyKnow);
if ($("#signinBtn")) $("#signinBtn").addEventListener("click", signIn);
if ($("#signupBtn")) $("#signupBtn").addEventListener("click", signUp);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
initAuth().catch(err => {
  console.error(err);
  loadLocal();
  updateHome();
});
