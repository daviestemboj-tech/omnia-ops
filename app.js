if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Registration can fail silently in the static shell.
    });
  });
}

const newJobButton = document.querySelector("#new-job-button");
const jobFormPanel = document.querySelector("#job-form-panel");
const jobForm = document.querySelector("#job-form");
const jobFormHeading = jobFormPanel.querySelector(".section-heading h2");
const jobFormDescription = jobFormPanel.querySelector(".section-heading p");
const jobSubmitButton = jobForm.querySelector('button[type="submit"]');
const jobList = document.querySelector("#job-list");
const jobCount = document.querySelector("#job-count");
const emptyStateMessage = document.querySelector("#empty-state-message");
const statusFilter = document.querySelector("#status-filter");
const staffFilter = document.querySelector("#staff-filter");
const STORAGE_KEY = "omnia-ops-jobs";
const STATUS_OVERRIDES_KEY = "omnia-ops-status-overrides";
const STATUS_OPTIONS = ["Pending", "In Progress", "Done"];
let editingJobKey = null;

function getStatusClass(status) {
  if (status === "In Progress") {
    return "status-progress";
  }

  if (status === "Done") {
    return "status-done";
  }

  return "status-pending";
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function updateJobCount() {
  const total = jobList.querySelectorAll(".job-card:not([hidden])").length;
  const label = total === 1 ? "active item" : "active items";
  jobCount.textContent = `${total} ${label}`;
}

function updateEmptyState() {
  const totalJobs = jobList.querySelectorAll(".job-card").length;
  const visibleJobs = jobList.querySelectorAll(".job-card:not([hidden])").length;

  if (totalJobs === 0) {
    emptyStateMessage.textContent = "No jobs yet. Add a new job to get started.";
    emptyStateMessage.hidden = false;
    return;
  }

  if (visibleJobs === 0) {
    emptyStateMessage.textContent = "No jobs match the current filters.";
    emptyStateMessage.hidden = false;
    return;
  }

  emptyStateMessage.hidden = true;
}

function loadSavedJobs() {
  try {
    const savedJobs = localStorage.getItem(STORAGE_KEY);

    if (!savedJobs) {
      return [];
    }

    const jobs = JSON.parse(savedJobs);
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function hasSavedJobs() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

function getTodayValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function loadStatusOverrides() {
  try {
    const savedOverrides = localStorage.getItem(STATUS_OVERRIDES_KEY);

    if (!savedOverrides) {
      return {};
    }

    const overrides = JSON.parse(savedOverrides);
    return overrides && typeof overrides === "object" ? overrides : {};
  } catch {
    return {};
  }
}

function saveStatusOverrides(overrides) {
  localStorage.setItem(STATUS_OVERRIDES_KEY, JSON.stringify(overrides));
}

function removeStatusOverride(jobKey) {
  const overrides = loadStatusOverrides();
  delete overrides[jobKey];
  saveStatusOverrides(overrides);
}

function getJobKey(job) {
  return [
    job.title.trim(),
    job.staff.trim(),
    formatDate(job.date),
    job.note.trim()
  ].join("||");
}

function getCardData(card) {
  const title = card.querySelector("h3")?.textContent?.trim() || "";
  const detailValues = card.querySelectorAll(".job-details dd");
  const staff = detailValues[0]?.textContent?.trim() || "";
  const date = detailValues[1]?.textContent?.trim() || "";
  const note = card.querySelector(".job-note")?.textContent?.trim() || "";

  return { title, staff, date, note };
}

function ensureCardKey(card) {
  if (!card.dataset.jobKey) {
    const job = getCardData(card);
    card.dataset.jobKey = [job.title, job.staff, job.date, job.note].join("||");
  }

  return card.dataset.jobKey;
}

function setCardStatus(card, status) {
  const badge = card.querySelector(".status-badge");

  card.dataset.status = status;
  badge.className = `status-badge ${getStatusClass(status)}`;
  badge.textContent = status;
}

function syncSavedJobStatus(jobKey, status) {
  const savedJobs = loadSavedJobs();
  const nextJobs = savedJobs.map((job) =>
    getJobKey(job) === jobKey ? { ...job, status } : job
  );

  saveJobs(nextJobs);
}

function addDeleteButton(card) {
  if (card.querySelector('[data-action="delete-job"]')) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Delete";
  button.dataset.action = "delete-job";
  button.setAttribute("aria-label", "Delete job");
  button.style.marginTop = "0.75rem";
  button.style.padding = "0.45rem 0.7rem";
  button.style.fontSize = "0.9rem";
  button.style.cursor = "pointer";

  card.append(button);
}

function addEditButton(card) {
  if (card.querySelector('[data-action="edit-job"]')) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Edit";
  button.dataset.action = "edit-job";
  button.setAttribute("aria-label", "Edit job");
  button.style.marginTop = "0.75rem";
  button.style.marginRight = "0.5rem";
  button.style.padding = "0.45rem 0.7rem";
  button.style.fontSize = "0.9rem";
  button.style.cursor = "pointer";

  card.append(button);
}

function removeSavedJob(jobKey) {
  const savedJobs = loadSavedJobs();
  const nextJobs = savedJobs.filter((job) => getJobKey(job) !== jobKey);
  saveJobs(nextJobs);

  const overrides = loadStatusOverrides();
  delete overrides[jobKey];
  saveStatusOverrides(overrides);
}

function createJobCard(job) {
  const card = document.createElement("article");
  card.className = "job-card";
  card.dataset.status = job.status;
  card.dataset.staff = job.staff;
  card.dataset.date = job.date;
  card.dataset.jobKey = getJobKey(job);

  card.innerHTML = `
    <div class="job-card-top">
      <div>
        <h3>${job.title}</h3>
      </div>
      <span class="status-badge ${getStatusClass(job.status)}">${job.status}</span>
    </div>
    <dl class="job-details">
      <div>
        <dt>Assigned</dt>
        <dd>${job.staff}</dd>
      </div>
      <div>
        <dt>Date</dt>
        <dd>${formatDate(job.date)}</dd>
      </div>
    </dl>
    <p class="job-note">${job.note}</p>
  `;

  addEditButton(card);
  addDeleteButton(card);
  return card;
}

function getStarterJobs() {
  return [...jobList.querySelectorAll(".job-card")].map((card) => {
    const job = getCardData(card);

    return {
      title: job.title,
      staff: job.staff,
      status: card.dataset.status || "Pending",
      date: job.date,
      note: job.note
    };
  });
}

function renderJobs(jobs) {
  jobList.innerHTML = "";

  jobs
    .slice()
    .reverse()
    .forEach((job) => {
      jobList.prepend(createJobCard(job));
    });
}

function setFormMode(jobKey = null) {
  editingJobKey = jobKey;
  jobFormHeading.textContent = jobKey ? "Edit Job" : "New Job";
  jobFormDescription.textContent = jobKey
    ? "Update one job at a time"
    : "Add one job at a time";
  jobSubmitButton.textContent = jobKey ? "Update Job" : "Save Job";
}

function getFormDateValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (typeof value === "string" && value.toLowerCase().startsWith("today")) {
    return getTodayValue();
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return getTodayValue();
  }

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function loadJobIntoForm(job, jobKey) {
  jobForm.elements.title.value = job.title;
  jobForm.elements.staff.value = job.staff;
  jobForm.elements.status.value = STATUS_OPTIONS.includes(job.status)
    ? job.status
    : "Pending";
  jobForm.elements.date.value = getFormDateValue(job.date);
  jobForm.elements.notes.value = job.note;
  setFormMode(jobKey);
  jobFormPanel.removeAttribute("hidden");
  newJobButton.setAttribute("aria-expanded", "true");
  jobFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  jobForm.elements.title.focus();
}

function applyStoredStatuses() {
  const overrides = loadStatusOverrides();
  const jobCards = jobList.querySelectorAll(".job-card");

  jobCards.forEach((card) => {
    const jobKey = ensureCardKey(card);
    const savedStatus = overrides[jobKey];

    if (STATUS_OPTIONS.includes(savedStatus)) {
      setCardStatus(card, savedStatus);
    }
  });
}

function populateFilterOptions() {
  const jobCards = jobList.querySelectorAll(".job-card");
  const statuses = new Set();
  const staffNames = new Set();

  jobCards.forEach((card) => {
    statuses.add(card.dataset.status);
    staffNames.add(card.dataset.staff);
  });

  const selectedStatus = statusFilter.value;
  const selectedStaff = staffFilter.value;

  statusFilter.innerHTML = '<option value="all">All statuses</option>';
  [...statuses].sort().forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    statusFilter.append(option);
  });

  staffFilter.innerHTML = '<option value="all">All staff</option>';
  [...staffNames].sort().forEach((staff) => {
    const option = document.createElement("option");
    option.value = staff;
    option.textContent = staff;
    staffFilter.append(option);
  });

  statusFilter.value = [...statusFilter.options].some(
    (option) => option.value === selectedStatus
  )
    ? selectedStatus
    : "all";

  staffFilter.value = [...staffFilter.options].some(
    (option) => option.value === selectedStaff
  )
    ? selectedStaff
    : "all";
}

function applyFilters() {
  const selectedStatus = statusFilter.value;
  const selectedStaff = staffFilter.value;
  const jobCards = jobList.querySelectorAll(".job-card");

  jobCards.forEach((card) => {
    const matchesStatus =
      selectedStatus === "all" || card.dataset.status === selectedStatus;
    const matchesStaff =
      selectedStaff === "all" || card.dataset.staff === selectedStaff;

    card.hidden = !matchesStatus || !matchesStaff;
  });

  updateJobCount();
  updateEmptyState();
}

let savedJobs = loadSavedJobs();

if (!hasSavedJobs()) {
  savedJobs = getStarterJobs();
  saveJobs(savedJobs);
}

renderJobs(savedJobs);
setFormMode();

populateFilterOptions();
applyFilters();

newJobButton.addEventListener("click", () => {
  const isHidden = jobFormPanel.hasAttribute("hidden");

  if (isHidden) {
    jobForm.reset();
    setFormMode();
    jobFormPanel.removeAttribute("hidden");
    newJobButton.setAttribute("aria-expanded", "true");
    jobFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    jobForm.elements.title.focus();
    return;
  }

  jobForm.reset();
  setFormMode();
  jobFormPanel.setAttribute("hidden", "");
  newJobButton.setAttribute("aria-expanded", "false");
});

jobList.addEventListener("click", (event) => {
  const card = event.target.closest(".job-card");

  if (!card) {
    return;
  }

  const editButton = event.target.closest('[data-action="edit-job"]');
  const deleteButton = event.target.closest('[data-action="delete-job"]');

  if (editButton) {
    const jobKey = ensureCardKey(card);
    const job = loadSavedJobs().find((savedJob) => getJobKey(savedJob) === jobKey);

    if (!job) {
      return;
    }

    loadJobIntoForm(job, jobKey);
    return;
  }

  if (deleteButton) {
    const title = card.querySelector("h3")?.textContent?.trim() || "this job";
    const shouldDelete = window.confirm(`Delete "${title}"?`);

    if (!shouldDelete) {
      return;
    }

    const jobKey = ensureCardKey(card);
    removeSavedJob(jobKey);
    card.remove();
    if (editingJobKey === jobKey) {
      jobForm.reset();
      setFormMode();
      jobFormPanel.setAttribute("hidden", "");
      newJobButton.setAttribute("aria-expanded", "false");
    }
    populateFilterOptions();
    applyFilters();
    return;
  }

  const currentStatus = card.dataset.status;
  const nextStatus = window.prompt(
    "Change status: Pending, In Progress, or Done",
    currentStatus
  );

  if (!nextStatus) {
    return;
  }

  const selectedStatus = STATUS_OPTIONS.find(
    (status) => status.toLowerCase() === nextStatus.trim().toLowerCase()
  );

  if (!selectedStatus || selectedStatus === currentStatus) {
    return;
  }

  setCardStatus(card, selectedStatus);

  const jobKey = ensureCardKey(card);
  const overrides = loadStatusOverrides();
  overrides[jobKey] = selectedStatus;
  saveStatusOverrides(overrides);
  syncSavedJobStatus(jobKey, selectedStatus);
  populateFilterOptions();
  applyFilters();
});

jobForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(jobForm);
  const job = {
    title: formData.get("title").toString().trim(),
    staff: formData.get("staff").toString().trim(),
    status: formData.get("status").toString(),
    date: formData.get("date").toString().trim(),
    note: formData.get("notes").toString().trim()
  };

  if (!job.title || !job.staff || !job.date || !job.note) {
    return;
  }

  const savedJobs = loadSavedJobs();

  if (editingJobKey) {
    const nextJobs = savedJobs.map((savedJob) =>
      getJobKey(savedJob) === editingJobKey ? job : savedJob
    );

    saveJobs(nextJobs);
    removeStatusOverride(editingJobKey);
    renderJobs(nextJobs);
  } else {
    savedJobs.unshift(job);
    saveJobs(savedJobs);
    jobList.prepend(createJobCard(job));
  }

  populateFilterOptions();
  applyFilters();
  jobForm.reset();
  setFormMode();
  jobFormPanel.setAttribute("hidden", "");
  newJobButton.setAttribute("aria-expanded", "false");
});

statusFilter.addEventListener("change", applyFilters);
staffFilter.addEventListener("change", applyFilters);
