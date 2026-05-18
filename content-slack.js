console.log("content-slack.js loaded");

const DATA_TTL_MS = 15 * 60 * 1000;
const PANEL_ID = "slack-autofill-panel";
const TOAST_ID = "slack-autofill-toast";
const PANEL_COLLAPSED_KEY = "panelCollapsed";
const DP_ISSUE_PRESETS = [
  "DP couldn't access/locate CX",
  "DP incident/accident",
  "Wrong address",
  "Pin Code Issue",
  "CX changed mind"
];
const ACTION_TAKEN_PRESETS = [
  "Order Completed",
  "Order Cancelled",
  "None",
  "Other"
];

let accountModalOpen = false;
let alreadyFilled = false;
let autofillInProgress = false;
let autofillScheduled = false;
let panelRefreshTimer = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetAutofillState() {
  alreadyFilled = false;
  autofillScheduled = false;
  autofillInProgress = false;
}

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

function showToast(message, type = "info") {
  let toast = document.getElementById(TOAST_ID);

  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.style.position = "fixed";
    toast.style.right = "16px";
    toast.style.bottom = "20px";
    toast.style.zIndex = "999999";
    toast.style.maxWidth = "320px";
    toast.style.padding = "12px 14px";
    toast.style.borderRadius = "8px";
    toast.style.color = "white";
    toast.style.fontFamily = "Slack-Lato, Arial, sans-serif";
    toast.style.fontSize = "13px";
    toast.style.fontWeight = "700";
    toast.style.boxShadow = "0 12px 30px rgba(0,0,0,0.28)";
    toast.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    document.body.appendChild(toast);
  }

  const colors = {
    success: "#157347",
    warning: "#b45309",
    error: "#b42318",
    info: "#2b6de0"
  };

  toast.innerText = message;
  toast.style.background = colors[type] || colors.info;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  clearTimeout(toast.hideTimer);
  toast.hideTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 1200);
}

async function readStoredState() {
  const result = await chrome.storage.local.get(["autofillData", "selectedAccount"]);

  return {
    data: result.autofillData || null,
    selectedAccount: result.selectedAccount || ""
  };
}

async function getAutofillData() {
  const { data } = await readStoredState();

  if (!data) {
    showToast("No captured data found.", "warning");
    return null;
  }

  if (isExpired(data)) {
    showToast("Captured data expired. Open the order or driver page again.", "warning");
    return null;
  }

  return data;
}

function setText(row, value) {
  row.textContent = value || "-";
}

