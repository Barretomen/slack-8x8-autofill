console.log("content-company.js loaded");

const DATA_TTL_MS = 15 * 60 * 1000;
const BACKOFFICE_PANEL_ID = "backoffice-autofill-panel";
const BACKOFFICE_PANEL_COLLAPSED_KEY = "backofficePanelCollapsed";

let panelRefreshTimer = null;

function formatAge(extractedAt) {
  if (!extractedAt) return "No data yet";

  const timestamp = new Date(extractedAt).getTime();
  if (Number.isNaN(timestamp)) return "Unknown";

  const ageMs = Date.now() - timestamp;
  if (ageMs < 0) return "Just now";

  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes === 1) return "1 min ago";

  return `${minutes} mins ago`;
}

function isExpired(data) {
  if (!data?.extractedAt) return true;

  const timestamp = new Date(data.extractedAt).getTime();
  if (Number.isNaN(timestamp)) return true;

  return Date.now() - timestamp > DATA_TTL_MS;
}

function getDataStatus(data) {
  if (!data) return "empty";
  if (isExpired(data)) return "old";
  if (data.orderId && !data.driverId) return "missing";

  return "ok";
}

function updateExtensionBadge(data) {
  chrome.runtime.sendMessage({
    type: "updateBadge",
    status: getDataStatus(data)
  });
}

function getOrderIdFromUrl() {
  const path = window.location.pathname;

  if (path.includes("/orders/")) {
    return path.split("/orders/")[1].replace("#", "");
  }

  return "";
}

function getDriverIdFromUrl() {
  const path = window.location.pathname;

  if (path.includes("/users/")) {
    return path.split("/users/")[1].replace("#", "");
  }

  return "";
}

function createPanelRow(labelText) {
  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "82px 1fr";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginTop = "7px";

  const label = document.createElement("div");
  label.innerText = labelText;
  label.style.color = "rgba(255,255,255,0.58)";
  label.style.fontSize = "11px";
  label.style.fontWeight = "700";
  label.style.textTransform = "uppercase";

  const value = document.createElement("div");
  value.style.color = "white";
  value.style.fontSize = "12px";
  value.style.fontWeight = "700";
  value.style.overflow = "hidden";
  value.style.textOverflow = "ellipsis";
  value.style.whiteSpace = "nowrap";

  row.appendChild(label);
  row.appendChild(value);

  return { row, value };
}

function setText(row, value) {
  if (!row) return;
  row.textContent = value || "-";
}

function addFloatingPanel() {
  if (document.getElementById(BACKOFFICE_PANEL_ID)) return;

  const panel = document.createElement("div");
  panel.id = BACKOFFICE_PANEL_ID;
  panel.style.position = "fixed";
  panel.style.top = "16px";
  panel.style.right = "16px";
  panel.style.zIndex = "999998";
  panel.style.width = "286px";
  panel.style.boxSizing = "border-box";
  panel.style.padding = "14px";
  panel.style.borderRadius = "8px";
  panel.style.background = "rgba(30,31,34,0.94)";
  panel.style.backdropFilter = "blur(6px)";
  panel.style.border = "1px solid rgba(255,255,255,0.14)";
  panel.style.boxShadow = "0 18px 40px rgba(0,0,0,0.24)";
  panel.style.fontFamily = "Arial, sans-serif";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "10px";

  const title = document.createElement("div");
  title.innerText = "Backoffice Capture";
  title.style.color = "white";
  title.style.fontSize = "14px";
  title.style.fontWeight = "800";
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  title.style.whiteSpace = "nowrap";

  const status = document.createElement("div");
  status.dataset.role = "status";
  status.style.padding = "4px 7px";
  status.style.borderRadius = "999px";
  status.style.fontSize = "11px";
  status.style.fontWeight = "800";

  const toggleButton = document.createElement("button");
  toggleButton.dataset.role = "toggle";
  toggleButton.innerText = "-";
  toggleButton.setAttribute("aria-label", "Collapse capture panel");
  toggleButton.style.width = "28px";
  toggleButton.style.height = "28px";
  toggleButton.style.flex = "0 0 28px";
  toggleButton.style.border = "1px solid rgba(255,255,255,0.16)";
  toggleButton.style.borderRadius = "8px";
  toggleButton.style.background = "rgba(255,255,255,0.08)";
  toggleButton.style.color = "white";
  toggleButton.style.fontSize = "18px";
  toggleButton.style.fontWeight = "800";
  toggleButton.style.lineHeight = "22px";
  toggleButton.style.cursor = "pointer";
  toggleButton.onclick = async () => {
    const nextCollapsed = panel.dataset.collapsed !== "true";

    await chrome.storage.local.set({
      [BACKOFFICE_PANEL_COLLAPSED_KEY]: nextCollapsed
    });

    setPanelCollapsed(nextCollapsed);
  };

  header.appendChild(title);
  header.appendChild(status);
  header.appendChild(toggleButton);
  panel.appendChild(header);

  const details = document.createElement("div");
  details.dataset.role = "details";

  const rows = {
    order: createPanelRow("Order"),
    driver: createPanelRow("Driver"),
    mfc: createPanelRow("MFC"),
    age: createPanelRow("Age")
  };

  Object.values(rows).forEach(({ row }) => details.appendChild(row));

  rows.order.value.dataset.role = "order";
  rows.driver.value.dataset.role = "driver";
  rows.mfc.value.dataset.role = "mfc";
  rows.age.value.dataset.role = "age";

  const clearButton = document.createElement("button");
  clearButton.innerText = "Clear data";
  clearButton.style.width = "100%";
  clearButton.style.height = "34px";
  clearButton.style.marginTop = "12px";
  clearButton.style.border = "1px solid rgba(255,255,255,0.16)";
  clearButton.style.borderRadius = "8px";
  clearButton.style.background = "rgba(180,35,24,0.82)";
  clearButton.style.color = "white";
  clearButton.style.fontSize = "13px";
  clearButton.style.fontWeight = "800";
  clearButton.style.cursor = "pointer";
  clearButton.onclick = async () => {
    await chrome.storage.local.remove("autofillData");
    updateExtensionBadge(null);
    refreshPanel();
  };

  details.appendChild(clearButton);

  panel.appendChild(details);
  document.body.appendChild(panel);

  refreshPanel();
  applyStoredPanelState();

  if (!panelRefreshTimer) {
    panelRefreshTimer = setInterval(refreshPanel, 30000);
  }
}

