/**
 * Criteria Toolkit - Popup Script
 * Handles the popup UI interactions and communicates with the background script
 */

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// DOM elements
const autoCloseToggle = document.getElementById('autoClose');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const versionElement = document.getElementById('version');

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
 * Updates the UI based on the current state
 * @param {boolean} isEnabled - Whether auto-close is enabled
 */
function updateUI(isEnabled) {
  // Update toggle switch
  autoCloseToggle.dataset.on = isEnabled ? 'on' : 'off';
  if (isEnabled) {
    autoCloseToggle.classList.add('on');
  } else {
    autoCloseToggle.classList.remove('on');
  }
  
  // Update status indicator
  statusIndicator.classList.toggle('active', isEnabled);
  statusText.textContent = isEnabled ? 'Auto close is active' : 'Auto close is deactivated';
}

/**
 * Initializes the popup state from storage
 */
function initializePopup() {
  browserAPI.storage.local.get(['autoClose'], (result) => {
    try {
      const isAutoCloseEnabled = result.autoClose !== undefined ? result.autoClose : true;
      updateUI(isAutoCloseEnabled);
    } catch (error) {
      console.error('Error initializing popup:', error);
      statusText.textContent = 'Error loading settings';
    }
  });
}

/**
 * Toggles the auto-close feature
 */
async function toggleAutoClose() {
  try {
    // Get current state
    const isCurrentlyEnabled = autoCloseToggle.dataset.on === 'on';
    const newState = !isCurrentlyEnabled;
    
    // Update UI immediately for better UX
    updateUI(newState);
    
    // Save to storage
    await browserAPI.storage.local.set({ autoClose: newState });
    
    // Notify background script
    await sendMessage({ 
      action: 'toggleAutoClose', 
      enabled: newState 
    });
    
    // Show success message
    statusText.textContent = newState ? 'Auto-close activated' : 'Auto-close deactivated';
  } catch (error) {
    console.error('Error toggling auto-close:', error);
    statusText.textContent = 'Error changing settings';
    
    // Revert UI if there was an error
    initializePopup();
  }
}

// Event listeners
autoCloseToggle.addEventListener('click', toggleAutoClose);

// Listen for changes from background script
browserAPI.storage.onChanged.addListener((changes) => {
  if (changes.autoClose) {
    updateUI(changes.autoClose.newValue);
  }
});

/**
 * Fetches the extension version from manifest.json and displays it
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
  initializePopup();
  displayVersion();
});

// Check extension status on popup open
initializePopup();

