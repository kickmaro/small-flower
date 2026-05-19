const STORAGE_KEY = "clock-payroll-records-v1";
const SETTINGS_KEY = "clock-payroll-settings-v1";
const AUTH_KEY = "clock-payroll-current-employee-v1";

let deferredInstallPrompt = null;

const employeeAccounts = [
  { id: "A001", name: "洪小花", password: "1234", role: "employee" },
  { id: "A002", name: "林小明", password: "2222", role: "employee" },
  { id: "HR0001", name: "HR 管理員", password: "hr1234", role: "hr" },
  { id: "HR001", name: "HR 管理員", password: "hr1234", role: "hr" },
];

const leaveLabels = {
  work: "上班",
  annual: "特休",
  sick: "病假",
  personal: "事假",
  official: "公假",
  unpaid: "無薪假",
};

const leaveTypes = ["annual", "sick", "personal", "official", "unpaid"];

const defaultSettings = {
  hourlyRate: 190,
  overtimeMultiplier: 1.34,
  standardHours: 8,
};

let currentEmployeeId = sessionStorage.getItem(AUTH_KEY) || "";
let currentAccount = null;
let records = [];
let settings = loadSettings();
let selectedMonth = monthKey(new Date());

const els = {
  loginForm: document.querySelector("#loginForm"),
  employeeId: document.querySelector("#employeeId"),
  employeePassword: document.querySelector("#employeePassword"),
  loginError: document.querySelector("#loginError"),
  currentEmployee: document.querySelector("#currentEmployee"),
  currentRole: document.querySelector("#currentRole"),
  logoutBtn: document.querySelector("#logoutBtn"),
  installBtn: document.querySelector("#installBtn"),
  todayText: document.querySelector("#todayText"),
  liveDate: document.querySelector("#liveDate"),
  liveClock: document.querySelector("#liveClock"),
  clockStatus: document.querySelector("#clockStatus"),
  monthTitle: document.querySelector("#monthTitle"),
  monthPicker: document.querySelector("#monthPicker"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  hourlyRate: document.querySelector("#hourlyRate"),
  overtimeMultiplier: document.querySelector("#overtimeMultiplier"),
  standardHours: document.querySelector("#standardHours"),
  clockInBtn: document.querySelector("#clockInBtn"),
  clockOutBtn: document.querySelector("#clockOutBtn"),
  recordForm: document.querySelector("#recordForm"),
  recordDate: document.querySelector("#recordDate"),
  recordType: document.querySelector("#recordType"),
  startTime: document.querySelector("#startTime"),
  endTime: document.querySelector("#endTime"),
  breakMinutes: document.querySelector("#breakMinutes"),
  note: document.querySelector("#note"),
  leaveForm: document.querySelector("#leaveForm"),
  leaveType: document.querySelector("#leaveType"),
  leaveDuration: document.querySelector("#leaveDuration"),
  leaveStartDate: document.querySelector("#leaveStartDate"),
  leaveEndDate: document.querySelector("#leaveEndDate"),
  leaveReason: document.querySelector("#leaveReason"),
  recordsTable: document.querySelector("#recordsTable"),
  emptyRecords: document.querySelector("#emptyRecords"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  printBtn: document.querySelector("#printBtn"),
  totalHours: document.querySelector("#totalHours"),
  overtimeHours: document.querySelector("#overtimeHours"),
  workDays: document.querySelector("#workDays"),
  totalPay: document.querySelector("#totalPay"),
  salaryRange: document.querySelector("#salaryRange"),
  hoursChart: document.querySelector("#hoursChart"),
  leaveRange: document.querySelector("#leaveRange"),
  leaveStats: document.querySelector("#leaveStats"),
  leaveTable: document.querySelector("#leaveTable"),
  emptyLeave: document.querySelector("#emptyLeave"),
  exportAllCsvBtn: document.querySelector("#exportAllCsvBtn"),
  accountTable: document.querySelector("#accountTable"),
  hrRecordsTable: document.querySelector("#hrRecordsTable"),
  emptyHrRecords: document.querySelector("#emptyHrRecords"),
  hrEmployeeCount: document.querySelector("#hrEmployeeCount"),
  hrRecordCount: document.querySelector("#hrRecordCount"),
  hrLeaveCount: document.querySelector("#hrLeaveCount"),
  hrHourCount: document.querySelector("#hrHourCount"),
  barTemplate: document.querySelector("#barTemplate"),
};

init();

function init() {
  registerServiceWorker();
  hydrateSettings();
  bindEvents();
  setInterval(tickClock, 1000);
  els.recordDate.value = todayKey();
  els.leaveStartDate.value = todayKey();
  els.leaveEndDate.value = todayKey();
  els.breakMinutes.value = "60";
  syncTimeFields();
  if (currentEmployeeId) {
    loginEmployee(currentEmployeeId);
  } else {
    showLogin();
  }
}

function bindEvents() {
  window.addEventListener("beforeinstallprompt", handleInstallPrompt);
  window.addEventListener("appinstalled", hideInstallButton);
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", logoutEmployee);
  els.installBtn.addEventListener("click", installApp);

  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  els.monthPicker.addEventListener("change", () => updateMonth(els.monthPicker.value));
  els.prevMonth.addEventListener("click", () => shiftMonth(-1));
  els.nextMonth.addEventListener("click", () => shiftMonth(1));
  els.clockInBtn.addEventListener("click", () => stampTime("in"));
  els.clockOutBtn.addEventListener("click", () => stampTime("out"));
  els.recordForm.addEventListener("submit", saveManualRecord);
  els.leaveForm.addEventListener("submit", saveLeaveRequest);
  els.recordType.addEventListener("change", syncTimeFields);
  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.exportAllCsvBtn.addEventListener("click", exportAllCsv);
  els.printBtn.addEventListener("click", () => window.print());

  [els.hourlyRate, els.overtimeMultiplier, els.standardHours].forEach((input) => {
    input.addEventListener("input", () => {
      settings = {
        hourlyRate: Number(els.hourlyRate.value) || 0,
        overtimeMultiplier: Number(els.overtimeMultiplier.value) || 1,
        standardHours: Number(els.standardHours.value) || 8,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      render();
    });
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=3").catch(() => {});
  });
}

function handleInstallPrompt(event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installBtn.hidden = false;
}

function hideInstallButton() {
  deferredInstallPrompt = null;
  els.installBtn.hidden = true;
}

async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  hideInstallButton();
}

function handleLogin(event) {
  event.preventDefault();
  const employeeId = els.employeeId.value.trim();
  const password = els.employeePassword.value.trim();

  if (!employeeId || !password) {
    els.loginError.textContent = "請輸入工號與密碼";
    return;
  }

  const account = employeeAccounts.find((item) => item.id === employeeId && item.password === password);
  if (!account) {
    els.loginError.textContent = "工號或密碼不正確";
    return;
  }

  els.loginError.textContent = "";
  els.employeePassword.value = "";
  loginEmployee(account.id);
}

function loginEmployee(employeeId) {
  currentEmployeeId = employeeId;
  currentAccount = getAccount(employeeId);
  sessionStorage.setItem(AUTH_KEY, currentEmployeeId);
  records = loadRecords();
  els.currentEmployee.textContent = `${currentAccount.name} (${currentAccount.id})`;
  els.currentRole.textContent = currentAccount.role === "hr" ? "HR 後台權限" : "員工";
  document.body.classList.toggle("is-hr", currentAccount.role === "hr");
  document.body.classList.add("is-authenticated");
  updateMonth(selectedMonth);
}

function logoutEmployee() {
  sessionStorage.removeItem(AUTH_KEY);
  currentEmployeeId = "";
  currentAccount = null;
  records = [];
  els.currentEmployee.textContent = "-";
  els.currentRole.textContent = "-";
  document.body.classList.remove("is-hr");
  document.body.classList.remove("is-authenticated");
  els.employeeId.value = "";
  els.employeePassword.value = "";
  showLogin();
}

function showLogin() {
  document.body.classList.remove("is-authenticated");
  els.loginError.textContent = "";
  els.employeeId.focus();
}

function switchTab(tab) {
  if (tab === "hr" && !isHr()) return;
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === tab);
  });
}