function createPanelRow(labelText) {
  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "72px 1fr";
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

function addFloatingPanel() {
  if (document.getElementById(PANEL_ID)) return;

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.position = "fixed";
  panel.style.top = "46px";
  panel.style.right = "16px";
  panel.style.zIndex = "999998";
  panel.style.width = "268px";
  panel.style.boxSizing = "border-box";
  panel.style.padding = "14px";
  panel.style.borderRadius = "8px";
  panel.style.background = "rgba(30,31,34,0.94)";
  panel.style.backdropFilter = "blur(6px)";
  panel.style.border = "1px solid rgba(255,255,255,0.14)";
  panel.style.boxShadow = "0 18px 40px rgba(0,0,0,0.24)";
  panel.style.fontFamily = "Slack-Lato, Arial, sans-serif";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "10px";

  const title = document.createElement("div");
  title.innerText = "Slack Autofill";
  title.dataset.role = "title";
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
  toggleButton.setAttribute("aria-label", "Collapse autofill panel");
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

    await chrome.storage.local.set({ [PANEL_COLLAPSED_KEY]: nextCollapsed });
    setPanelCollapsed(nextCollapsed);
  };

  header.appendChild(title);
  header.appendChild(status);
  header.appendChild(toggleButton);
  panel.appendChild(header);

  const details = document.createElement("div");
  details.dataset.role = "details";

  const rows = {
    account: createPanelRow("Account"),
    order: createPanelRow("Order"),
    driver: createPanelRow("Driver"),
    mfc: createPanelRow("MFC"),
    age: createPanelRow("Age")
  };

  Object.values(rows).forEach(({ row }) => details.appendChild(row));

  const actions = document.createElement("div");
  actions.dataset.role = "actions";
  actions.style.display = "grid";
  actions.style.gridTemplateColumns = "1fr 1fr";
  actions.style.gap = "8px";
  actions.style.marginTop = "12px";

  const refillButton = document.createElement("button");
  refillButton.innerText = "Refill";
  refillButton.style.height = "34px";
  refillButton.style.border = "none";
  refillButton.style.borderRadius = "8px";
  refillButton.style.background = "#2b6de0";
  refillButton.style.color = "white";
  refillButton.style.fontSize = "13px";
  refillButton.style.fontWeight = "800";
  refillButton.style.cursor = "pointer";
  refillButton.onclick = async () => {
    refillButton.disabled = true;
    refillButton.style.opacity = "0.7";

    try {
      showToast("Refill started.", "info");
      await fillSlackForm({ manual: true });
    } finally {
      refillButton.disabled = false;
      refillButton.style.opacity = "1";
    }
  };

  const accountButton = document.createElement("button");
  accountButton.innerText = "Account";
  accountButton.style.height = "34px";
  accountButton.style.border = "1px solid rgba(255,255,255,0.16)";
  accountButton.style.borderRadius = "8px";
  accountButton.style.background = "rgba(255,255,255,0.1)";
  accountButton.style.color = "white";
  accountButton.style.fontSize = "13px";
  accountButton.style.fontWeight = "800";
  accountButton.style.cursor = "pointer";
  accountButton.onclick = async () => {
    await chrome.storage.local.remove("selectedAccount");
    showToast("Choose the account again.", "info");
    await getSelectedAccount();
    refreshPanel();
  };

  const clearButton = document.createElement("button");
  clearButton.innerText = "Clear data";
  clearButton.style.height = "34px";
  clearButton.style.border = "1px solid rgba(255,255,255,0.16)";
  clearButton.style.borderRadius = "8px";
  clearButton.style.background = "rgba(180,35,24,0.82)";
  clearButton.style.color = "white";
  clearButton.style.fontSize = "13px";
  clearButton.style.fontWeight = "800";
  clearButton.style.cursor = "pointer";
  clearButton.style.gridColumn = "1 / -1";
  clearButton.onclick = async () => {
    await chrome.storage.local.remove("autofillData");
    updateExtensionBadge(null);
    showToast("Captured order data cleared.", "success");
    refreshPanel();
  };

  actions.appendChild(refillButton);
  actions.appendChild(accountButton);
  actions.appendChild(clearButton);
  details.appendChild(actions);

  const dpIssueSection = document.createElement("div");
  dpIssueSection.style.marginTop = "12px";
  dpIssueSection.style.paddingTop = "10px";
  dpIssueSection.style.borderTop = "1px solid rgba(255,255,255,0.12)";

  const dpIssueTitle = document.createElement("div");
  dpIssueTitle.innerText = "DP Issue";
  dpIssueTitle.style.color = "rgba(255,255,255,0.58)";
  dpIssueTitle.style.fontSize = "11px";
  dpIssueTitle.style.fontWeight = "800";
  dpIssueTitle.style.textTransform = "uppercase";
  dpIssueTitle.style.marginBottom = "8px";
  dpIssueSection.appendChild(dpIssueTitle);

  DP_ISSUE_PRESETS.forEach((issue) => {
    const issueButton = document.createElement("button");
    issueButton.innerText = issue;
    issueButton.title = issue;
    issueButton.style.width = "100%";
    issueButton.style.minHeight = "30px";
    issueButton.style.marginBottom = "6px";
    issueButton.style.padding = "6px 8px";
    issueButton.style.border = "1px solid rgba(255,255,255,0.16)";
    issueButton.style.borderRadius = "8px";
    issueButton.style.background = "rgba(255,255,255,0.08)";
    issueButton.style.color = "white";
    issueButton.style.fontSize = "12px";
    issueButton.style.fontWeight = "700";
    issueButton.style.textAlign = "left";
    issueButton.style.cursor = "pointer";
    issueButton.style.overflow = "hidden";
    issueButton.style.textOverflow = "ellipsis";
    issueButton.style.whiteSpace = "nowrap";
    issueButton.onclick = async () => {
      const selected = await selectDropdownByLabel("DP Issue", issue, { typeValue: true });

      if (selected) {
        showToast(`DP Issue selected: ${issue}`, "success");
      }
    };

    dpIssueSection.appendChild(issueButton);
  });

  details.appendChild(dpIssueSection);

  const actionTakenSection = document.createElement("div");
  actionTakenSection.style.marginTop = "12px";
  actionTakenSection.style.paddingTop = "10px";
  actionTakenSection.style.borderTop = "1px solid rgba(255,255,255,0.12)";

  const actionTakenTitle = document.createElement("div");
  actionTakenTitle.innerText = "Action Taken";
  actionTakenTitle.style.color = "rgba(255,255,255,0.58)";
  actionTakenTitle.style.fontSize = "11px";
  actionTakenTitle.style.fontWeight = "800";
  actionTakenTitle.style.textTransform = "uppercase";
  actionTakenTitle.style.marginBottom = "8px";
  actionTakenSection.appendChild(actionTakenTitle);

  ACTION_TAKEN_PRESETS.forEach((action) => {
    const actionButton = document.createElement("button");
    actionButton.innerText = action;
    actionButton.title = action;
    actionButton.style.width = "100%";
    actionButton.style.minHeight = "30px";
    actionButton.style.marginBottom = "6px";
    actionButton.style.padding = "6px 8px";
    actionButton.style.border = "1px solid rgba(255,255,255,0.16)";
    actionButton.style.borderRadius = "8px";
    actionButton.style.background = "rgba(255,255,255,0.08)";
    actionButton.style.color = "white";
    actionButton.style.fontSize = "12px";
    actionButton.style.fontWeight = "700";
    actionButton.style.textAlign = "left";
    actionButton.style.cursor = "pointer";
    actionButton.style.overflow = "hidden";
    actionButton.style.textOverflow = "ellipsis";
    actionButton.style.whiteSpace = "nowrap";
    actionButton.onclick = async () => {
      const selected = await selectDropdownByLabel("Action Taken", action, { typeValue: true });

      if (selected) {
        showToast(`Action Taken selected: ${action}`, "success");
      }
    };

    actionTakenSection.appendChild(actionButton);
  });

  details.appendChild(actionTakenSection);
  panel.appendChild(details);

  rows.account.value.dataset.role = "account";
  rows.order.value.dataset.role = "order";
  rows.driver.value.dataset.role = "driver";
  rows.mfc.value.dataset.role = "mfc";
  rows.age.value.dataset.role = "age";

  document.body.appendChild(panel);
  refreshPanel();
  applyStoredPanelState();

  if (!panelRefreshTimer) {
    panelRefreshTimer = setInterval(refreshPanel, 30000);
  }
}

