const STORAGE_KEY = "clock-payroll-records-v1";
const AUTH_KEY = "clock-payroll-current-employee-v1";
const WORKSITE_KEY = "clock-payroll-worksite-v1";

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

let currentEmployeeId = sessionStorage.getItem(AUTH_KEY) || "";
let currentAccount = null;
let records = [];
let worksite = loadWorksite();
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
  locationStatus: document.querySelector("#locationStatus"),
  locationMapPanel: document.querySelector("#locationMapPanel"),
  locationMapPin: document.querySelector("#locationMapPin"),
  locationMapMeta: document.querySelector("#locationMapMeta"),
  locationMapLink: document.querySelector("#locationMapLink"),
  monthTitle: document.querySelector("#monthTitle"),
  monthPicker: document.querySelector("#monthPicker"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  worksiteForm: document.querySelector("#worksiteForm"),
  worksiteLat: document.querySelector("#worksiteLat"),
  worksiteLng: document.querySelector("#worksiteLng"),
  worksiteRadius: document.querySelector("#worksiteRadius"),
  worksiteStatus: document.querySelector("#worksiteStatus"),
  saveWorksiteBtn: document.querySelector("#saveWorksiteBtn"),
  useCurrentLocationBtn: document.querySelector("#useCurrentLocationBtn"),
  clockInBtn: document.querySelector("#clockInBtn"),
  clockOutBtn: document.querySelector("#clockOutBtn"),
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
};

init();