function hydrateSettings() {
  els.hourlyRate.value = settings.hourlyRate;
  els.overtimeMultiplier.value = settings.overtimeMultiplier;
  els.standardHours.value = settings.standardHours;
}

function tickClock() {
  const now = new Date();
  els.todayText.textContent = formatDate(now);
  els.liveDate.textContent = formatDate(now);
  els.liveClock.textContent = now.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const today = records.find((record) => record.date === todayKey() && record.type === "work");
  if (!today) {
    els.clockStatus.textContent = "今日尚未打卡";
  } else if (today.startTime && !today.endTime) {
    els.clockStatus.textContent = `已上班 ${today.startTime}`;
  } else {
    els.clockStatus.textContent = `今日工時 ${formatHours(calculateRecord(today).hours)}`;
  }
}

function stampTime(direction) {
  const now = new Date();
  const date = todayKey();
  const time = now.toTimeString().slice(0, 5);
  let record = records.find((item) => item.date === date && item.type === "work");

  if (!record) {
    record = createRecord({ date, type: "work", breakMinutes: 60 });
    records.push(record);
  }

  if (direction === "in") {
    record.startTime = time;
  } else {
    record.endTime = time;
    if (!record.startTime) record.startTime = time;
  }

  persistRecords();
  selectedMonth = date.slice(0, 7);
  updateMonth(selectedMonth);
}

