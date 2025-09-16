/* =========================
   Local "DB" (localStorage)
   ========================= */
const STORAGE_KEY = "teamPlannerData_v1";
const SESSION_KEY = "teamPlannerCurrentUser";

/**
 * Shape:
 * {
 *   users: {
 *     [username]: {
 *       entries: {
 *         "YYYY-MM-DD": {
 *            "06:00": { place: "", remarks: "" },
 *            "07:00": { ... }
 *         }
 *       }
 *     }
 *   }
 * }
 */
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { users: {} };
  } catch {
    return { users: {} };
  }
}
function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}
function getCurrentUser() {
  return sessionStorage.getItem(SESSION_KEY) || null;
}
function setCurrentUser(username) {
  sessionStorage.setItem(SESSION_KEY, username);
}
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

/* =========================
   Elements
   ========================= */
const authView = document.getElementById("auth");
const appView = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const greetingEl = document.getElementById("greeting");
const logoutBtn = document.getElementById("logoutBtn");

const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");
const monthLabel = document.getElementById("monthLabel");
const todayBtn = document.getElementById("todayBtn");

const daysGrid = document.getElementById("daysGrid");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const timePickerWrap = document.getElementById("timePickerWrap");
const timePicker = document.getElementById("timePicker");
const entryForm = document.getElementById("entryForm");
const placeInput = document.getElementById("placeInput");
const remarksInput = document.getElementById("remarksInput");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const entriesList = document.getElementById("entriesList");

const pickFromDate = document.getElementById("pickFromDate");
const dropToDate = document.getElementById("dropToDate");

pickFromDate.addEventListener("change", () => {
  const fromDate = new Date(pickFromDate.value);
  if (isNaN(fromDate)) return;

  const dropDate = new Date(fromDate.getTime() + (24 + Math.floor(Math.random() * 13)) * 60 * 60 * 1000);
  const yyyy = dropDate.getFullYear();
  const mm = String(dropDate.getMonth() + 1).padStart(2, "0");
  const dd = String(dropDate.getDate()).padStart(2, "0");

  dropToDate.value = `${yyyy}-${mm}-${dd}`;
});


