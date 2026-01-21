// Wedderburn Portal v0.2 — full intake wizard + assistant
const STORAGE_KEY = "wedderburn_portal_state_v2";
let currentStepIdx = 0;
let assistantMessages = [];
let assistantCanvas;

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const nowIso = () => new Date().toISOString();

function loadState(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveState(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function resetLocal(){ localStorage.removeItem(STORAGE_KEY); }

function toast(msg){
  $("#appToastBody").textContent = msg;
  bootstrap.Toast.getOrCreateInstance($("#appToast"), { delay: 2200 }).show();
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function setDeep(obj, path, value){
  const parts = path.split(".");
  let cur = obj;
  for(let i=0;i<parts.length-1;i++){
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length-1]] = value;
}
function getDeep(obj, path){
  const parts = path.split(".");
  let cur = obj;
  for(const p of parts){
    if(cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

const routes = {
  "/home": renderHome,
  "/services": renderServices,
  "/privacy": renderPrivacy,
  "/start": renderIntake,
  "/summary": renderSummary,
  "/admin": renderAdmin
};
function getPath(){
  const hash = window.location.hash || "#/home";
  const path = hash.replace("#", "");
  return routes[path] ? path : "/home";
}
function mountTemplate(id){
  const tpl = document.getElementById(id);
  const view = document.getElementById("view");
  view.innerHTML = "";
  view.appendChild(tpl.content.cloneNode(true));
}
function render(){ routes[getPath()](); }

window.addEventListener("hashchange", render);
window.addEventListener("DOMContentLoaded", async () => {
  $("#btnReset").addEventListener("click", () => {
    if(confirm("Reset local draft data? (Encrypted submissions stored on disk remain.)")){
      resetLocal(); toast("Local draft cleared."); window.location.hash = "#/home";
    }
  });
  $("#btnOpenAdmin").addEventListener("click", () => window.location.hash = "#/admin");

  assistantCanvas = new bootstrap.Offcanvas(document.getElementById("assistantCanvas"));
  $("#btnOpenChat").addEventListener("click", openAssistant);

  render();
});

async function updateAssistantStatus(){
  const badge = $("#assistantStatus");
  try{
    const res = await fetch("/api/health");
    const j = await res.json();
    if(j.ok){
      badge.textContent = j.ollama_ok ? "Ready" : "Server OK / Ollama not ready";
      badge.className = "badge " + (j.ollama_ok ? "text-bg-success" : "text-bg-warning");
    } else {
      badge.textContent = "Server error";
      badge.className = "badge text-bg-danger";
    }
  } catch {
    badge.textContent = "Offline server not running";
    badge.className = "badge text-bg-danger";
  }
}

function openAssistant(){
  assistantCanvas.show();
  wireAssistantUI();
  updateAssistantStatus();
}
function wireAssistantUI(){
  const sendBtn = $("#assistantSend");
  const input = $("#assistantInput");
  const clearBtn = $("#assistantClear");
  const checklistBtn = $("#assistantDraftChecklist");

  const hook = (id) => { const b = $(id); if(b) b.onclick = openAssistant; };
  hook("#btnOpenChat2"); hook("#btnOpenChat3"); hook("#btnOpenChat4");

  sendBtn.onclick = () => sendAssistantMessage();
  input.onkeydown = (e) => { if(e.key === "Enter"){ e.preventDefault(); sendAssistantMessage(); } };

  clearBtn.onclick = () => { assistantMessages = []; renderAssistantChat(); toast("Assistant chat cleared."); };
  checklistBtn.onclick = () => {
    $("#assistantInput").value = "Create an intake completion checklist for this client. Ask only the missing questions and prioritize digital assets.";
    sendAssistantMessage();
  };

  renderAssistantChat();
}
function renderAssistantChat(){
  const chat = $("#assistantChat");
  chat.innerHTML = "";
  if(!assistantMessages.length){
    chat.innerHTML = `<div class="small text-muted p-2">No messages yet.</div>`;
    return;
  }
  for(const m of assistantMessages){
    const div = document.createElement("div");
    div.className = "msg " + (m.role === "user" ? "user" : "assistant");
    div.innerHTML = `<div class="meta">${m.role === "user" ? "You" : "Assistant"}</div><div>${escapeHtml(m.content).replaceAll("\n","<br>")}</div>`;
    chat.appendChild(div);
  }
  chat.scrollTop = chat.scrollHeight;
}
async function sendAssistantMessage(){
  const input = $("#assistantInput");
  const text = (input.value || "").trim();
  if(!text) return;
  input.value = "";
  assistantMessages.push({ role: "user", content: text });
  renderAssistantChat();

  const mode = $("#assistantMode").value;
  const include = $("#assistantIncludeContext").checked;
  const intake_context = include ? loadState() : null;

  try{
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ mode, messages: assistantMessages, intake_context })
    });
    const j = await res.json();
    if(!res.ok){
      assistantMessages.push({ role:"assistant", content:`Error: ${j.detail || "Request failed"}` });
    } else {
      assistantMessages.push({ role:"assistant", content: j.reply || "(no reply)" });
    }
  } catch {
    assistantMessages.push({ role:"assistant", content:"Assistant unavailable. Start the local server and ensure Ollama is running." });
  }
  renderAssistantChat();
}

// Views
function renderHome(){ mountTemplate("tpl-home"); const b=$("#btnOpenChat2"); if(b) b.onclick=openAssistant; }
function renderServices(){ mountTemplate("tpl-services"); const b=$("#btnOpenChat3"); if(b) b.onclick=openAssistant; }
function renderPrivacy(){ mountTemplate("tpl-privacy"); }

// Intake steps
const steps = [
  { key:"client", label:"Client", sub:"identity + contact", render: stepClient },
  { key:"family", label:"Family", sub:"beneficiaries + fiduciaries", render: stepFamily },
  { key:"services", label:"Services", sub:"what you want drafted", render: stepServices },
  { key:"assets", label:"Assets", sub:"home, accounts, business", render: stepAssets },
  { key:"digital", label:"Digital", sub:"crypto, NFTs, social, access", render: stepDigital },
  { key:"uploads", label:"Uploads", sub:"documents + OCR (demo)", render: stepUploads }
];

function renderIntake(){
  mountTemplate("tpl-intake");
  const state = loadState();
  currentStepIdx = Number.isInteger(state.currentStepIdx) ? state.currentStepIdx : 0;
  renderStepper();
  renderCurrentStep();
  wireNavButtons();
  updateProgressUI();
  const b=$("#btnOpenChat4"); if(b) b.onclick=openAssistant;
}
function renderStepper(){
  const el = $("#stepper");
  el.innerHTML = "";
  const state = loadState();
  const completed = new Set(state.completedSteps || []);
  steps.forEach((s, idx) => {
    const chip = document.createElement("div");
    chip.className = "step-chip" + (idx===currentStepIdx ? " active" : "") + (completed.has(s.key) ? " done" : "");
    chip.role="button"; chip.tabIndex=0;
    chip.innerHTML = `<div class="dot"></div><div><div class="label">${idx+1}. ${escapeHtml(s.label)}</div><div class="sub">${escapeHtml(s.sub)}</div></div>`;
    chip.onclick = () => { currentStepIdx=idx; persistCurrentStepIdx(); renderStepper(); renderCurrentStep(); updateProgressUI(); };
    el.appendChild(chip);
  });
}
function renderCurrentStep(){
  const container = $("#stepContainer");
  container.innerHTML = "";
  const state = loadState();
  container.innerHTML = steps[currentStepIdx].render(state);
  wireAutofillFromState(state);
  wireOcrButtons();
}
function persistCurrentStepIdx(){
  const state = loadState();
  state.currentStepIdx = currentStepIdx;
  saveState(state);
}
function updateProgressUI(){
  const state = loadState();
  const completed = new Set(state.completedSteps || []);
  const pct = Math.round((completed.size / steps.length) * 100);
  $("#progressBar").style.width = `${pct}%`;
  $("#progressText").textContent = `${pct}%`;
}
function wireNavButtons(){
  $("#btnPrev").onclick = () => {
    if(currentStepIdx>0){
      currentStepIdx--; persistCurrentStepIdx(); renderStepper(); renderCurrentStep(); updateProgressUI();
    } else { window.location.hash = "#/home"; }
  };
  $("#btnSave").onclick = () => { if(saveStepFromForm()){ toast("Saved."); renderStepper(); updateProgressUI(); } };
  $("#btnNext").onclick = () => {
    if(!saveStepFromForm({markComplete:true})) return;
    if(currentStepIdx < steps.length-1){
      currentStepIdx++; persistCurrentStepIdx(); renderStepper(); renderCurrentStep(); updateProgressUI();
      window.scrollTo({top:0, behavior:"smooth"});
    } else { showSubmitButton(); }
  };
  $("#btnSubmit").onclick = async () => { if(saveStepFromForm({markComplete:true})) await submitEncrypted(); };
  showSubmitButton();
}
function showSubmitButton(){
  const isLast = currentStepIdx === steps.length-1;
  $("#btnSubmit").classList.toggle("d-none", !isLast);
  $("#btnNext").classList.toggle("d-none", isLast);
}

function saveStepFromForm({markComplete=false} = {}){
  const form = $("#intakeForm");
  const state = loadState();
  // validate required
  for(const el of $$("[data-required='true']", form)){
    const ok = el.type==="checkbox" ? el.checked : String(el.value||"").trim();
    if(!ok){
      el.classList.add("is-invalid");
      el.focus();
      toast("Please complete the required fields in this step.");
      return false;
    } else {
      el.classList.remove("is-invalid");
    }
  }
  for(const el of $$("input,select,textarea", form)){
    const key = el.getAttribute("data-key");
    if(!key) continue;
    if(el.type === "file") continue;
    if(el.type === "checkbox") setDeep(state, key, el.checked);
    else setDeep(state, key, el.value);
  }
  for(const el of $$("input[type='file'][data-key]", form)){
    const key = el.getAttribute("data-key");
    const files = [...(el.files||[])].map(f=>({name:f.name,size:f.size,type:f.type,capturedAt:nowIso()}));
    setDeep(state, key, files);
  }
  state.lastSavedAt = nowIso();
  if(markComplete){
    const set = new Set(state.completedSteps || []);
    set.add(steps[currentStepIdx].key);
    state.completedSteps = [...set];
  }
  saveState(state);
  return true;
}
function wireAutofillFromState(state){
  const form = $("#intakeForm");
  for(const el of $$("input,select,textarea", form)){
    const key = el.getAttribute("data-key");
    if(!key) continue;
    if(el.type==="file") continue;
    const val = getDeep(state, key);
    if(val === undefined || val === null) continue;
    if(el.type==="checkbox") el.checked = Boolean(val);
    else el.value = String(val);
  }
}

async function submitEncrypted(){
  const state = loadState();
  try{
    const res = await fetch("/api/intake/submit", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ intake: state })
    });
    const j = await res.json();
    if(!res.ok){ toast("Submit failed. Start the local server."); return; }
    state.submissionId = j.id;
    saveState(state);
    toast("Submitted (encrypted). Opening summary…");
    window.location.hash = "#/summary";
  } catch {
    toast("Submit failed. Start the local server.");
  }
}