function init() {
  registerServiceWorker();
  hydrateWorksite();
  bindEvents();
  setInterval(tickClock, 1000);
  els.leaveStartDate.value = todayKey();
  els.leaveEndDate.value = todayKey();
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
  els.leaveForm.addEventListener("submit", saveLeaveRequest);
  els.exportCsvBtn.addEventListener("click", exportCsv);
  els.exportAllCsvBtn.addEventListener("click", exportAllCsv);
  els.printBtn.addEventListener("click", () => window.print());
  els.worksiteForm.addEventListener("submit", saveWorksiteSettings);
  els.saveWorksiteBtn.addEventListener("click", saveWorksiteSettings);
  els.useCurrentLocationBtn.addEventListener("click", setWorksiteFromCurrentLocation);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw-v10.js").catch(() => {});
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

function hydrateWorksite() {
  els.worksiteLat.value = worksite.latitude ?? "";
  els.worksiteLng.value = worksite.longitude ?? "";
  els.worksiteRadius.value = worksite.radiusMeters ?? "";
  renderWorksiteStatus();
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

async function stampTime(direction) {
  const locationCheck = await validateClockLocation();
  if (!locationCheck.ok) {
    els.locationStatus.textContent = locationCheck.message;
    alert(locationCheck.message);
    return;
  }

  const now = new Date();
  const date = todayKey();
  const time = now.toTimeString().slice(0, 5);
  let record = records.find((item) => item.date === date && item.type === "work");

  if (!record) {
    record = createRecord({ date, type: "work" });
    records.push(record);
  }

  if (direction === "in") {
    record.startTime = time;
    record.clockInLocation = locationCheck.location;
  } else {
    record.endTime = time;
    if (!record.startTime) record.startTime = time;
    record.clockOutLocation = locationCheck.location;
  }

  els.locationStatus.textContent = `${direction === "in" ? "上班" : "下班"}打卡成功，距離打卡點 ${formatMeters(locationCheck.location.distanceMeters)}`;
  renderLocationMap(locationCheck.location, direction === "in" ? "上班打卡" : "下班打卡");

  persistRecords();
  selectedMonth = date.slice(0, 7);
  updateMonth(selectedMonth);
}

function createRecord(input) {
  return {
    id: input.id || `${input.date}-${input.type}`,
    date: input.date,
    type: input.type || "work",
    startTime: input.startTime || "",
    endTime: input.endTime || "",
    breakMinutes: Number(input.breakMinutes) || 0,
    clockInLocation: input.clockInLocation || null,
    clockOutLocation: input.clockOutLocation || null,
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

function saveWorksiteSettings(event) {
  event.preventDefault();

  const nextWorksite = parseWorksiteForm();
  if (!nextWorksite) return;

  worksite = nextWorksite;
  localStorage.setItem(WORKSITE_KEY, JSON.stringify(worksite));
  renderWorksiteStatus();
  els.locationStatus.textContent = "打卡範圍已更新，下次打卡會檢查定位";
}

async function setWorksiteFromCurrentLocation() {
  els.worksiteStatus.textContent = "正在讀取目前位置...";
  els.useCurrentLocationBtn.disabled = true;

  try {
    const position = await getCurrentPosition();
    els.worksiteLat.value = position.coords.latitude.toFixed(6);
    els.worksiteLng.value = position.coords.longitude.toFixed(6);
    if (!els.worksiteRadius.value) els.worksiteRadius.value = "150";

    const nextWorksite = parseWorksiteForm();
    if (!nextWorksite) return;

    worksite = nextWorksite;
    localStorage.setItem(WORKSITE_KEY, JSON.stringify(worksite));
    renderWorksiteStatus();
  } catch (error) {
    els.worksiteStatus.textContent = geolocationErrorMessage(error);
  } finally {
    els.useCurrentLocationBtn.disabled = false;
  }
}

function parseWorksiteForm() {
  const latitude = Number(els.worksiteLat.value);
  const longitude = Number(els.worksiteLng.value);
  const radiusMeters = Number(els.worksiteRadius.value);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    alert("請輸入有效的中心緯度");
    return null;
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    alert("請輸入有效的中心經度");
    return null;
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters < 20) {
    alert("允許半徑至少需要 20 公尺");
    return null;
  }

  return {
    latitude,
    longitude,
    radiusMeters,
    updatedAt: new Date().toISOString(),
  };
}

function renderWorksiteStatus() {
  if (hasWorksite()) {
    els.worksiteStatus.textContent = `中心 ${worksite.latitude.toFixed(6)}, ${worksite.longitude.toFixed(6)}｜半徑 ${Math.round(worksite.radiusMeters)} 公尺`;
    els.locationStatus.textContent = `打卡需在半徑 ${Math.round(worksite.radiusMeters)} 公尺內`;
    return;
  }

  els.worksiteStatus.textContent = "尚未設定範圍，員工暫時不能打卡";
  els.locationStatus.textContent = "HR 尚未設定打卡範圍";
}

async function validateClockLocation() {
  if (!hasWorksite()) {
    return { ok: false, message: "尚未設定打卡範圍，請 HR 先設定中心點與半徑" };
  }

  if (!("geolocation" in navigator)) {
    return { ok: false, message: "此裝置不支援定位，無法打卡" };
  }

  els.locationStatus.textContent = "正在檢查定位...";
  els.clockInBtn.disabled = true;
  els.clockOutBtn.disabled = true;

  try {
    const position = await getCurrentPosition();
    const distanceMeters = distanceBetweenMeters(
      position.coords.latitude,
      position.coords.longitude,
      worksite.latitude,
      worksite.longitude,
    );
    const location = {
      latitude: Number(position.coords.latitude.toFixed(6)),
      longitude: Number(position.coords.longitude.toFixed(6)),
      accuracy: Math.round(position.coords.accuracy || 0),
      distanceMeters: Math.round(distanceMeters),
      capturedAt: new Date().toISOString(),
    };

    if (distanceMeters > worksite.radiusMeters) {
      return {
        ok: false,
        message: `目前距離打卡點 ${formatMeters(distanceMeters)}，超出允許半徑 ${Math.round(worksite.radiusMeters)} 公尺`,
        location,
      };
    }

    return { ok: true, message: "定位通過", location };
  } catch (error) {
    return { ok: false, message: geolocationErrorMessage(error) };
  } finally {
    els.clockInBtn.disabled = false;
    els.clockOutBtn.disabled = false;
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
    });
  });
}

function geolocationErrorMessage(error) {
  if (error?.code === 1) return "定位授權被拒絕，請允許瀏覽器使用位置後再打卡";
  if (error?.code === 2) return "目前無法取得定位，請確認 GPS 或網路狀態";
  if (error?.code === 3) return "定位逾時，請移到訊號較好的位置再試一次";
  return "無法取得定位，請確認此網頁使用 HTTPS 開啟";
}

function hasWorksite() {
  return (
    Number.isFinite(worksite.latitude) &&
    Number.isFinite(worksite.longitude) &&
    Number.isFinite(worksite.radiusMeters) &&
    worksite.radiusMeters >= 20
  );
}

function distanceBetweenMeters(lat1, lng1, lat2, lng2) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
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
  renderLeave(monthRecords);
  renderHrDashboard();
  renderLatestLocationMap();
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
      <td>${formatHours(computed.hours)}</td>
      <td>${formatLocationSummary(record)}</td>
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