function showPopup(message, type = "info", duration = 3000) {
  const existing = document.querySelector(".popup");
  if (existing) existing.remove();

  const popup = document.createElement("div");
  popup.className = `popup show ${type}`;
  popup.textContent = message;
  document.body.appendChild(popup);

  setTimeout(() => {
    popup.classList.remove("show");
    setTimeout(() => popup.remove(), 300);
  }, duration);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const box = document.createElement("div");
    box.className = "confirm-box";
    box.innerHTML = `
      <p>${message}</p>
      <div class="confirm-actions">
        <button class="btn primary">Yes</button>
        <button class="btn ghost">No</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector(".btn.primary").addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });

    box.querySelector(".btn.ghost").addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
  });
}


/* =========================
   State
   ========================= */
let viewYear, viewMonth; // 0-based month
let selectedDateStr = ""; // YYYY-MM-DD
const TIME_SLOTS = Array.from({ length: (22 - 6) + 1 }, (_, i) => i + 6) // 6..22
  .map(h => String(h).padStart(2, "0") + ":00");

/* =========================
   Utilities
   ========================= */
function pad2(n) { return String(n).padStart(2, "0"); }

function fmtDateYMD(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function monthName(year, month0) {
  return new Date(year, month0, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function ensureUser(db, username) {
  if (!db.users[username]) db.users[username] = { entries: {} };
}

function getEntriesFor(db, username, ymd) {
  ensureUser(db, username);
  return db.users[username].entries[ymd] || {};
}

function setEntry(db, username, ymd, time, obj) {
  ensureUser(db, username);
  if (!db.users[username].entries[ymd]) db.users[username].entries[ymd] = {};
  db.users[username].entries[ymd][time] = obj;
  saveDB(db);
}

function deleteEntry(db, username, ymd, time) {
  ensureUser(db, username);
  if (db.users[username].entries[ymd]) {
    delete db.users[username].entries[ymd][time];
    if (Object.keys(db.users[username].entries[ymd]).length === 0) {
      delete db.users[username].entries[ymd];
    }
    saveDB(db);
  }
}

/* =========================
   Time slot restriction
   ========================= */
function isPastSlot(ymd, time) {
  const [hour, minute] = time.split(":").map(Number);
  const slotDate = new Date(ymd + "T" + pad2(hour) + ":" + pad2(minute) + ":00");
  return slotDate < new Date();
}

/* =========================
   Auth
   ========================= */
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = (document.getElementById("username").value || "").trim();
  const password = (document.getElementById("password").value || "").trim();

  // Force credentials: Pradeep / Technorent
  if (username !== "Pradeep" || password !== "Technorent") {
    authView.classList.add("shake");
    setTimeout(() => authView.classList.remove("shake"), 500);

    // immersive popup for wrong login
    showPopup("Invalid username or password!", "error", 3000);
    return;
  }

  const db = loadDB();
  ensureUser(db, username);
  saveDB(db);

  setCurrentUser(username);
  showApp();

  // immersive popup for successful login
  showPopup(`Welcome, ${username}!`, "success", 2500);
});

logoutBtn.addEventListener("click", () => {
  logout();
  showAuth();
  showPopup("You have been logged out.", "info", 2500);
});

/* =========================
   Calendar Rendering
   ========================= */
function buildTimePicker() {
  timePicker.innerHTML = `<option value="" disabled selected>Select a time slot</option>`;
  TIME_SLOTS.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    timePicker.appendChild(opt);
  });
}

function renderCalendar() {
  monthLabel.textContent = monthName(viewYear, viewMonth);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = startDayOfWeek;
  const totalCells = Math.ceil((prevMonthDays + daysInMonth) / 7) * 7;

  daysGrid.innerHTML = "";
  const user = getCurrentUser();
  const db = loadDB();

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "day";

    const dayNumEl = document.createElement("div");
    dayNumEl.className = "num";

    const badge = document.createElement("div");
    badge.className = "badge-count";

    const dayOffset = i - prevMonthDays + 1;
    const date = new Date(viewYear, viewMonth, dayOffset);
    const inThisMonth = (date.getMonth() === viewMonth);
    if (!inThisMonth) cell.classList.add("muted");

    dayNumEl.textContent = date.getDate();

    const today = new Date();
    if (fmtDateYMD(today) === fmtDateYMD(date)) {
      cell.classList.add("today");
    }

    const ymd = fmtDateYMD(date);
    const entries = user ? getEntriesFor(db, user, ymd) : {};
    const count = Object.keys(entries).length;
    if (count > 0) {
      badge.textContent = count;
      cell.appendChild(badge);
    }

    cell.appendChild(dayNumEl);
    cell.addEventListener("click", () => onSelectDate(ymd));
    daysGrid.appendChild(cell);
  }
}

function onSelectDate(ymd) {
  selectedDateStr = ymd;
  selectedDateLabel.textContent = new Date(ymd).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  timePickerWrap.classList.remove("hidden");
  entryForm.classList.add("hidden");
  clearForm();
  renderEntriesList();
}

timePicker.addEventListener("change", () => {
  if (!selectedDateStr || !timePicker.value) return;

  const db = loadDB();
  const user = getCurrentUser();
  const existing = getEntriesFor(db, user, selectedDateStr)[timePicker.value];

  if (existing) {
    placeInput.value = existing.place || "";
    remarksInput.value = existing.remarks || "";
    recurrenceSelect.value = existing.recurrence || "none";
    pickupDateInput.value = existing.pickupDate || "";
    dropDateInput.value = existing.dropDate || "";
  } else {
    clearForm(false);
  }
  entryForm.classList.remove("hidden");
});


saveBtn.addEventListener("click", () => {
  const user = getCurrentUser();
  if (!user) return;

  if (!selectedDateStr) { 
    alert("Please pick a date."); 
    return; 
  }

  const time = timePicker.value;
  if (!time) { 
    alert("Please pick a time slot."); 
    return; 
  }

  const place = (placeInput.value || "").trim();
  const remarks = (remarksInput.value || "").trim();
  const recurrence = recurrenceSelect.value;
  const pickupDate = pickupDateInput.value;
  const dropDate = dropDateInput.value;

  const db = loadDB();
  setEntry(db, user, selectedDateStr, time, {
    place, remarks, recurrence, pickupDate, dropDate
  });

  renderCalendar();
  renderEntriesList();
  showPopup("Entry saved successfully!", "success", 2500);
});

clearBtn.addEventListener("click", () => clearForm(true));

function clearForm(resetTime = false) {
  if (resetTime) timePicker.value = "";
  placeInput.value = "";
  remarksInput.value = "";
}

/* =========================
   Entries List (edit/delete)
   ========================= */
function renderEntriesList() {
  const user = getCurrentUser();
  const db = loadDB();
  const map = selectedDateStr ? getEntriesFor(db, user, selectedDateStr) : {};

  entriesList.innerHTML = "";

  const times = Object.keys(map).sort((a, b) => a.localeCompare(b));
  if (times.length === 0) {
    const li = document.createElement("li");
    li.className = "muted tiny";
    li.textContent = selectedDateStr ? "No entries yet for this date." : "Select a date to view entries.";
    entriesList.appendChild(li);
    return;
  }

  times.forEach(t => {
    const { place = "", remarks = "", recurrence = "none", pickupDate = "", dropDate = "" } = map[t] || {};

    const li = document.createElement("li");
    li.className = "entry";

    const left = document.createElement("div");
    left.style.flex = "1";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = place || "(No place)";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <span class="badge">${t}</span> 
      ${remarks ? " • " + remarks : ""} 
      ${pickupDate ? " • Pickup: " + new Date(pickupDate).toLocaleString() : ""} 
      ${dropDate ? " • Drop: " + new Date(dropDate).toLocaleString() : ""} 
      ${recurrence !== "none" ? " • Recurs: " + recurrence : ""}
    `;

    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "actions";

    const past = isPastSlot(selectedDateStr, t);

    // ----- Edit Button -----
    const editBtn = document.createElement("button");
    editBtn.className = "btn small";
    editBtn.textContent = "Edit";
    editBtn.disabled = past;
    editBtn.addEventListener("click", () => {
      // Prefill all fields
      timePicker.value = t;
      placeInput.value = place;
      remarksInput.value = remarks;
      recurrenceSelect.value = recurrence;
      pickupDateInput.value = pickupDate;
      dropDateInput.value = dropDate;

      entryForm.classList.remove("hidden");
      timePickerWrap.classList.remove("hidden");
      placeInput.focus();
    });

    // ----- Delete Button -----
    const delBtn = document.createElement("button");
    delBtn.className = "btn small";
    delBtn.style.borderColor = "rgba(239,68,68,0.35)";
    delBtn.textContent = "Delete";
    delBtn.disabled = past;
    delBtn.addEventListener("click", () => {
      showConfirm(`Are you sure you want to delete the ${t} entry?`, () => {
        deleteEntry(db, user, selectedDateStr, t);
        renderCalendar();
        renderEntriesList();
        showPopup("Entry deleted.", "info", 2500);
      });
    });

    right.appendChild(editBtn);
    right.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(right);

    entriesList.appendChild(li);
  });
}



