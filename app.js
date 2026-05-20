const CONFIG = window.HH_CLOCK_CONFIG || {};
const AUTH_EMAIL_DOMAIN = CONFIG.authEmailDomain || "hong-xiao-hua.local";

let deferredInstallPrompt = null;
let supabaseClient = null;
let currentProfile = null;
let records = [];
let hrRows = [];
let employeeProfiles = [];
let worksite = {};
let selectedMonth = monthKey(new Date());

const leaveLabels = {
  work: "上班",
  annual: "特休",
  sick: "病假",
  personal: "事假",
  official: "公假",
  unpaid: "無薪假",
};

const leaveTypes = ["annual", "sick", "personal", "official", "unpaid"];

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
  locationMapFrame: document.querySelector("#locationMapFrame"),
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
  employeeAdminForm: document.querySelector("#employeeAdminForm"),
  adminEmployeeId: document.querySelector("#adminEmployeeId"),
  adminFullName: document.querySelector("#adminFullName"),
  adminRole: document.querySelector("#adminRole"),
  adminPassword: document.querySelector("#adminPassword"),
  adminIsActive: document.querySelector("#adminIsActive"),
  employeeAdminStatus: document.querySelector("#employeeAdminStatus"),
  accountTable: document.querySelector("#accountTable"),
  hrRecordsTable: document.querySelector("#hrRecordsTable"),
  emptyHrRecords: document.querySelector("#emptyHrRecords"),
  hrEmployeeCount: document.querySelector("#hrEmployeeCount"),
  hrRecordCount: document.querySelector("#hrRecordCount"),
  hrLeaveCount: document.querySelector("#hrLeaveCount"),
  hrHourCount: document.querySelector("#hrHourCount"),
};

init();

async function init() {
  registerServiceWorker();
  bindEvents();
  setInterval(tickClock, 1000);
  els.leaveStartDate.value = todayKey();
  els.leaveEndDate.value = todayKey();
  tickClock();

  if (!configureBackend()) {
    showLogin("後端尚未設定，請先設定 config.js 的 Supabase URL 與 anon key");
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await loadAuthenticatedUser();
  } else {
    showLogin();
  }
}

function configureBackend() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey || !window.supabase?.createClient) return false;
  supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  return true;
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
  els.employeeAdminForm.addEventListener("submit", saveEmployeeAccount);
  els.printBtn.addEventListener("click", () => window.print());
  els.worksiteForm.addEventListener("submit", saveWorksiteSettings);
  els.saveWorksiteBtn.addEventListener("click", saveWorksiteSettings);
  els.useCurrentLocationBtn.addEventListener("click", setWorksiteFromCurrentLocation);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw-v13.js").catch(() => {});
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

async function handleLogin(event) {
  event.preventDefault();
  if (!supabaseClient) {
    showLogin("後端尚未設定，無法登入");
    return;
  }

  const employeeId = normalizeEmployeeId(els.employeeId.value);
  const password = els.employeePassword.value.trim();
  if (!employeeId || !password) {
    showLogin("請輸入工號與密碼");
    return;
  }

  setLoginBusy(true);
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: employeeIdToEmail(employeeId),
    password,
  });
  setLoginBusy(false);

  if (error) {
    showLogin("工號或密碼不正確，或帳號尚未啟用");
    return;
  }

  els.loginError.textContent = "";
  els.employeePassword.value = "";
  await loadAuthenticatedUser();
}

async function loadAuthenticatedUser() {
  const { data: userData, error: userError } = await supabaseClient.auth.getUser();
  if (userError || !userData.user) {
    showLogin();
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    await supabaseClient.auth.signOut();
    showLogin("找不到啟用中的員工資料，請聯絡 HR");
    return;
  }

  currentProfile = data;
  document.body.classList.toggle("is-hr", isHr());
  document.body.classList.add("is-authenticated");
  els.currentEmployee.textContent = `${currentProfile.full_name} (${currentProfile.employee_id})`;
  els.currentRole.textContent = isHr() ? "HR 後台權限" : "員工";
  await updateMonth(selectedMonth);
}

async function logoutEmployee() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentProfile = null;
  records = [];
  hrRows = [];
  employeeProfiles = [];
  els.currentEmployee.textContent = "-";
  els.currentRole.textContent = "-";
  document.body.classList.remove("is-hr", "is-authenticated");
  els.employeeId.value = "";
  els.employeePassword.value = "";
  showLogin();
}

function showLogin(message = "") {
  document.body.classList.remove("is-authenticated");
  els.loginError.textContent = message;
  els.employeeId.focus();
}