// Summary
function formatBytes(b){
  if(!Number.isFinite(b)) return "—";
  const units=["B","KB","MB","GB"];
  let n=b,u=0; while(n>=1024 && u<units.length-1){ n/=1024; u++; }
  return `${n.toFixed(u===0?0:1)} ${units[u]}`;
}
function nl(s){ return String(s||"").replaceAll("\n","<br>"); }
function selectedServices(state){
  const map=[["services.will","Will"],["services.trust","Trust"],["services.poa","POA"],["services.health","Health"],["services.digital","Digital"]];
  return map.filter(([k])=>Boolean(getDeep(state,k))).map(([,v])=>v);
}
function renderSummary(){
  mountTemplate("tpl-summary");
  const state = loadState();
  $("#summaryContent").innerHTML = summaryHtml(state);

  $("#btnExportJson").onclick = () => {
    const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url; a.download="wedderburn-intake.json"; a.click();
    URL.revokeObjectURL(url);
  };

  $("#btnGenerateProfile").onclick = async () => {
    const panel=$("#profilePanel"), pre=$("#profileText");
    pre.textContent="Generating… (requires Ollama)"; panel.classList.remove("d-none");
    try{
      const res = await fetch("/api/profile", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ intake: state })
      });
      const j = await res.json();
      if(!res.ok) pre.textContent = `Error: ${j.detail || "Profile generation failed"}`;
      else pre.textContent = j.profile || "(no profile)";
    } catch {
      pre.textContent = "Profile generation unavailable. Start server + Ollama.";
    }
  };
}
function summaryHtml(state){
  const s=state||{};
  const name = getDeep(s,"client.fullName") || "—";
  const email = getDeep(s,"client.email") || "—";
  const phone = getDeep(s,"client.phone") || "—";
  const st = getDeep(s,"client.state") || "—";
  const svc = selectedServices(s);
  const uploads = getDeep(s,"uploads.files") || [];
  return `
    <div class="kv mb-4">
      <div class="k">Client</div><div class="v">${escapeHtml(name)}</div>
      <div class="k">Email</div><div class="v">${escapeHtml(email)}</div>
      <div class="k">Phone</div><div class="v">${escapeHtml(phone)}</div>
      <div class="k">State</div><div class="v">${escapeHtml(st)}</div>
      <div class="k">Submission ID</div><div class="v muted">${escapeHtml(s.submissionId || "—")}</div>
      <div class="k">Last saved</div><div class="v muted">${escapeHtml(s.lastSavedAt || "")}</div>
    </div>

    <h2 class="h6">Services requested</h2>
    <div class="mb-3">${svc.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("") || '<span class="text-muted">—</span>'}</div>

    <div class="row g-3">
      <div class="col-12 col-md-6">
        <div class="mini-card">
          <div class="fw-semibold mb-1">Family + fiduciaries</div>
          <div class="small text-secondary"><strong>Beneficiaries:</strong><br>${nl(escapeHtml(getDeep(s,"family.beneficiaries")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>Executor:</strong> ${escapeHtml(getDeep(s,"family.executor")||"—")}</div>
          <div class="small text-secondary"><strong>POA Agent:</strong> ${escapeHtml(getDeep(s,"family.poaAgent")||"—")}</div>
          <div class="small text-secondary"><strong>Health Proxy:</strong> ${escapeHtml(getDeep(s,"family.healthProxy")||"—")}</div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="mini-card">
          <div class="fw-semibold mb-1">Traditional assets</div>
          <div class="small text-secondary"><strong>Real estate:</strong><br>${nl(escapeHtml(getDeep(s,"assets.realEstate")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>Bank:</strong><br>${nl(escapeHtml(getDeep(s,"assets.bank")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>Brokerage:</strong><br>${nl(escapeHtml(getDeep(s,"assets.brokerage")||"—"))}</div>
        </div>
      </div>
      <div class="col-12">
        <div class="mini-card">
          <div class="fw-semibold mb-1">Digital assets</div>
          <div class="small text-secondary"><strong>Social:</strong><br>${nl(escapeHtml(getDeep(s,"digital.social")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>Exchanges:</strong><br>${nl(escapeHtml(getDeep(s,"digital.exchanges")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>Wallets:</strong><br>${nl(escapeHtml(getDeep(s,"digital.wallets")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>NFTs:</strong><br>${nl(escapeHtml(getDeep(s,"digital.nfts")||"—"))}</div>
          <div class="small text-secondary mt-2"><strong>Instructions:</strong><br>${nl(escapeHtml(getDeep(s,"digital.instructions")||"—"))}</div>
        </div>
      </div>
      <div class="col-12">
        <div class="mini-card">
          <div class="fw-semibold mb-2">Uploads (metadata)</div>
          ${uploads.length ? `
            <ul class="small text-secondary mb-0">
              ${uploads.map(f=>`<li>${escapeHtml(f.name)} <span class="text-muted">(${formatBytes(f.size)})</span></li>`).join("")}
            </ul>
          ` : `<div class="small text-muted">—</div>`}
        </div>
      </div>
    </div>
  `;
}