/* =========================
   Month Navigation
   ========================= */
prevMonthBtn.addEventListener("click", () => {
  if (viewMonth === 0) { viewMonth = 11; viewYear--; } else { viewMonth--; }
  renderCalendar();
});
nextMonthBtn.addEventListener("click", () => {
  if (viewMonth === 11) { viewMonth = 0; viewYear++; } else { viewMonth++; }
  renderCalendar();
});
todayBtn.addEventListener("click", () => {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  renderCalendar();
  onSelectDate(fmtDateYMD(now));
});

/* =========================
   View Switching
   ========================= */
function showAuth() {
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
  loginForm.reset();
  document.getElementById("username").focus();
}

function showApp() {
  const user = getCurrentUser();
  if (!user) return showAuth();

  greetingEl.textContent = `Signed in as ${user}`;
  authView.classList.add("hidden");
  appView.classList.remove("hidden");

  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();

  buildTimePicker();
  renderCalendar();
  selectedDateStr = "";
  selectedDateLabel.textContent = "Select a date";
  timePickerWrap.classList.add("hidden");
  entryForm.classList.add("hidden");
  entriesList.innerHTML = `<li class="muted tiny">Select a date to view entries.</li>`;
}

/* =========================
   Init
   ========================= */
(function init(){
  const user = getCurrentUser();
  if (user) showApp(); else showAuth();
})();

const themeSelector = document.getElementById("themeSelector");
themeSelector.addEventListener("change", () => {
  const theme = themeSelector.value;
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("preferredTheme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("preferredTheme");
  }
});

(function applySavedTheme(){
  const saved = localStorage.getItem("preferredTheme");
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
    themeSelector.value = saved;
  }
})();