function saveManualRecord(event) {
  event.preventDefault();
  const type = els.recordType.value;
  const record = createRecord({
    date: els.recordDate.value,
    type,
    startTime: type === "work" ? els.startTime.value : "",
    endTime: type === "work" ? els.endTime.value : "",
    breakMinutes: type === "work" ? Number(els.breakMinutes.value) || 0 : 0,
    note: els.note.value.trim(),
  });

  const existingIndex = records.findIndex((item) => item.id === record.id);
  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }

  persistRecords();
  selectedMonth = record.date.slice(0, 7);
  updateMonth(selectedMonth);
  els.recordForm.reset();
  els.recordDate.value = todayKey();
  els.breakMinutes.value = "60";
  syncTimeFields();
}

function createRecord(input) {
  return {
    id: input.id || `${input.date}-${input.type}`,
    date: input.date,
    type: input.type || "work",
    startTime: input.startTime || "",
    endTime: input.endTime || "",
    breakMinutes: Number(input.breakMinutes) || 0,
    leaveDays: Number(input.leaveDays) || 0,
    leavePeriod: input.leavePeriod || "",
    note: input.note || "",
  };
}

function saveLeaveRequest(event) {
  event.preventDefault();

  const startDate = els.leaveStartDate.value;
  const endDate = els.leaveEndDate.value;
  if (!startDate || !endDate || endDate < startDate) {
    alert("請確認請假日期區間");
    return;
  }

  const [leaveDays, leavePeriod] = parseLeaveDuration(els.leaveDuration.value);
  const requestId = Date.now();
  const newRecords = datesBetween(startDate, endDate).map((date, index) =>
    createRecord({
      id: `leave-${requestId}-${index}`,
      date,
      type: els.leaveType.value,
      leaveDays,
      leavePeriod,
      note: buildLeaveNote(leavePeriod, els.leaveReason.value.trim()),
    }),
  );

  records.push(...newRecords);
  persistRecords();
  selectedMonth = startDate.slice(0, 7);
  updateMonth(selectedMonth);
  els.leaveForm.reset();
  els.leaveStartDate.value = todayKey();
  els.leaveEndDate.value = todayKey();
}

