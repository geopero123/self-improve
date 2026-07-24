const activityLog = document.getElementById("activity-log");
const appsList = document.getElementById("apps-list");
const pendingList = document.getElementById("pending-list");

const pendingTrials = new Map();

function renderActivityEntry(entry) {
    const div = document.createElement("div");
    div.dataset.kind = entry.kind;
    const time = new Date(entry.ts).toLocaleTimeString();
    div.textContent = `[${time}] [${entry.kind}] ${entry.text}`;
    activityLog.appendChild(div);
    activityLog.scrollTop = activityLog.scrollHeight;
}

async function loadActivityHistory() {
    const res = await fetch("/api/activity");
    const entries = await res.json();
    activityLog.innerHTML = "";
    for (const entry of entries) renderActivityEntry(entry);
}

function connectActivityStream() {
    const source = new EventSource("/api/activity/stream");
    source.onmessage = event => {
        const entry = JSON.parse(event.data);
        renderActivityEntry(entry);
    };
}

async function loadApps() {
    const res = await fetch("/api/apps");
    const apps = await res.json();
    appsList.innerHTML = "";
    if (!apps.length) {
        appsList.innerHTML = "<li>(none yet)</li>";
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
}

function renderPending() {
    if (pendingTrials.size === 0) {
        pendingList.textContent = "(none)";
        return;
    }
    pendingList.innerHTML = "";
    for (const outcome of pendingTrials.values()) {
        const trial = outcome.trial;
        const box = document.createElement("div");

        const summary = document.createElement("p");
        summary.textContent = trial.summary || "(no summary)";
        box.appendChild(summary);

        const diff = document.createElement("pre");
        diff.textContent = trial.diff || "(no diff)";
        box.appendChild(diff);

        const approveBtn = document.createElement("button");
        approveBtn.textContent = "Approve";
        approveBtn.onclick = () => respondToTrial(trial.id, "approve");
        box.appendChild(approveBtn);

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "Reject";
        rejectBtn.onclick = () => respondToTrial(trial.id, "reject");
        box.appendChild(rejectBtn);

        pendingList.appendChild(box);
        pendingList.appendChild(document.createElement("hr"));
    }
}

async function respondToTrial(id, action) {
    await fetch(`/api/self-improve/${id}/${action}`, { method: "POST" });
    pendingTrials.delete(id);
    renderPending();
}

document.getElementById("build-form").addEventListener("submit", async event => {
    event.preventDefault();
    const textarea = document.getElementById("build-instruction");
    const instruction = textarea.value.trim();
    if (!instruction) return;
    textarea.value = "";
    const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction })
    });
    if (res.ok) loadApps();
});

document.getElementById("improve-form").addEventListener("submit", async event => {
    event.preventDefault();
    const textarea = document.getElementById("improve-instruction");
    const instruction = textarea.value.trim();
    if (!instruction) return;
    textarea.value = "";
    const res = await fetch("/api/self-improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction })
    });
    const outcome = await res.json();
    if (outcome.status === "pending-approval" && outcome.trial) {
        pendingTrials.set(outcome.trial.id, outcome);
        renderPending();
    }
});

loadActivityHistory();
connectActivityStream();
loadApps();
