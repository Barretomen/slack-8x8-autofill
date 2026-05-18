# Slack 8x8 Autofill

A Chrome extension that captures order and driver data from Gopuff Backoffice and quickly fills the Slack **8x8 Call Log** workflow.

## What It Does

This extension reduces manual copy/paste between Gopuff Backoffice and Slack.

It captures:

- Order ID
- Driver ID
- MFC ID / Delivery Zone

Then it uses those values to fill the Slack **8x8 Call Log** form.

It also provides quick buttons for common **DP Issue** and **Action Taken** selections.

## Install

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the `slack-autofill-extension` folder.
6. Pin the extension if you want to see the badge in the Chrome toolbar.

After any update, click **Reload** on the extension page and refresh open Slack or Backoffice tabs.

## Basic Workflow

1. Open the order page in Gopuff Backoffice.
2. Open the related driver/user page in Gopuff Backoffice.
3. Confirm the Backoffice panel shows the captured Order, Driver, and MFC.
4. Open Slack in the browser.
5. Open the **8x8 Call Log** workflow.
6. The extension fills the form automatically.
7. Select **DP Issue** and **Action Taken** from the Slack panel if needed.
8. Submit the workflow.

The extension is designed to fill every time a new **8x8 Call Log** modal is opened, even without refreshing Slack.

## Slack Panel

The Slack panel shows:

- Account
- Order
- Driver
- MFC
- Age

Main buttons:

- **Refill**: fills the current 8x8 form again.
- **Account**: changes the selected account.
- **Clear data**: clears the saved order data from browser storage.
- **- / +**: collapses or expands the panel.

Quick **DP Issue** buttons:

1. `DP couldn't access/locate CX`
2. `DP incident/accident`
3. `Wrong address`
4. `Pin Code Issue`
5. `CX changed mind`

Quick **Action Taken** buttons:

1. `Order Completed`
2. `Order Cancelled`
3. `None`
4. `Other`

Toast notifications are intentionally short so they do not block the Slack workflow.

## Backoffice Panel

The Backoffice panel shows:

- Order
- Driver
- MFC
- Age

It updates when data is captured and includes **Clear data** to reset the saved order information.

## Driver Safety

When a new Order ID is captured, the extension automatically clears the previous Driver ID.

This prevents an old driver from being used on a new order. After a new order is captured, the panel and badge show **Missing Driver** until the related driver/user page is opened.

## Extension Badge

The Chrome extension icon can show:

- **OK**: data is complete and ready.
- **!**: an order is saved, but Driver ID is missing.
- **OLD**: the saved data is expired.
- No badge: no order data is saved.

## Data Expiration

Captured data expires after **15 minutes**.

If data is expired, reopen the Backoffice order and driver pages to refresh the saved values.

## Account Selection

The extension asks which account to use the first time it fills Slack:

- Account 1
- Account 2
- Account 3

The selected account is saved locally. Use the **Account** button in the Slack panel to change it.

The account selector has an **X** button so it can be closed without selecting an account.

## Speed

The Slack autofill uses fast dropdown detection:

- It opens the dropdown.
- It checks for the target option repeatedly.
- It clicks as soon as the option appears.

This avoids long fixed delays while still allowing Slack time to render the workflow options.

## How It Works

The extension uses:

- `content-company.js` on Gopuff Backoffice.
- `content-slack.js` on Slack.
- `background.js` for the Chrome badge.
- `chrome.storage.local` for local browser storage.

Backoffice script:

1. Reads the Order ID from Backoffice order URLs.
2. Reads the Driver ID from Backoffice user URLs.
3. Extracts MFC ID from the page text.
4. Saves captured data locally.
5. Clears old Driver ID when a new Order ID is detected.
6. Updates the Backoffice panel and extension badge.

Slack script:

1. Reads saved data from local storage.
2. Detects the visible **8x8 Call Log** modal.
3. Selects the saved account.
4. Selects the saved MFC.
5. Fills Order ID and Driver ID.
6. Provides quick DP Issue and Action Taken buttons.
7. Resets after Submit or Close so the next modal can autofill again.

All captured data stays local in the browser.

## Troubleshooting

If the form does not fill:

1. Make sure you are using Slack in the browser, not the desktop app.
2. Make sure the **8x8 Call Log** modal is open.
3. Check that the Slack panel says **Ready**.
4. If it says **Missing Driver**, open the related driver/user page in Backoffice.
5. If it says **Expired**, reopen the Backoffice order and driver pages.
6. Click **Refill** after the form is open.

If the extension icon, badge, or panel does not update:

1. Go to `chrome://extensions`.
2. Click **Reload** on this extension.
3. Refresh Slack and Backoffice.

## Files

- `manifest.json`: extension configuration, permissions, icons, and scripts.
- `background.js`: controls the extension badge.
- `content-company.js`: captures data from Backoffice.
- `content-slack.js`: fills Slack and renders the Slack panel.
- `Gopufflogo.png`: logo used inside the extension UI.
- `icons/`: Chrome extension icon files.
- `assets/signature-joao-barreto.png`: green signature image for this README.

----------------------------------------------------

![Developed by Joao Barreto](assets/signature-joao-barreto.png)