function syncTimeFields() {
  const isWork = els.recordType.value === "work";
  document.querySelectorAll(".time-field").forEach((field) => {
    field.style.display = isWork ? "grid" : "none";
  });
}

function updateMonth(month) {
  selectedMonth = month || selectedMonth;
  els.monthPicker.value = selectedMonth;
  const [year, monthIndex] = selectedMonth.split("-").map(Number);
  const titleDate = new Date(year, monthIndex - 1, 1);
  els.monthTitle.textContent = titleDate.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
  });
  render();
}

function shiftMonth(amount) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + amount, 1);
  updateMonth(monthKey(next));
}

function render() {
  const monthRecords = getMonthRecords();
  renderRecords(monthRecords);
  renderSalary(monthRecords);
  renderLeave(monthRecords);
  renderHrDashboard();
  tickClock();
}

function getMonthRecords() {
  return records
    .filter((record) => record.date.startsWith(selectedMonth))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

function renderRecords(monthRecords) {
  els.recordsTable.innerHTML = "";
  els.emptyRecords.classList.toggle("is-visible", monthRecords.length === 0);

  monthRecords.forEach((record) => {
    const computed = calculateRecord(record);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(record.date)}</td>
      <td>${leaveLabels[record.type] || record.type}</td>
      <td>${record.startTime || "-"}</td>
      <td>${record.endTime || "-"}</td>
      <td>${record.breakMinutes || 0} 分</td>
      <td>${formatHours(computed.hours)}</td>
      <td>${formatHours(computed.overtime)}</td>
      <td>${formatMoney(computed.pay)}</td>
      <td>${formatLeaveDays(getLeaveDays(record))}</td>
      <td>${escapeHtml(record.note || "-")}</td>
      <td><button class="danger-button" type="button" data-delete="${record.id}">刪除</button></td>
    `;
    els.recordsTable.append(row);
  });

  els.recordsTable.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      records = records.filter((record) => record.id !== button.dataset.delete);
      persistRecords();
      render();
    });
  });
}

function renderSalary(monthRecords) {
  const workRecords = monthRecords.filter((record) => record.type === "work");
  const totals = workRecords.reduce(
    (sum, record) => {
      const computed = calculateRecord(record);
      sum.hours += computed.hours;
      sum.overtime += computed.overtime;
      sum.pay += computed.pay;
      return sum;
    },
    { hours: 0, overtime: 0, pay: 0 },
  );

  els.totalHours.textContent = formatHours(totals.hours);
  els.overtimeHours.textContent = formatHours(totals.overtime);
  els.workDays.textContent = workRecords.length;
  els.totalPay.textContent = formatMoney(totals.pay);
  els.salaryRange.textContent = selectedMonth;
  renderHoursChart(workRecords);
}

function renderHoursChart(workRecords) {
  els.hoursChart.innerHTML = "";
  if (workRecords.length === 0) {
    els.hoursChart.innerHTML = '<p class="empty-state is-visible">本月尚無工時</p>';
    return;
  }

  const maxHours = Math.max(...workRecords.map((record) => calculateRecord(record).hours), settings.standardHours, 1);
  workRecords.forEach((record) => {
    const computed = calculateRecord(record);
    const item = els.barTemplate.content.firstElementChild.cloneNode(true);
    item.querySelector(".bar-label").textContent = record.date.slice(5);
    item.querySelector(".bar-track span").style.width = `${Math.round((computed.hours / maxHours) * 100)}%`;
    item.querySelector(".bar-value").textContent = formatHours(computed.hours);
    els.hoursChart.append(item);
  });
}

function renderLeave(monthRecords) {
  const leaveRecords = monthRecords.filter((record) => leaveTypes.includes(record.type));
  els.leaveRange.textContent = selectedMonth;
  els.leaveStats.innerHTML = "";
  leaveTypes.forEach((type) => {
    const count = leaveRecords
      .filter((record) => record.type === type)
      .reduce((sum, record) => sum + getLeaveDays(record), 0);
    const card = document.createElement("article");
    card.className = "leave-card";
    card.dataset.type = type;
    card.innerHTML = `
      <span>${leaveLabels[type]}</span>
      <strong>${formatLeaveNumber(count)}</strong>
      <small>天</small>
    `;
    els.leaveStats.append(card);
  });
  renderLeaveTable(leaveRecords);
}

function renderLeaveTable(leaveRecords) {
  els.leaveTable.innerHTML = "";
  els.emptyLeave.classList.toggle("is-visible", leaveRecords.length === 0);

  leaveRecords.forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(record.date)}</td>
      <td>${leaveLabels[record.type] || record.type}</td>
      <td>${formatLeaveDays(getLeaveDays(record))}</td>
      <td>${escapeHtml(record.note || "-")}</td>
      <td><button class="danger-button" type="button" data-delete="${record.id}">刪除</button></td>
    `;
    els.leaveTable.append(row);
  });

  els.leaveTable.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      records = records.filter((record) => record.id !== button.dataset.delete);
      persistRecords();
      render();
    });
  });
}