// Admin
async function renderAdmin(){
  mountTemplate("tpl-admin");
  const tbody=$("#adminTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Loading…</td></tr>`;
  try{
    const res = await fetch("/api/intake/list");
    const j = await res.json();
    if(!res.ok){ tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Server not running.</td></tr>`; return; }
    const items = j.items || [];
    if(!items.length){ tbody.innerHTML = `<tr><td colspan="6" class="text-muted">No submissions yet. Click “New Intake”.</td></tr>`; return; }
    tbody.innerHTML = "";
    for(const it of items){
      const s = it.summary || {};
      const svc = (s.services||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("") || "—";
      const dig = (s.digital||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("") || "—";
      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td><div class="fw-semibold">${escapeHtml(s.client||"—")}</div><div class="small text-muted">${escapeHtml(s.email||"")}</div></td>
        <td>${escapeHtml(s.state||"—")}</td>
        <td>${svc}</td>
        <td>${dig}</td>
        <td>${escapeHtml(it.submittedAt||"")}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-id="${it.id}"><i class="bi bi-eye"></i> View</button></td>
      `;
      $("button", tr).onclick = async () => {
        const r = await fetch(`/api/intake/get/${encodeURIComponent(it.id)}`);
        const jj = await r.json();
        if(!r.ok){ toast("Could not load submission."); return; }
        saveState(jj.intake || {});
        window.location.hash = "#/summary";
      };
      tbody.appendChild(tr);
    }
  } catch {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Server not running.</td></tr>`;
  }
}

// OCR (browser demo)
function wireOcrButtons(){
  const btn = $("#btnRunOcr");
  if(!btn) return;
  const status = $("#ocrStatus");
  const fileInput = $("#ocrFile");
  const targetSel = $("#ocrTarget");

  btn.onclick = async () => {
    const file = fileInput.files?.[0];
    if(!file){ toast("Please select an image for OCR."); return; }
    status.textContent = "Starting OCR…"; btn.disabled=true;
    try{
      const { data } = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if(m.status === "recognizing text" && typeof m.progress === "number"){
            status.textContent = `OCR… ${Math.round(m.progress*100)}%`;
          }
        }
      });
      const modal = new bootstrap.Modal(document.getElementById("ocrModal"));
      $("#ocrText").value = (data.text || "").trim();
      modal.show();
      $("#btnApplyOcr").onclick = () => {
        const state = loadState();
        const target = targetSel.value;
        const existing = String(getDeep(state, target) || "").trim();
        const incoming = String($("#ocrText").value || "").trim();
        setDeep(state, target, existing ? (existing + "\n\n" + incoming) : incoming);
        saveState(state);
        toast("OCR text applied.");
        modal.hide();
      };
      status.textContent = "Done.";
    } catch(e){
      console.error(e);
      status.textContent = "OCR failed.";
      toast("OCR failed. Try a clearer image.");
    } finally {
      btn.disabled=false;
      setTimeout(()=>status.textContent="", 2500);
    }
  };
}

// Step render helpers
function checkbox(key, label){
  const id = "cb_" + key.replace(/\./g,"_");
  return `
    <div class="col-12 col-md-6">
      <div class="form-check p-2 rounded-3 border bg-white">
        <input class="form-check-input" type="checkbox" id="${id}" data-key="${key}">
        <label class="form-check-label" for="${id}">${escapeHtml(label)}</label>
      </div>
    </div>`;
}

function stepClient(){
  return `
    <h2 class="h5 mb-3">1) Client Information</h2>
    <div class="row g-3">
      <div class="col-12 col-md-8">
        <label class="form-label">Full legal name <span class="text-danger">*</span></label>
        <input class="form-control" data-key="client.fullName" data-required="true" placeholder="e.g., Asha R. Singh" />
        <div class="invalid-feedback">Required.</div>
      </div>
      <div class="col-12 col-md-4">
        <label class="form-label">Date of birth</label>
        <input type="date" class="form-control" data-key="client.dob" />
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Email <span class="text-danger">*</span></label>
        <input type="email" class="form-control" data-key="client.email" data-required="true" placeholder="name@example.com" />
        <div class="invalid-feedback">Required.</div>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Phone</label>
        <input class="form-control" data-key="client.phone" placeholder="(###) ###-####" />
      </div>

      <div class="col-12">
        <label class="form-label">Address</label>
        <input class="form-control" data-key="client.address1" placeholder="Street address" />
      </div>
      <div class="col-12 col-md-5">
        <label class="form-label">City</label>
        <input class="form-control" data-key="client.city" />
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label">State <span class="text-danger">*</span></label>
        <select class="form-select" data-key="client.state" data-required="true">
          <option value="">Select</option>
          <option value="NY">NY</option>
          <option value="NJ">NJ</option>
          <option value="PA">PA</option>
        </select>
        <div class="invalid-feedback">Required.</div>
      </div>
      <div class="col-6 col-md-4">
        <label class="form-label">ZIP</label>
        <input class="form-control" data-key="client.zip" />
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Marital status</label>
        <select class="form-select" data-key="client.maritalStatus">
          <option value="">Select</option>
          <option>Single</option>
          <option>Married</option>
          <option>Domestic partnership</option>
          <option>Divorced</option>
          <option>Widowed</option>
          <option>Separated</option>
        </select>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Preferred language (optional)</label>
        <input class="form-control" data-key="client.language" placeholder="e.g., English, Haitian Creole, Patois, etc." />
      </div>

      <div class="col-12">
        <label class="form-label">Notes / concerns (optional)</label>
        <textarea class="form-control" rows="3" data-key="client.notes" placeholder="Anything you want us to know up front."></textarea>
      </div>
    </div>`;
}
function stepFamily(){
  return `
    <h2 class="h5 mb-3">2) Family + Fiduciaries</h2>
    <div class="row g-3">
      <div class="col-12">
        <div class="p-3 rounded-3 bg-soft small text-secondary">
          Add the key people in your plan: beneficiaries, guardian (if minor children), executor (will), and agents (POA/health).
          We can refine this during your consult.
        </div>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Primary beneficiary(ies)</label>
        <textarea class="form-control" rows="3" data-key="family.beneficiaries" placeholder="Names + relationship + approximate shares"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Minor children / guardianship needs</label>
        <textarea class="form-control" rows="3" data-key="family.guardianship" placeholder="Children names + preferred guardian (if applicable)"></textarea>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Executor (will)</label>
        <input class="form-control" data-key="family.executor" placeholder="Full name + relationship + contact" />
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Backup executor</label>
        <input class="form-control" data-key="family.executorBackup" placeholder="Full name + relationship + contact" />
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Agent (Power of Attorney)</label>
        <input class="form-control" data-key="family.poaAgent" placeholder="Full name + relationship + contact" />
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Health care proxy</label>
        <input class="form-control" data-key="family.healthProxy" placeholder="Full name + relationship + contact" />
      </div>

      <div class="col-12">
        <label class="form-label">Special considerations</label>
        <textarea class="form-control" rows="3" data-key="family.special" placeholder="Blended families, dependents with special needs, relatives abroad, property abroad, etc."></textarea>
      </div>
    </div>`;
}
function stepServices(){
  return `
    <h2 class="h5 mb-3">3) Services Requested</h2>
    <div class="row g-3">
      <div class="col-12">
        <label class="form-label">Select what you want to create/update</label>
        <div class="row g-2">
          ${checkbox("services.will","Last Will and Testament")}
          ${checkbox("services.trust","Revocable Living Trust")}
          ${checkbox("services.poa","Durable Power of Attorney")}
          ${checkbox("services.health","Health Care Proxy / Advance Directive")}
          ${checkbox("services.digital","Digital Asset Plan (crypto, NFTs, social, access letters)")}
        </div>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Flat-fee preference (optional)</label>
        <select class="form-select" data-key="services.feePreference">
          <option value="">Select</option>
          <option>Essentials</option>
          <option>Family+</option>
          <option>Digital Vault Add-on</option>
          <option>Not sure yet</option>
        </select>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Timing</label>
        <select class="form-select" data-key="services.timing">
          <option value="">Select</option>
          <option>Urgent (within 2 weeks)</option>
          <option>Normal (2–6 weeks)</option>
          <option>Flexible</option>
        </select>
      </div>

      <div class="col-12">
        <label class="form-label">Goals (optional)</label>
        <textarea class="form-control" rows="3" data-key="services.goals" placeholder="What matters most? Avoid probate, protect kids, simplify, minimize family conflict, etc."></textarea>
      </div>
    </div>`;
}
function stepAssets(){
  return `
    <h2 class="h5 mb-3">4) Traditional Assets</h2>
    <div class="row g-3">
      <div class="col-12 col-md-6">
        <label class="form-label">Real estate</label>
        <textarea class="form-control" rows="3" data-key="assets.realEstate" placeholder="Address, type (home/rental), approx value, mortgage info"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Bank accounts</label>
        <textarea class="form-control" rows="3" data-key="assets.bank" placeholder="Institution(s), type (checking/savings), approx totals"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Retirement accounts</label>
        <textarea class="form-control" rows="3" data-key="assets.retirement" placeholder="401(k), IRA, pension; approx totals; beneficiary designations?"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Life insurance</label>
        <textarea class="form-control" rows="3" data-key="assets.insurance" placeholder="Carrier, policy type, beneficiary, approx benefit"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Brokerage / equity accounts</label>
        <textarea class="form-control" rows="3" data-key="assets.brokerage" placeholder="Broker(s), account types, approx totals"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Business interests</label>
        <textarea class="form-control" rows="3" data-key="assets.business" placeholder="LLC/corp interests, partners, buy-sell, etc."></textarea>
      </div>
      <div class="col-12">
        <label class="form-label">Debts / obligations (optional)</label>
        <textarea class="form-control" rows="3" data-key="assets.debts" placeholder="Mortgage, car loan, credit cards, personal loans, etc."></textarea>
      </div>
    </div>`;
}
function stepDigital(){
  return `
    <h2 class="h5 mb-3">5) Digital Asset Inventory</h2>
    <div class="p-3 rounded-3 bg-soft small text-secondary mb-3">
      Do not enter private keys, seed phrases, or passwords. In production, use a secure “digital vault” workflow.
    </div>

    <div class="row g-3">
      <div class="col-12 col-md-6">
        <label class="form-label">Social media + content</label>
        <textarea class="form-control" rows="3" data-key="digital.social" placeholder="Instagram, Facebook, TikTok, YouTube; handles; monetization"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Email + cloud storage</label>
        <textarea class="form-control" rows="3" data-key="digital.emailCloud" placeholder="Gmail, iCloud, Google Drive, Dropbox, etc."></textarea>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Crypto exchanges (e.g., Coinbase)</label>
        <textarea class="form-control" rows="3" data-key="digital.exchanges" placeholder="Exchange name(s), account email, approx holdings"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Crypto wallets (hot/cold)</label>
        <textarea class="form-control" rows="3" data-key="digital.wallets" placeholder="Wallet types, device location, storage approach (do not include seed phrase)"></textarea>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">NFTs / collectibles</label>
        <textarea class="form-control" rows="3" data-key="digital.nfts" placeholder="Marketplace(s), wallet addresses, collection names"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Domains / websites / online businesses</label>
        <textarea class="form-control" rows="3" data-key="digital.domains" placeholder="Domain registrar, website(s), revenue streams"></textarea>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label">Devices (access)</label>
        <textarea class="form-control" rows="3" data-key="digital.devices" placeholder="Primary phone/laptop, where stored, who can access"></textarea>
      </div>
      <div class="col-12 col-md-6">
        <label class="form-label">Password manager / 2FA recovery</label>
        <textarea class="form-control" rows="3" data-key="digital.security" placeholder="Password manager used; where recovery codes are stored; trusted contact"></textarea>
      </div>

      <div class="col-12">
        <label class="form-label">Digital asset instructions (draft)</label>
        <textarea class="form-control" rows="3" data-key="digital.instructions" placeholder="Who should manage what, and priorities (preserve accounts, liquidate crypto, etc.)."></textarea>
      </div>
    </div>`;
}
function stepUploads(){
  return `
    <h2 class="h5 mb-3">6) Upload Documents + OCR (Demo)</h2>
    <div class="row g-3">
      <div class="col-12">
        <label class="form-label">Upload documents (metadata only in this front-end)</label>
        <input type="file" class="form-control" data-key="uploads.files" multiple />
        <div class="form-text">This prototype stores file metadata only in the browser. Add server-side uploads next.</div>
      </div>

      <div class="col-12">
        <div class="p-3 rounded-3 bg-soft">
          <div class="d-flex align-items-start gap-3">
            <div class="mini-ico mini-ico-soft"><i class="bi bi-magic"></i></div>
            <div class="w-100">
              <div class="fw-semibold">OCR a photo/scan (images only)</div>
              <div class="small text-secondary mb-2">
                Upload an image (JPG/PNG) and we’ll extract text in the browser. Then you can apply it to a field.
              </div>

              <div class="row g-2 align-items-end">
                <div class="col-12 col-md-7">
                  <label class="form-label">Choose image for OCR</label>
                  <input type="file" class="form-control" id="ocrFile" accept="image/*" />
                </div>
                <div class="col-12 col-md-5">
                  <label class="form-label">Apply OCR result to</label>
                  <select class="form-select" id="ocrTarget">
                    <option value="assets.realEstate">Assets → Real estate</option>
                    <option value="assets.bank">Assets → Bank accounts</option>
                    <option value="assets.brokerage">Assets → Brokerage</option>
                    <option value="digital.exchanges">Digital → Crypto exchanges</option>
                    <option value="digital.wallets">Digital → Crypto wallets</option>
                    <option value="digital.social">Digital → Social media</option>
                  </select>
                </div>
                <div class="col-12">
                  <button type="button" class="btn btn-brand" id="btnRunOcr">
                    <i class="bi bi-search"></i> Run OCR
                  </button>
                  <span class="small text-muted ms-2" id="ocrStatus"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12">
        <label class="form-label">Anything else to upload / share?</label>
        <textarea class="form-control" rows="3" data-key="uploads.notes" placeholder="List any documents you plan to provide later."></textarea>
      </div>

      <div class="col-12">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="consent" data-key="uploads.consent" data-required="true">
          <label class="form-check-label" for="consent">
            I confirm the information provided is accurate to the best of my knowledge. <span class="text-danger">*</span>
          </label>
          <div class="invalid-feedback">Required.</div>
        </div>
      </div>
    </div>`;
}
