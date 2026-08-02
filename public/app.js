const chatFeed = document.getElementById("chat-feed");
const emptyState = document.getElementById("empty-state");
const appsList = document.getElementById("apps-list");
const composer = document.getElementById("composer");
const composerInput = document.getElementById("composer-input");
const composerSend = document.getElementById("composer-send");

let mode = "improve"; // "improve" | "build"
const trialCards = new Map(); // trial id -> DOM element
let thinkingEl = null;
let thinkingDotsAnim = null;

const MODE_PLACEHOLDERS = {
    improve: "Describe how you want the agent's own code/UI to change...",
    build: "Describe the app you want, e.g. 'a simple todo list'..."
};

// ---------- Mode switch ----------

for (const btn of document.querySelectorAll(".mode-btn")) {
    btn.addEventListener("click", () => {
        mode = btn.dataset.mode;
        for (const b of document.querySelectorAll(".mode-btn")) {
            b.classList.toggle("active", b === btn);
            b.setAttribute("aria-selected", String(b === btn));
        }
        composerInput.placeholder = MODE_PLACEHOLDERS[mode];
        anime({
            targets: btn,
            scale: [0.94, 1],
            duration: 260,
            easing: "easeOutBack"
        });
    });
}

// ---------- Feed rendering ----------

function scrollFeedToBottom() {
    chatFeed.scrollTop = chatFeed.scrollHeight;
}

function animateIn(el, extra = {}) {
    anime({
        targets: el,
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 420,
        easing: "easeOutCubic",
        ...extra
    });
}

function hideEmptyState() {
    if (!emptyState.parentNode) return;
    anime({
        targets: emptyState,
        opacity: [1, 0],
        scale: [1, 0.98],
        duration: 250,
        easing: "easeInQuad",
        complete: () => emptyState.remove()
    });
}

function appendMessage(text, { role, kind } = {}) {
    hideEmptyState();
    const div = document.createElement("div");
    div.className = role === "user" ? "msg msg-user" : "msg msg-agent";
    if (kind) div.dataset.kind = kind;

    const body = document.createElement("span");
    body.textContent = text;
    div.appendChild(body);

    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = new Date().toLocaleTimeString();
    div.appendChild(time);

    chatFeed.insertBefore(div, thinkingEl);
    animateIn(div);
    scrollFeedToBottom();
    return div;
}

const USER_PREFIXES = ["Self-improve: ", "Building app: "];

function renderActivityEntry(entry) {
    let text = entry.text;
    const userPrefix = USER_PREFIXES.find(p => text.startsWith(p));
    if (userPrefix) {
        appendMessage(text.slice(userPrefix.length), { role: "user" });
    } else {
        appendMessage(text, { role: "agent", kind: entry.kind });
    }
}

async function loadActivityHistory() {
    const res = await fetch("/api/activity");
    const entries = await res.json();
    for (const entry of entries) renderActivityEntry(entry);
}

function connectActivityStream() {
    const source = new EventSource("/api/activity/stream");
    source.onmessage = event => {
        renderActivityEntry(JSON.parse(event.data));
    };
}

// ---------- Thinking indicator ----------

function showThinking() {
    if (thinkingEl) return;
    hideEmptyState();
    thinkingEl = document.createElement("div");
    thinkingEl.className = "thinking";
    thinkingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    chatFeed.appendChild(thinkingEl);
    animateIn(thinkingEl);
    thinkingDotsAnim = anime({
        targets: thinkingEl.querySelectorAll(".dot"),
        translateY: [0, -5],
        opacity: [0.35, 1],
        duration: 480,
        easing: "easeInOutSine",
        direction: "alternate",
        loop: true,
        delay: anime.stagger(120)
    });
    scrollFeedToBottom();
}

function hideThinking() {
    if (!thinkingEl) return;
    if (thinkingDotsAnim) thinkingDotsAnim.pause();
    const el = thinkingEl;
    thinkingEl = null;
    anime({
        targets: el,
        opacity: [1, 0],
        duration: 180,
        easing: "easeInQuad",
        complete: () => el.remove()
    });
}

// ---------- Hosted apps ----------