async function applyStoredPanelState() {
  const result = await chrome.storage.local.get(PANEL_COLLAPSED_KEY);
  setPanelCollapsed(Boolean(result[PANEL_COLLAPSED_KEY]));
}

function setPanelCollapsed(collapsed) {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  const details = panel.querySelector('[data-role="details"]');
  const toggle = panel.querySelector('[data-role="toggle"]');

  panel.dataset.collapsed = collapsed ? "true" : "false";
  panel.style.width = collapsed ? "230px" : "268px";
  panel.style.padding = collapsed ? "10px 12px" : "14px";

  if (details) {
    details.style.display = collapsed ? "none" : "block";
  }

  if (toggle) {
    toggle.innerText = collapsed ? "+" : "-";
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Expand autofill panel" : "Collapse autofill panel"
    );
  }
}

async function refreshPanel() {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;

  const { data, selectedAccount } = await readStoredState();
  const dataStatus = getDataStatus(data);
  const status = panel.querySelector('[data-role="status"]');

  updateExtensionBadge(data);

  if (dataStatus === "old" || dataStatus === "empty") {
    status.innerText = data ? "Expired" : "Empty";
    status.style.color = "#fff7ed";
    status.style.background = "#b45309";
  } else if (dataStatus === "missing") {
    status.innerText = "Missing Driver";
    status.style.color = "#fff1f2";
    status.style.background = "#b42318";
  } else {
    status.innerText = "Ready";
    status.style.color = "#ecfdf3";
    status.style.background = "#157347";
  }

  setText(panel.querySelector('[data-role="account"]'), selectedAccount);
  setText(panel.querySelector('[data-role="order"]'), data?.orderId);
  setText(panel.querySelector('[data-role="driver"]'), data?.driverId);
  setText(panel.querySelector('[data-role="mfc"]'), data?.mfcId);
  setText(panel.querySelector('[data-role="age"]'), formatAge(data?.extractedAt));
}