function renderLatestLocationMap() {
  const latest = getLatestClockLocation();
  if (!latest) {
    els.locationMapPanel.hidden = true;
    return;
  }

  renderLocationMap(latest.location, latest.label);
}

function getLatestClockLocation() {
  return records
    .filter((record) => record.type === "work" && (record.clockInLocation || record.clockOutLocation))
    .flatMap((record) => [
      record.clockInLocation ? { label: "上班打卡", location: record.clockInLocation } : null,
      record.clockOutLocation ? { label: "下班打卡", location: record.clockOutLocation } : null,
    ])
    .filter(Boolean)
    .sort((a, b) => String(b.location.capturedAt || "").localeCompare(String(a.location.capturedAt || "")))[0];
}

function renderLocationMap(location, label) {
  if (!hasWorksite() || !location) {
    els.locationMapPanel.hidden = true;
    return;
  }

  const offset = locationOffsetMeters(worksite, location);
  const scale = Math.max(worksite.radiusMeters, location.distanceMeters || 1);
  const x = clamp(50 + (offset.x / scale) * 38, 8, 92);
  const y = clamp(50 - (offset.y / scale) * 38, 8, 92);

  els.locationMapPanel.hidden = false;
  els.locationMapPin.style.left = `${x}%`;
  els.locationMapPin.style.top = `${y}%`;
  els.locationMapMeta.textContent = [
    label,
    formatCapturedAt(location.capturedAt),
    `距離 ${formatMeters(location.distanceMeters)}`,
    location.accuracy ? `定位精度約 ${formatMeters(location.accuracy)}` : "",
  ]
    .filter(Boolean)
    .join("｜");
  els.locationMapLink.href = externalMapUrl(location);
}

function locationOffsetMeters(center, location) {
  const averageLat = toRadians((center.latitude + location.latitude) / 2);
  return {
    x: toRadians(location.longitude - center.longitude) * 6371000 * Math.cos(averageLat),
    y: toRadians(location.latitude - center.latitude) * 6371000,
  };
}

function externalMapUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
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
    return { hours: 0 };
  }

  const start = parseMinutes(record.startTime);
  let end = parseMinutes(record.endTime);
  if (end < start) end += 24 * 60;

  const minutes = Math.max(end - start - (Number(record.breakMinutes) || 0), 0);
  const hours = roundToQuarter(minutes / 60);
  return { hours };
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
    ["日期", "類型", "上班", "下班", "工時", "上班定位距離", "下班定位距離", "請假天數", "備註"],
    ...getMonthRecords().map((record) => {
      const computed = calculateRecord(record);
      return [
        record.date,
        leaveLabels[record.type] || record.type,
        record.startTime,
        record.endTime,
        computed.hours,
        formatLocationDistance(record.clockInLocation),
        formatLocationDistance(record.clockOutLocation),
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
  renderWorksiteStatus();
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
        <td>${formatLocationSummary(record)}</td>
        <td>${formatLeaveDays(getLeaveDays(record))}</td>
        <td>${escapeHtml(record.note || "-")}</td>
      `;
      els.hrRecordsTable.append(row);
    });
}

function exportAllCsv() {
  if (!isHr()) return;

  const rows = [
    ["工號", "姓名", "日期", "類型", "上班", "下班", "工時", "上班定位距離", "下班定位距離", "請假天數", "備註"],
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
          computed.hours,
          formatLocationDistance(record.clockInLocation),
          formatLocationDistance(record.clockOutLocation),
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

function loadWorksite() {
  try {
    return JSON.parse(localStorage.getItem(WORKSITE_KEY)) || {};
  } catch {
    return {};
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

function formatCapturedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHours(value) {
  return `${Number(value).toFixed(2)}h`;
}

function formatLocationSummary(record) {
  if (record.type !== "work") return "-";
  const clockIn = formatLocationDistance(record.clockInLocation);
  const clockOut = formatLocationDistance(record.clockOutLocation);
  if (!clockIn && !clockOut) return "-";
  return `上 ${clockIn || "-"} / 下 ${clockOut || "-"}`;
}

function formatLocationDistance(location) {
  if (!location || !Number.isFinite(Number(location.distanceMeters))) return "";
  return formatMeters(Number(location.distanceMeters));
}

function formatMeters(value) {
  const meters = Number(value) || 0;
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} 公里`;
  return `${Math.round(meters)} 公尺`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
