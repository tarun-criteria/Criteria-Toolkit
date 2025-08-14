/**
 * Criteria Toolkit - Popup Script
 * Handles the popup UI interactions and communicates with the background script
 */

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM elements
const autoCloseToggle = document.getElementById('autoClose');
const frontendRedirectToggle = document.getElementById('frontend-redirect-toggle');
const backendRedirectToggle = document.getElementById('backend-redirect-toggle');
const versionElement = document.querySelector('.version');

/**
 * Sends a message to the background script
 * @param {Object} message - The message to send
 * @returns {Promise} - Promise that resolves with the response
 */
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      browserAPI.runtime.sendMessage(message, response => {
        if (browserAPI.runtime.lastError) {
          reject(browserAPI.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Initializes the popup state from storage
 */
async function initializePopup() {
  try {
    const result = await browserAPI.storage.local.get(['autoClose', 'frontendRedirectEnabled', 'backendRedirectEnabled']);
    // Default autoClose to true if not set
    autoCloseToggle.checked = result.autoClose !== undefined ? result.autoClose : true;
    // Default redirect states to false if not set
    frontendRedirectToggle.checked = result.frontendRedirectEnabled || false;
  } catch (error) {
    console.error('Error initializing popup state from storage:', error);
  }
}

/**
 * Toggles the auto-close feature
 */
async function handleAutoCloseToggle(event) {
  const newState = event.target.checked;
  try {
    // We don't need to wait for the background script to finish,
    // just send the message.
    browserAPI.storage.local.set({ autoClose: newState });
    sendMessage({ command: 'setAutoClose', data: newState });
  } catch (error) {
    console.error('Error setting auto-close state:', error);
    event.target.checked = !newState; // Revert UI on error
  }
}

/**
 * Toggles the redirect feature
 */
async function handleFrontendRedirectToggle(event) {
  const newState = event.target.checked;
  try {
    browserAPI.storage.local.set({ frontendRedirectEnabled: newState });
    sendMessage({ command: 'setFrontendRedirect', data: newState });
  } catch (error) {
    console.error('Error setting frontend redirect state:', error);
    event.target.checked = !newState; // Revert UI on error
  }
}

/**
 * Toggles the backend redirect feature
 */
async function handleBackendRedirectToggle(event) {
  const newState = event.target.checked;
  try {
    browserAPI.storage.local.set({ backendRedirectEnabled: newState });
    sendMessage({ command: 'setBackendRedirect', data: newState });
  } catch (error) {
    console.error('Error setting backend redirect state:', error);
    event.target.checked = !newState; // Revert UI on error
  }
}

/**
 * Displays the version number
 */
function displayVersion() {
  try {
    // Get the manifest data
    const manifest = browserAPI.runtime.getManifest();
    if (manifest && manifest.version) {
      versionElement.textContent = `v${manifest.version}`;
    } else {
      versionElement.textContent = '';
    }
  } catch (error) {
    console.error('Error fetching version:', error);
    versionElement.textContent = '';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Add event listeners
  autoCloseToggle.addEventListener('change', handleAutoCloseToggle);
  frontendRedirectToggle.addEventListener('change', handleFrontendRedirectToggle);
  // backendRedirectToggle.addEventListener('change', handleBackendRedirectToggle);

  // Initialize popup state
  initializePopup();
  displayVersion();
});