async function getSelectedAccount() {
  const result = await chrome.storage.local.get("selectedAccount");

  if (result.selectedAccount) {
    return result.selectedAccount;
  }

  if (accountModalOpen) {
    return null;
  }

  accountModalOpen = true;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const modal = document.createElement("div");
    modal.style.background = "#1e1f22";
    modal.style.padding = "24px";
    modal.style.borderRadius = "14px";
    modal.style.width = "320px";
    modal.style.boxShadow = "0 0 25px rgba(0,0,0,0.5)";
    modal.style.fontFamily = "Slack-Lato, Arial, sans-serif";
    modal.style.color = "white";
    modal.style.position = "relative";

    const closeButton = document.createElement("button");
    closeButton.innerText = "X";
    closeButton.setAttribute("aria-label", "Close account selector");
    closeButton.style.position = "absolute";
    closeButton.style.top = "12px";
    closeButton.style.right = "12px";
    closeButton.style.width = "28px";
    closeButton.style.height = "28px";
    closeButton.style.border = "1px solid rgba(255,255,255,0.16)";
    closeButton.style.borderRadius = "999px";
    closeButton.style.background = "rgba(255,255,255,0.08)";
    closeButton.style.color = "white";
    closeButton.style.fontSize = "16px";
    closeButton.style.fontWeight = "800";
    closeButton.style.lineHeight = "24px";
    closeButton.style.cursor = "pointer";
    closeButton.onclick = () => {
      overlay.remove();
      accountModalOpen = false;
      resolve(null);
    };
    modal.appendChild(closeButton);

    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("Gopufflogo.png");
    logo.style.width = "110px";
    logo.style.display = "block";
    logo.style.margin = "0 auto 18px auto";
    modal.appendChild(logo);

    const title = document.createElement("div");
    title.innerText = "Select your account";
    title.style.fontSize = "20px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "18px";
    modal.appendChild(title);

    function createButton(accountName) {
      const button = document.createElement("button");
      button.innerText = accountName;
      button.style.width = "100%";
      button.style.padding = "12px";
      button.style.marginBottom = "12px";
      button.style.border = "none";
      button.style.borderRadius = "10px";
      button.style.background = "#2b6de0";
      button.style.color = "white";
      button.style.fontSize = "15px";
      button.style.fontWeight = "600";
      button.style.cursor = "pointer";
      button.style.transition = "0.2s";

      button.onmouseenter = () => {
        button.style.background = "#3b82f6";
      };

      button.onmouseleave = () => {
        button.style.background = "#2b6de0";
      };

      button.onclick = async () => {
        await chrome.storage.local.set({ selectedAccount: accountName });
        overlay.remove();
        accountModalOpen = false;
        showToast(`Account selected: ${accountName}`, "success");
        refreshPanel();
        resolve(accountName);
      };

      return button;
    }

    modal.appendChild(createButton("Account 1"));
    modal.appendChild(createButton("Account 2"));
    modal.appendChild(createButton("Account 3"));

    const footer = document.createElement("div");
    footer.innerText = "Developed by Joao Barreto";
    footer.style.marginTop = "18px";
    footer.style.fontSize = "12px";
    footer.style.color = "rgba(255,255,255,0.45)";
    footer.style.textAlign = "left";
    footer.style.fontFamily = "Slack-Lato, Arial, sans-serif";
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  });
}

function setReactInputValue(input, value) {
  input.focus();

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  ).set;

  nativeSetter.call(input, value || "");

  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType: "insertText",
    data: value || ""
  }));

  input.dispatchEvent(new Event("change", { bubbles: true }));

  input.blur();
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

async function waitForDropdowns() {
  for (let i = 0; i < 12; i++) {
    const dropdowns = document.querySelectorAll('input[placeholder="Select an option"]');

    if (dropdowns.length >= 4) return dropdowns;

    await wait(80);
  }

  return document.querySelectorAll('input[placeholder="Select an option"]');
}

async function waitForNumberInputs() {
  for (let i = 0; i < 12; i++) {
    const inputs = document.querySelectorAll('input[placeholder="Enter a number"]');

    if (inputs.length >= 2) return inputs;

    await wait(80);
  }

  return document.querySelectorAll('input[placeholder="Enter a number"]');
}

