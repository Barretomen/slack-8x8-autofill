const BADGE_STYLES = {
  ok: { text: "OK", color: "#157347" },
  old: { text: "OLD", color: "#b45309" },
  missing: { text: "!", color: "#b42318" },
  empty: { text: "", color: "#6b7280" }
};

function setBadge(status) {
  const style = BADGE_STYLES[status] || BADGE_STYLES.empty;

  chrome.action.setBadgeText({ text: style.text });
  chrome.action.setBadgeBackgroundColor({ color: style.color });
}

chrome.runtime.onInstalled.addListener(() => {
  setBadge("empty");
  console.log("Slack Autofill installed");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "updateBadge") {
    setBadge(message.status);
  }
});
