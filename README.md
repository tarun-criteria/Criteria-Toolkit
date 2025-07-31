# Criteria Toolkit Extension

A browser extension with tools for Criteria developers, including automatically closing VPN/authentication tabs and redirecting Frontend URLs.

## Features

- **Auto-close VPN Tab**: Automatically closes the local authentication tab (`http://127.0.0.1:35001/`) to streamline the development workflow.
- **Frontend URL Redirect**: Redirects Frontend to the local development environment.
- **Popup UI**: A simple popup allows you to toggle both the auto-close and redirect features on or off.
- **State Persistence**: Your preferences for the toggles are saved and restored across browser sessions.
- **Cross-browser Compatibility**: Works with Chrome and Edge.

## Usage

1. Click on the extension icon in your browser's toolbar to open the popup.
2. Use the toggles to enable or disable the "Auto Close" and "Redirect" features as needed.

## Installation Instructions

### Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner.
3. Click "Load unpacked".
4. Select the directory containing the extension files.
5. The extension is now installed and active.

### Edge

1. Open Edge and navigate to `edge://extensions/`.
2. Enable "Developer mode" using the toggle on the left sidebar.
3. Click "Load unpacked".
4. Select the directory containing the extension files.
5. The extension is now installed and active.