function isCallLogFormOpen() {
  const hasVisibleTitle = Array.from(document.querySelectorAll("h1, h2, h3, div, span"))
    .some((element) => {
      if (isExtensionElement(element) || !isVisible(element)) return false;

      return element.innerText?.trim() === "8x8 Call Log";
    });

  const hasVisibleAccount = Boolean(findLabelElement("Account Being Used"));
  const hasVisibleMfc = Boolean(findLabelElement("MFC ID"));
  const hasVisibleOrder = Boolean(findLabelElement("Order ID"));
  const hasVisibleDriver = Boolean(findLabelElement("Driver ID"));
  const hasVisibleCoreFields =
    hasVisibleAccount &&
    hasVisibleMfc &&
    hasVisibleOrder &&
    hasVisibleDriver;

  const hasDropdowns = Array.from(document.querySelectorAll('input[placeholder="Select an option"]'))
    .filter((input) => !isExtensionElement(input) && isVisible(input))
    .length >= 2;

  const hasNumberInputs = Array.from(document.querySelectorAll('input[placeholder="Enter a number"]'))
    .filter((input) => !isExtensionElement(input) && isVisible(input))
    .length >= 2;

  return hasVisibleTitle || hasVisibleCoreFields || (hasDropdowns && hasNumberInputs);
}

async function waitForCallLogFormReady() {
  for (let i = 0; i < 24; i++) {
    const hasAccount = Boolean(findLabelElement("Account Being Used"));
    const hasMfc = Boolean(findLabelElement("MFC ID"));
    const hasOrder = Boolean(findLabelElement("Order ID"));
    const hasDriver = Boolean(findLabelElement("Driver ID"));

    if (hasAccount && hasMfc && hasOrder && hasDriver) {
      return true;
    }

    await wait(60);
  }

  return false;
}

function isExtensionElement(element) {
  return Boolean(
    element.closest(`#${PANEL_ID}`) ||
    element.closest(`#${TOAST_ID}`)
  );
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function findLabelElement(labelText) {
  const elements = Array.from(document.querySelectorAll("label, div, span, p"));

  return elements.find((element) => {
    if (isExtensionElement(element) || !isVisible(element)) return false;

    return element.innerText?.trim() === labelText;
  });
}

function findControlAfterLabel(labelText, predicate) {
  const label = findLabelElement(labelText);
  if (!label) return null;

  const controls = Array.from(document.querySelectorAll(
    'input, textarea, button, [role="combobox"], [aria-haspopup="listbox"]'
  ));

  return controls.find((control) => {
    if (isExtensionElement(control) || !isVisible(control)) return false;
    if (label.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_PRECEDING) return false;

    return predicate(control);
  }) || null;
}

function getControlValue(control) {
  return (control.value || control.innerText || control.textContent || "").trim();
}

async function waitForOption(optionText, timeoutMs = 1800) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const option = options.find((item) => item.innerText.trim() === optionText);

    if (option) {
      return option;
    }

    await wait(30);
  }

  return null;
}

async function selectDropdownByLabel(labelText, value, { typeValue = false } = {}) {
  const control = findControlAfterLabel(labelText, (element) => {
    if (element.tagName === "BUTTON") return element.innerText.trim() !== "Submit";
    if (element.getAttribute("role") === "combobox") return true;
    if (element.getAttribute("aria-haspopup") === "listbox") return true;

    return element.tagName === "INPUT" && element.placeholder !== "Enter a number";
  });

  if (!control) {
    showToast(`${labelText} field not found.`, "error");
    return false;
  }

  control.click();
  await wait(20);

  if (typeValue && control.tagName === "INPUT") {
    setReactInputValue(control, value);
    await wait(20);
  }

  const option = await waitForOption(value);

  if (option) {
    option.click();
    return true;
  }

  if (getControlValue(control) === value || document.body.innerText.includes(value)) {
    return true;
  }

  showToast(`${labelText} option not found: ${value}`, "error");
  return false;
}

function fillInputByLabel(labelText, value) {
  const input = findControlAfterLabel(labelText, (element) => {
    return element.tagName === "INPUT" || element.tagName === "TEXTAREA";
  });

  if (!input) {
    showToast(`${labelText} field not found.`, "error");
    return false;
  }

  setReactInputValue(input, "");
  setReactInputValue(input, value || "");
  return true;
}

async function selectAccount(dropdowns) {
  const accountDropdown = dropdowns[0];

  if (!accountDropdown) {
    showToast("Account field not found.", "error");
    return false;
  }

  const accountName = await getSelectedAccount();

  if (!accountName) {
    showToast("No account selected.", "warning");
    return false;
  }

  accountDropdown.click();
  await wait(20);

  const option = await waitForOption(accountName);

  if (option) {
    option.click();
    return true;
  }

  showToast(`Account not found: ${accountName}`, "error");
  return false;
}