async function loadApps() {
    const res = await fetch("/api/apps");
    const apps = await res.json();
    appsList.innerHTML = "";
    if (!apps.length) {
        appsList.innerHTML = '<li class="empty">No apps yet</li>';
        return;
    }
    for (const app of apps) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = `/apps/${app.id}/`;
        link.textContent = `${app.name} [${app.status}]`;
        link.target = "_blank";
        li.appendChild(link);
        appsList.appendChild(li);
    }
    anime({
        targets: "#apps-list li",
        opacity: [0, 1],
        translateX: [-8, 0],
        duration: 320,
        delay: anime.stagger(40),
        easing: "easeOutCubic"
    });
}

// ---------- Pending trial cards ----------

function renderTrialCard(outcome) {
    const trial = outcome.trial;
    if (trialCards.has(trial.id)) return;
    hideEmptyState();

    const card = document.createElement("div");
    card.className = "trial-card";

    const summary = document.createElement("p");
    summary.textContent = trial.summary || "(no summary)";
    card.appendChild(summary);

    const diff = document.createElement("pre");
    diff.textContent = trial.diff || "(no diff)";
    card.appendChild(diff);

    const actions = document.createElement("div");
    actions.className = "trial-actions";

    const approveBtn = document.createElement("button");
    approveBtn.className = "btn-approve";
    approveBtn.textContent = "Approve";
    approveBtn.onclick = () => respondToTrial(trial.id, "approve");
    actions.appendChild(approveBtn);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "btn-reject";
    rejectBtn.textContent = "Reject";
    rejectBtn.onclick = () => respondToTrial(trial.id, "reject");
    actions.appendChild(rejectBtn);

    card.appendChild(actions);
    chatFeed.insertBefore(card, thinkingEl);
    animateIn(card, { scale: [0.97, 1] });
    trialCards.set(trial.id, card);
    scrollFeedToBottom();
}

function removeTrialCard(id) {
    const card = trialCards.get(id);
    if (!card) return;
    trialCards.delete(id);
    anime({
        targets: card,
        opacity: [1, 0],
        scale: [1, 0.96],
        duration: 200,
        easing: "easeInQuad",
        complete: () => card.remove()
    });
}

async function refreshPending() {
    const res = await fetch("/api/self-improve/pending");
    const outcomes = await res.json();
    const seen = new Set(outcomes.map(o => o.trial.id));
    for (const id of [...trialCards.keys()]) {
        if (!seen.has(id)) removeTrialCard(id);
    }
    for (const outcome of outcomes) renderTrialCard(outcome);
    return outcomes.length;
}

/** Approving a step can trigger the next step generating in the background (no request is awaiting
 *  it), so poll briefly for its pending trial to appear rather than leaving no feedback at all. */
async function pollForContinuation() {
    showThinking();
    const deadline = Date.now() + 6 * 60 * 1000;
    const before = new Set(trialCards.keys());
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        const count = await refreshPending();
        const grew = [...trialCards.keys()].some(id => !before.has(id));
        if (grew || count === 0) break;
    }
    hideThinking();
}

async function respondToTrial(id, action) {
    removeTrialCard(id);
    await fetch(`/api/self-improve/${id}/${action}`, { method: "POST" });
    if (action === "approve") {
        pollForContinuation();
    }
}

// ---------- Composer ----------

composerInput.addEventListener("input", () => {
    composerInput.style.height = "auto";
    composerInput.style.height = `${Math.min(composerInput.scrollHeight, 200)}px`;
    composerSend.classList.toggle("ready", composerInput.value.trim().length > 0);
});

composerInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        composer.requestSubmit();
    }
});

composer.addEventListener("submit", async event => {
    event.preventDefault();
    const instruction = composerInput.value.trim();
    if (!instruction) return;
    composerInput.value = "";
    composerInput.style.height = "auto";
    composerSend.classList.remove("ready");
    composerSend.disabled = true;
    anime({
        targets: composerSend,
        scale: [1, 0.85, 1],
        duration: 260,
        easing: "easeOutBack"
    });
    showThinking();

    try {
        if (mode === "build") {
            const res = await fetch("/api/apps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instruction })
            });
            if (res.ok) loadApps();
        } else {
            const res = await fetch("/api/self-improve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instruction })
            });
            const outcome = await res.json();
            if (outcome.status === "pending-approval" && outcome.trial) {
                renderTrialCard(outcome);
            }
        }
    } finally {
        hideThinking();
        composerSend.disabled = false;
    }
});

loadActivityHistory();
connectActivityStream();
loadApps();
refreshPending();