async function applyStoredPanelState() {
  const result = await chrome.storage.local.get(BACKOFFICE_PANEL_COLLAPSED_KEY);
  setPanelCollapsed(Boolean(result[BACKOFFICE_PANEL_COLLAPSED_KEY]));
}

function setPanelCollapsed(collapsed) {
  const panel = document.getElementById(BACKOFFICE_PANEL_ID);
  if (!panel) return;

  const details = panel.querySelector('[data-role="details"]');
  const toggle = panel.querySelector('[data-role="toggle"]');

  panel.dataset.collapsed = collapsed ? "true" : "false";
  panel.style.width = collapsed ? "246px" : "286px";
  panel.style.padding = collapsed ? "10px 12px" : "14px";

  if (details) {
    details.style.display = collapsed ? "none" : "block";
  }

  if (toggle) {
    toggle.innerText = collapsed ? "+" : "-";
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Expand capture panel" : "Collapse capture panel"
    );
  }
}

async function refreshPanel() {
  const panel = document.getElementById(BACKOFFICE_PANEL_ID);
  if (!panel) return;

  const result = await chrome.storage.local.get("autofillData");
  const data = result.autofillData || null;
  const dataStatus = getDataStatus(data);
  const status = panel.querySelector('[data-role="status"]');

  updateExtensionBadge(data);

  if (dataStatus === "ok") {
    status.innerText = "Captured";
    status.style.color = "#ecfdf3";
    status.style.background = "#157347";
  } else if (dataStatus === "missing") {
    status.innerText = "Missing Driver";
    status.style.color = "#fff1f2";
    status.style.background = "#b42318";
  } else if (dataStatus === "old") {
    status.innerText = "Expired";
    status.style.color = "#fff7ed";
    status.style.background = "#b45309";
  } else {
    status.innerText = "Waiting";
    status.style.color = "#fff7ed";
    status.style.background = "#b45309";
  }

  setText(panel.querySelector('[data-role="order"]'), data?.orderId);
  setText(panel.querySelector('[data-role="driver"]'), data?.driverId);
  setText(panel.querySelector('[data-role="mfc"]'), data?.mfcId);
  setText(panel.querySelector('[data-role="age"]'), formatAge(data?.extractedAt));
}

async function saveData(newData) {
  const current = await chrome.storage.local.get("autofillData");
  const currentData = current.autofillData || {};
  const isNewOrder =
    Boolean(newData.orderId) &&
    Boolean(currentData.orderId) &&
    newData.orderId !== currentData.orderId;

  const mergedData = {
    ...currentData,
    ...newData,
    driverId: isNewOrder ? "" : (newData.driverId ?? currentData.driverId ?? ""),
    extractedAt: new Date().toISOString()
  };

  chrome.storage.local.set(
    { autofillData: mergedData },
    () => {
      console.log("Data saved:", mergedData);
      refreshPanel();
    }
  );
}

function extractOrderData() {
  const orderId = getOrderIdFromUrl();

  if (!orderId) return;

  const body = document.body.innerText;

  const customerIdMatch =
    body.match(/Customer ID\s*(\d+)/i);

  const cancelReasonMatch =
    body.match(/Secondary Cancel Reason\s*([^\n]+)/i);

  const deliveryZoneMatch =
    body.match(/Delivery Zone\s*\n\s*([A-Z]{3}_[A-Za-z]+_\d{4})/i);

  const customerId =
    customerIdMatch?.[1] || "";

  const cancelReason =
    cancelReasonMatch?.[1] || "";

  const deliveryZone =
    deliveryZoneMatch?.[1] || "";

  saveData({
    orderId,
    customerId,
    cancelReason,
    mfcId: deliveryZone
  });
}

function extractDriverData() {
  const driverId = getDriverIdFromUrl();

  if (!driverId) return;

  saveData({
    driverId
  });

  console.log("Driver ID extracted:", driverId);
}

addFloatingPanel();
setTimeout(addFloatingPanel, 1000);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.autofillData) {
    refreshPanel();
  }
});

let tries = 0;

const interval = setInterval(() => {
  extractOrderData();
  extractDriverData();

  tries++;

  const text = document.body.innerText;

  if (
    text.includes("Delivery Zone") ||
    window.location.pathname.includes("/users/") ||
    tries >= 10
  ) {
    clearInterval(interval);
  }
}, 500);