function calculateRecord(record) {
  if (record.type !== "work" || !record.startTime || !record.endTime) {
    return { hours: 0, overtime: 0, pay: 0 };
  }

  const start = parseMinutes(record.startTime);
  let end = parseMinutes(record.endTime);
  if (end < start) end += 24 * 60;

  const minutes = Math.max(end - start - record.breakMinutes, 0);
  const hours = roundToQuarter(minutes / 60);
  const regular = Math.min(hours, settings.standardHours);
  const overtime = Math.max(hours - settings.standardHours, 0);
  const pay = regular * settings.hourlyRate + overtime * settings.hourlyRate * settings.overtimeMultiplier;

  return { hours, overtime, pay };
}

function parseMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function roundToQuarter(value) {
  return Math.round(value * 4) / 4;
}

function exportCsv() {
  const rows = [
    ["日期", "類型", "上班", "下班", "休息分鐘", "工時", "加班", "薪資", "請假天數", "備註"],
    ...getMonthRecords().map((record) => {
      const computed = calculateRecord(record);
      return [
        record.date,
        leaveLabels[record.type] || record.type,
        record.startTime,
        record.endTime,
        record.breakMinutes,
        computed.hours,
        computed.overtime,
        Math.round(computed.pay),
        getLeaveDays(record),
        record.note,
      ];
    }),
  ];

  downloadCsv(rows, `打卡紀錄-${selectedMonth}.csv`);
}

function renderHrDashboard() {
  if (!isHr()) return;

  const employeeAccountsOnly = employeeAccounts.filter((account) => account.role === "employee");
  const allRows = getAllEmployeeRecords().filter((item) => item.record.date.startsWith(selectedMonth));
  const leaveRows = allRows.filter((item) => leaveTypes.includes(item.record.type));
  const totalHours = allRows.reduce((sum, item) => sum + calculateRecord(item.record).hours, 0);

  els.hrEmployeeCount.textContent = employeeAccountsOnly.length;
  els.hrRecordCount.textContent = allRows.length;
  els.hrLeaveCount.textContent = formatLeaveNumber(leaveRows.reduce((sum, item) => sum + getLeaveDays(item.record), 0));
  els.hrHourCount.textContent = formatHours(totalHours);
  renderAccountTable();
  renderHrRecordsTable(allRows);
}