async function selectMfc(dropdowns, mfcId) {
  const mfcDropdown = dropdowns[1];

  if (!mfcDropdown || !mfcId) {
    showToast("MFC field is missing.", "warning");
    return false;
  }

  mfcDropdown.click();
  await wait(20);

  setReactInputValue(mfcDropdown, mfcId);
  await wait(20);

  const mfcOption = await waitForOption(mfcId);

  if (mfcOption) {
    mfcOption.click();
    return true;
  }

  showToast(`MFC option not found: ${mfcId}`, "error");
  return false;
}

function validateData(data) {
  const missing = [];

  if (!data.orderId) missing.push("Order ID");
  if (!data.driverId) missing.push("Driver ID");
  if (!data.mfcId) missing.push("MFC");

  if (missing.length > 0) {
    showToast(`Missing data: ${missing.join(", ")}`, "warning");
    return false;
  }

  return true;
}

async function fillSlackForm({ manual = false } = {}) {
  if (autofillInProgress) return false;

  autofillInProgress = true;

  try {
  const data = await getAutofillData();

  if (!data) return false;
  if (!validateData(data)) return false;

  const modalOpen = isCallLogFormOpen();

  if (!modalOpen) {
    showToast("Open the 8x8 Call Log form first.", manual ? "warning" : "info");
    return false;
  }

  if (manual || await waitForCallLogFormReady()) {
    const accountName = await getSelectedAccount();

    if (!accountName) {
      showToast("No account selected.", "warning");
      return false;
    }

    const accountSelected = await selectDropdownByLabel("Account Being Used", accountName);
    if (!accountSelected) return false;

    await wait(40);

    const mfcSelected = await selectDropdownByLabel("MFC ID", data.mfcId, { typeValue: true });
    if (!mfcSelected) return false;

    await wait(30);

    const orderFilled = fillInputByLabel("Order ID", data.orderId);
    if (!orderFilled) return false;

    await wait(30);

    const driverFilled = fillInputByLabel("Driver ID", data.driverId);
    if (!driverFilled) return false;

    showToast(manual ? "Call log refilled." : "Call log filled.", "success");
    refreshPanel();
    return true;
  }

  const dropdowns = await waitForDropdowns();

  if (dropdowns.length < 2) {
    showToast("Form dropdowns were not found.", "error");
    return false;
  }

  const accountSelected = await selectAccount(dropdowns);
  if (!accountSelected) return false;

  await wait(40);

  const mfcSelected = await selectMfc(dropdowns, data.mfcId);
  if (!mfcSelected) return false;

  await wait(40);

  const numberInputs = await waitForNumberInputs();

  if (numberInputs.length < 2) {
    showToast("Order or Driver fields were not found.", "error");
    return false;
  }

  setReactInputValue(numberInputs[0], data.orderId || "");
  await wait(30);
  setReactInputValue(numberInputs[1], data.driverId || "");

  showToast("Call log filled.", "success");
  refreshPanel();
  return true;
  } finally {
    autofillInProgress = false;
  }
}

addFloatingPanel();
setTimeout(addFloatingPanel, 3000);

document.addEventListener("click", (event) => {
  const clicked = event.target.closest("button");
  if (!clicked || isExtensionElement(clicked)) return;

  const buttonText = clicked.innerText?.trim();
  const ariaLabel = clicked.getAttribute("aria-label") || "";
  const shouldReset =
    buttonText === "Submit" ||
    buttonText === "Close" ||
    ariaLabel.toLowerCase().includes("close");

  if (shouldReset) {
    setTimeout(resetAutofillState, 250);
  }
}, true);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.autofillData || changes.selectedAccount) {
    refreshPanel();
  }
});

const observer = new MutationObserver(() => {
  const modalOpen = isCallLogFormOpen();

  if (modalOpen && !alreadyFilled && !autofillInProgress && !autofillScheduled) {
    autofillScheduled = true;
    autofillInProgress = true;

    setTimeout(async () => {
      autofillInProgress = false;
      const filled = await fillSlackForm();

      if (filled) {
        alreadyFilled = true;
      }
    }, 50);
  }

  if (!modalOpen) {
    resetAutofillState();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