function setLoginBusy(isBusy) {
  els.loginForm.querySelector("button[type='submit']").disabled = isBusy;
  els.loginError.textContent = isBusy ? "登入中..." : "";
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

async function loadMonthData() {
  if (!currentProfile) return;

  const [startDate, endDate] = monthBounds(selectedMonth);
  const { data: ownRows, error: ownError } = await supabaseClient
    .from("attendance_records")
    .select("*")
    .eq("user_id", currentProfile.id)
    .gte("record_date", startDate)
    .lte("record_date", endDate)
    .order("record_date", { ascending: true });
  if (ownError) throw ownError;
  records = (ownRows || []).map(recordFromRow);

  const { data: siteRows, error: siteError } = await supabaseClient.from("worksite_settings").select("*").eq("id", 1).maybeSingle();
  if (siteError) throw siteError;
  worksite = siteRows ? worksiteFromRow(siteRows) : {};

  if (isHr()) {
    const { data: profiles, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .order("employee_id", { ascending: true });
    if (profileError) throw profileError;
    employeeProfiles = profiles || [];

    const { data: rows, error: rowsError } = await supabaseClient
      .from("attendance_records")
      .select("*, profiles(employee_id, full_name, role)")
      .gte("record_date", startDate)
      .lte("record_date", endDate)
      .order("record_date", { ascending: true });
    if (rowsError) throw rowsError;
    hrRows = (rows || []).map((row) => ({
      account: {
        id: row.profiles?.employee_id || "-",
        name: row.profiles?.full_name || "-",
        role: row.profiles?.role || "employee",
      },
      record: recordFromRow(row),
    }));
  }
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

  const date = todayKey();
  const time = new Date().toTimeString().slice(0, 5);
  const existing = records.find((item) => item.date === date && item.type === "work");
  const payload = {
    id: existing?.id,
    user_id: currentProfile.id,
    record_date: date,
    record_type: "work",
    start_time: direction === "in" ? time : existing?.startTime || time,
    end_time: direction === "out" ? time : existing?.endTime || null,
    ...locationPayload(direction, locationCheck.location),
  };

  const { data, error } = await supabaseClient
    .from("attendance_records")
    .upsert(payload, { onConflict: "user_id,record_date,record_type" })
    .select()
    .single();
  if (error) {
    alert(`打卡失敗：${error.message}`);
    return;
  }

  const record = recordFromRow(data);
  records = [...records.filter((item) => item.id !== record.id), record].sort(sortRecords);
  els.locationStatus.textContent = `${direction === "in" ? "上班" : "下班"}打卡成功，距離打卡點 ${formatMeters(locationCheck.location.distanceMeters)}`;
  renderLocationMap(locationCheck.location, direction === "in" ? "上班打卡" : "下班打卡");
  selectedMonth = date.slice(0, 7);
  await updateMonth(selectedMonth);
}

async function saveLeaveRequest(event) {
  event.preventDefault();
  const startDate = els.leaveStartDate.value;
  const endDate = els.leaveEndDate.value;
  if (!startDate || !endDate || endDate < startDate) {
    alert("請確認請假日期區間");
    return;
  }

  const [leaveDays, leavePeriod] = parseLeaveDuration(els.leaveDuration.value);
  const rows = datesBetween(startDate, endDate).map((date) => ({
    user_id: currentProfile.id,
    record_date: date,
    record_type: els.leaveType.value,
    leave_days: leaveDays,
    leave_period: leavePeriod,
    note: buildLeaveNote(leavePeriod, els.leaveReason.value.trim()),
  }));

  const { error } = await supabaseClient.from("attendance_records").insert(rows);
  if (error) {
    alert(`請假送出失敗：${error.message}`);
    return;
  }

  selectedMonth = startDate.slice(0, 7);
  await updateMonth(selectedMonth);
  els.leaveForm.reset();
  els.leaveStartDate.value = todayKey();
  els.leaveEndDate.value = todayKey();
}

async function saveWorksiteSettings(event) {
  event.preventDefault();
  if (!isHr()) return;

  const nextWorksite = parseWorksiteForm();
  if (!nextWorksite) return;

  const { data, error } = await supabaseClient
    .from("worksite_settings")
    .upsert({
      id: 1,
      latitude: nextWorksite.latitude,
      longitude: nextWorksite.longitude,
      radius_meters: nextWorksite.radiusMeters,
      updated_by: currentProfile.id,
    })
    .select()
    .single();

  if (error) {
    alert(`儲存打卡範圍失敗：${error.message}`);
    return;
  }

  worksite = worksiteFromRow(data);
  hydrateWorksite();
  els.locationStatus.textContent = "打卡範圍已更新，下次打卡會檢查定位";
}

async function setWorksiteFromCurrentLocation() {
  if (!isHr()) return;
  els.worksiteStatus.textContent = "正在讀取目前位置...";
  els.useCurrentLocationBtn.disabled = true;

  try {
    const position = await getCurrentPosition();
    els.worksiteLat.value = position.coords.latitude.toFixed(6);
    els.worksiteLng.value = position.coords.longitude.toFixed(6);
    if (!els.worksiteRadius.value) els.worksiteRadius.value = "150";
    await saveWorksiteSettings(new Event("submit"));
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
  return { latitude, longitude, radiusMeters };
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
  if (!hasWorksite()) return { ok: false, message: "尚未設定打卡範圍，請 HR 先設定中心點與半徑" };
  if (!("geolocation" in navigator)) return { ok: false, message: "此裝置不支援定位，無法打卡" };

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

async function updateMonth(month) {
  selectedMonth = month || selectedMonth;
  els.monthPicker.value = selectedMonth;
  const [year, monthIndex] = selectedMonth.split("-").map(Number);
  const titleDate = new Date(year, monthIndex - 1, 1);
  els.monthTitle.textContent = titleDate.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
  });
  if (currentProfile) await loadMonthData();
  hydrateWorksite();
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
  return [...records].sort(sortRecords);
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
    button.addEventListener("click", async () => {
      const { error } = await supabaseClient.from("attendance_records").delete().eq("id", button.dataset.delete);
      if (error) {
        alert(`刪除失敗：${error.message}`);
        return;
      }
      records = records.filter((record) => record.id !== button.dataset.delete);
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
  els.locationMapPanel.hidden = false;
  els.locationMapFrame.src = embeddedMapUrl(location);
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
    button.addEventListener("click", async () => {
      const { error } = await supabaseClient.from("attendance_records").delete().eq("id", button.dataset.delete);
      if (error) {
        alert(`刪除失敗：${error.message}`);
        return;
      }
      records = records.filter((record) => record.id !== button.dataset.delete);
      render();
    });
  });
}

function renderHrDashboard() {
  if (!isHr()) return;
  const leaveRows = hrRows.filter((item) => leaveTypes.includes(item.record.type));
  const totalHours = hrRows.reduce((sum, item) => sum + calculateRecord(item.record).hours, 0);
  els.hrEmployeeCount.textContent = employeeProfiles.filter((profile) => profile.role === "employee").length;
  els.hrRecordCount.textContent = hrRows.length;
  els.hrLeaveCount.textContent = formatLeaveNumber(leaveRows.reduce((sum, item) => sum + getLeaveDays(item.record), 0));
  els.hrHourCount.textContent = formatHours(totalHours);
  renderAccountTable();
  renderHrRecordsTable(hrRows);
}

function renderAccountTable() {
  els.accountTable.innerHTML = "";
  employeeProfiles.forEach((profile) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(profile.employee_id)}</td>
      <td>${escapeHtml(profile.full_name)}</td>
      <td>${profile.role === "hr" ? "HR" : "員工"}</td>
      <td>${profile.is_active ? "啟用" : "停用"}</td>
    `;
    row.addEventListener("click", () => fillEmployeeAdminForm(profile));
    els.accountTable.append(row);
  });
}

function fillEmployeeAdminForm(profile) {
  els.adminEmployeeId.value = profile.employee_id;
  els.adminFullName.value = profile.full_name;
  els.adminRole.value = profile.role;
  els.adminIsActive.value = String(Boolean(profile.is_active));
  els.adminPassword.value = "";
  els.employeeAdminStatus.textContent = `${profile.employee_id} 已帶入表單，可更新姓名、角色、狀態或重設密碼。`;
}

async function saveEmployeeAccount(event) {
  event.preventDefault();
  if (!isHr()) return;

  const employeeId = normalizeEmployeeId(els.adminEmployeeId.value);
  const payload = {
    employeeId,
    fullName: els.adminFullName.value.trim(),
    role: els.adminRole.value,
    password: els.adminPassword.value.trim(),
    isActive: els.adminIsActive.value === "true",
  };

  if (!payload.employeeId || !payload.fullName) {
    els.employeeAdminStatus.textContent = "請輸入工號與姓名";
    return;
  }

  if (!employeeProfiles.some((profile) => profile.employee_id === employeeId) && payload.password.length < 8) {
    els.employeeAdminStatus.textContent = "新增員工需要至少 8 碼初始密碼";
    return;
  }

  els.employeeAdminStatus.textContent = "儲存中...";
  const { error } = await supabaseClient.functions.invoke("admin-upsert-employee", { body: payload });
  if (error) {
    els.employeeAdminStatus.textContent = `儲存失敗：${error.message}`;
    return;
  }

  els.employeeAdminStatus.textContent = `${employeeId} 已儲存`;
  els.employeeAdminForm.reset();
  await updateMonth(selectedMonth);
}

function renderHrRecordsTable(rows) {
  els.hrRecordsTable.innerHTML = "";
  els.emptyHrRecords.classList.toggle("is-visible", rows.length === 0);
  rows.sort((a, b) => `${a.record.date}${a.account.id}`.localeCompare(`${b.record.date}${b.account.id}`)).forEach(({ account, record }) => {
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

function exportCsv() {
  const rows = [
    ["日期", "類型", "上班", "下班", "工時", "上班定位距離", "下班定位距離", "請假天數", "備註"],
    ...getMonthRecords().map((record) => csvRecord(record)),
  ];
  downloadCsv(rows, `打卡紀錄-${selectedMonth}.csv`);
}

function exportAllCsv() {
  if (!isHr()) return;
  const rows = [
    ["工號", "姓名", "日期", "類型", "上班", "下班", "工時", "上班定位距離", "下班定位距離", "請假天數", "備註"],
    ...hrRows.map(({ account, record }) => [account.id, account.name, ...csvRecord(record)]),
  ];
  downloadCsv(rows, `HR彙整紀錄-${selectedMonth}.csv`);
}

function csvRecord(record) {
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
}

function recordFromRow(row) {
  return {
    id: row.id,
    date: row.record_date,
    type: row.record_type,
    startTime: formatTime(row.start_time),
    endTime: formatTime(row.end_time),
    breakMinutes: Number(row.break_minutes) || 0,
    leaveDays: Number(row.leave_days) || 0,
    leavePeriod: row.leave_period || "",
    note: row.note || "",
    clockInLocation: row.clock_in_lat == null ? null : {
      latitude: Number(row.clock_in_lat),
      longitude: Number(row.clock_in_lng),
      accuracy: Number(row.clock_in_accuracy) || 0,
      distanceMeters: Number(row.clock_in_distance) || 0,
      capturedAt: row.clock_in_captured_at,
    },
    clockOutLocation: row.clock_out_lat == null ? null : {
      latitude: Number(row.clock_out_lat),
      longitude: Number(row.clock_out_lng),
      accuracy: Number(row.clock_out_accuracy) || 0,
      distanceMeters: Number(row.clock_out_distance) || 0,
      capturedAt: row.clock_out_captured_at,
    },
  };
}

function worksiteFromRow(row) {
  return {
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusMeters: Number(row.radius_meters),
  };
}

function locationPayload(direction, location) {
  const prefix = direction === "in" ? "clock_in" : "clock_out";
  return {
    [`${prefix}_lat`]: location.latitude,
    [`${prefix}_lng`]: location.longitude,
    [`${prefix}_accuracy`]: location.accuracy,
    [`${prefix}_distance`]: location.distanceMeters,
    [`${prefix}_captured_at`]: location.capturedAt,
  };
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

function calculateRecord(record) {
  if (record.type !== "work" || !record.startTime || !record.endTime) return { hours: 0 };
  const start = parseMinutes(record.startTime);
  let end = parseMinutes(record.endTime);
  if (end < start) end += 24 * 60;
  const minutes = Math.max(end - start - (Number(record.breakMinutes) || 0), 0);
  return { hours: roundToQuarter(minutes / 60) };
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

function isHr() {
  return currentProfile?.role === "hr";
}

function normalizeEmployeeId(value) {
  return value.trim().toUpperCase();
}

function employeeIdToEmail(employeeId) {
  return `${employeeId.toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}

function monthBounds(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);
  return [`${monthKey(start)}-01`, `${monthKey(end)}-${padDate(end.getDate())}`];
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

function sortRecords(a, b) {
  return `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`);
}

function parseMinutes(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function roundToQuarter(value) {
  return Math.round(value * 4) / 4;
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "";
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

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function embeddedMapUrl(location) {
  const query = encodeURIComponent(`${location.latitude},${location.longitude}`);
  return `https://maps.google.com/maps?q=${query}&z=18&output=embed`;
}

function externalMapUrl(location) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