function renderAccountTable() {
  els.accountTable.innerHTML = "";
  employeeAccounts.forEach((account) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(account.id)}</td>
      <td>${escapeHtml(account.name)}</td>
      <td>${account.role === "hr" ? "HR" : "員工"}</td>
      <td>${escapeHtml(account.password)}</td>
    `;
    els.accountTable.append(row);
  });
}

function renderHrRecordsTable(rows) {
  els.hrRecordsTable.innerHTML = "";
  els.emptyHrRecords.classList.toggle("is-visible", rows.length === 0);

  rows
    .sort((a, b) => `${a.record.date}${a.account.id}`.localeCompare(`${b.record.date}${b.account.id}`))
    .forEach(({ account, record }) => {
      const computed = calculateRecord(record);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(account.id)}</td>
        <td>${escapeHtml(account.name)}</td>
        <td>${escapeHtml(record.date)}</td>
        <td>${leaveLabels[record.type] || record.type}</td>
        <td>${record.startTime || "-"}</td>
        <td>${record.endTime || "-"}</td>
        <td>${formatHours(computed.hours)}</td>
        <td>${formatLeaveDays(getLeaveDays(record))}</td>
        <td>${escapeHtml(record.note || "-")}</td>
      `;
      els.hrRecordsTable.append(row);
    });
}

function exportAllCsv() {
  if (!isHr()) return;

  const rows = [
    ["工號", "姓名", "日期", "類型", "上班", "下班", "休息分鐘", "工時", "加班", "薪資", "請假天數", "備註"],
    ...getAllEmployeeRecords()
      .filter((item) => item.record.date.startsWith(selectedMonth))
      .map(({ account, record }) => {
        const computed = calculateRecord(record);
        return [
          account.id,
          account.name,
          record.date,
          leaveLabels[record.type] || record.type,
          record.startTime,
          record.endTime,
          record.breakMinutes,
          computed.hours,
          computed.overtime,
          Math.round(computed.pay),
          getLeaveDays(record),
          record.note,
        ];
      }),
  ];

  downloadCsv(rows, `HR彙整紀錄-${selectedMonth}.csv`);
}

function getAllEmployeeRecords() {
  return employeeAccounts
    .filter((account) => account.role === "employee")
    .flatMap((account) => loadRecordsForEmployee(account.id).map((record) => ({ account, record })));
}

function downloadCsv(rows, filename) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function persistRecords() {
  if (!currentEmployeeId) return;
  localStorage.setItem(employeeRecordsKey(currentEmployeeId), JSON.stringify(records));
}

function loadRecords() {
  if (!currentEmployeeId) return [];
  return loadRecordsForEmployee(currentEmployeeId);
}

function loadRecordsForEmployee(employeeId) {
  try {
    return JSON.parse(localStorage.getItem(employeeRecordsKey(employeeId))) || [];
  } catch {
    return [];
  }
}

function employeeRecordsKey(employeeId) {
  return `${STORAGE_KEY}-${employeeId}`;
}

function loadSettings() {
  try {
    return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch {
    return { ...defaultSettings };
  }
}

function getAccount(employeeId) {
  return employeeAccounts.find((account) => account.id === employeeId) || {
    id: employeeId,
    name: employeeId,
    password: "",
    role: "employee",
  };
}

function isHr() {
  return currentAccount?.role === "hr";
}

function todayKey() {
  const today = new Date();
  return `${monthKey(today)}-${padDate(today.getDate())}`;
}

function parseLeaveDuration(value) {
  if (value === "0.5-am") return [0.5, "上午半天"];
  if (value === "0.5-pm") return [0.5, "下午半天"];
  return [1, "全天"];
}

function buildLeaveNote(period, reason) {
  return reason ? `${period}｜${reason}` : period;
}

function datesBetween(startDate, endDate) {
  const dates = [];
  const current = dateFromKey(startDate);
  const end = dateFromKey(endDate);

  while (current <= end) {
    dates.push(`${monthKey(current)}-${padDate(current.getDate())}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthKey(date) {
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}`;
}

function padDate(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatHours(value) {
  return `${Number(value).toFixed(2)}h`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function getLeaveDays(record) {
  if (!leaveTypes.includes(record.type)) return 0;
  return Number(record.leaveDays) || 1;
}

function formatLeaveDays(value) {
  return value ? `${formatLeaveNumber(value)} 天` : "-";
}

function formatLeaveNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value.toFixed(1));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
