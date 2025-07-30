/**
 * Criteria Toolkit - Background Script
 * Handles tab monitoring and auto-closing functionality
 */

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Configuration
const TARGET_URL = 'http://127.0.0.1:35001/';
const SUCCESS_MESSAGE = 'Authentication details received, processing details. You may close this window at any time.';

// State
let autoCloseEnabled = true;
let closingTabs = new Set(); // Track tabs being closed to avoid duplicates

/**
 * Logs messages with timestamp and consistent formatting
 * @param {string} type - The type of log (info, warn, error)
 * @param {string} message - The message to log
 * @param {any} data - Optional data to include
 */
function logMessage(type, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[Criteria Toolkit ${timestamp}]`;
  
  if (data) {
    console[type](prefix, message, data);
  } else {
    console[type](prefix, message);
  }
}

/**
 * Closes a tab when it detects the success message on the page
 * @param {number} tabId - The ID of the tab to close
 * @param {string} url - The URL of the tab
 */
function closeMatchingTab(tabId, url) {
  // Only proceed if auto-close is enabled and URL matches
  if (!autoCloseEnabled || url !== TARGET_URL) {
    return;
  }
  
  // Avoid duplicate close attempts
  if (closingTabs.has(tabId)) {
    return;
  }
  
  // Add to tracking set
  closingTabs.add(tabId);
  
  logMessage('info', `Monitoring tab ${tabId} for success message`);
  
  // Inject a content script to check for the success message
  browserAPI.scripting.executeScript({
    target: { tabId: tabId },
    function: checkForSuccessMessage,
    args: [SUCCESS_MESSAGE]
  }, (results) => {
    if (browserAPI.runtime.lastError) {
      logMessage('error', `Error executing content script in tab ${tabId}:`, browserAPI.runtime.lastError);
      closingTabs.delete(tabId);
      return;
    }
    
    const result = results && results[0];
    if (result && result.result === true) {
      // Success message found, close the tab
      browserAPI.tabs.remove(tabId, () => {
        if (browserAPI.runtime.lastError) {
          logMessage('error', `Error closing tab ${tabId}:`, browserAPI.runtime.lastError);
        } else {
          logMessage('info', `Successfully closed tab ${tabId} after detecting success message`);
        }
        closingTabs.delete(tabId);
      });
    } else {
      // Message not found yet, set up a mutation observer via content script
      browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        function: setupMutationObserver,
        args: [SUCCESS_MESSAGE, tabId]
      }, () => {
        if (browserAPI.runtime.lastError) {
          logMessage('error', `Error setting up observer in tab ${tabId}:`, browserAPI.runtime.lastError);
          closingTabs.delete(tabId);
        }
      });
    }
  });
}

/**
 * Checks for and closes any existing tabs with the target URL
 */
function checkExistingTabs() {
  if (!autoCloseEnabled) return;
  
  browserAPI.tabs.query({ url: TARGET_URL }, (tabs) => {
    if (browserAPI.runtime.lastError) {
      logMessage('error', 'Error querying tabs:', browserAPI.runtime.lastError);
      return;
    }
    
    if (tabs && tabs.length > 0) {
      logMessage('info', `Found ${tabs.length} existing target tabs to close`);
      tabs.forEach(tab => closeMatchingTab(tab.id, tab.url));
    }
  });
}

/**
 * Toggles the auto-close functionality
 * @param {boolean} enabled - The new state (if provided)
 * @returns {boolean} - The new state
 */
function toggleAutoClose(enabled = null) {
  try {
    // If enabled is provided, use it; otherwise toggle current state
    if (enabled !== null) {
      autoCloseEnabled = enabled;
    } else {
      autoCloseEnabled = !autoCloseEnabled;
    }
    
    // Save to storage
    browserAPI.storage.local.set({ autoClose: autoCloseEnabled });
    logMessage('info', `Auto-close ${autoCloseEnabled ? 'enabled' : 'disabled'}`);
    
    // If enabled, check for existing tabs to close
    if (autoCloseEnabled) {
      checkExistingTabs();
    }
    
    return autoCloseEnabled;
  } catch (error) {
    logMessage('error', 'Error toggling auto-close:', error);
    return autoCloseEnabled;
  }
}

// Content script functions

/**
 * Function to be injected as content script to check for success message
 * @param {string} successMessage - The message to look for
 * @returns {boolean} - Whether the message was found
 */
function checkForSuccessMessage(successMessage) {
  const bodyText = document.body.innerText;
  return bodyText.includes(successMessage);
}

/**
 * Function to be injected as content script to set up a mutation observer
 * @param {string} successMessage - The message to look for
 * @param {number} tabId - The ID of the tab being monitored
 */
function setupMutationObserver(successMessage, tabId) {
  // Don't set up multiple observers
  if (window._criteriaObserverActive) return;
  window._criteriaObserverActive = true;
  
  // Function to check for the message and notify background script
  const checkAndNotify = () => {
    if (document.body.innerText.includes(successMessage)) {
      // Send message to background script that success message was found
      chrome.runtime.sendMessage({ 
        action: 'successMessageFound', 
        tabId: tabId 
      });
      
      // Disconnect observer after finding the message
      if (window._criteriaObserver) {
        window._criteriaObserver.disconnect();
        window._criteriaObserver = null;
      }
    }
  };
  
  // Set up mutation observer to watch for DOM changes
  window._criteriaObserver = new MutationObserver(checkAndNotify);
  window._criteriaObserver.observe(document.body, { 
    childList: true, 
    subtree: true, 
    characterData: true,
    attributes: false
  });
  
  // Also check immediately in case the message is already there
  checkAndNotify();
}

// Event Listeners

// Listen for new navigations
browserAPI.webNavigation.onCommitted.addListener((details) => {
  // Only handle main frame navigations (not iframes)
  if (details.frameId === 0 && details.url === TARGET_URL) {
    logMessage('info', `Detected navigation to target URL in tab ${details.tabId}`);
    // Wait a moment for the page to load before checking
    setTimeout(() => {
      closeMatchingTab(details.tabId, details.url);
    }, 500);
  }
});

// Listen for config changes
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.autoClose !== undefined) {
    autoCloseEnabled = changes.autoClose.newValue;
    logMessage('info', `Auto-close setting changed to: ${autoCloseEnabled}`);
  }
});

// Handle messages from popup and content scripts
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logMessage('info', 'Received message:', request);
  
  if (request.action === 'toggleAutoClose') {
    const newState = toggleAutoClose(request.enabled);
    sendResponse({ success: true, enabled: newState });
  } else if (request.action === 'getStatus') {
    sendResponse({ enabled: autoCloseEnabled });
  } else if (request.action === 'successMessageFound') {
    // Content script found the success message, close the tab
    const tabId = request.tabId;
    if (tabId && closingTabs.has(tabId)) {
      browserAPI.tabs.remove(tabId, () => {
        if (browserAPI.runtime.lastError) {
          logMessage('error', `Error closing tab ${tabId}:`, browserAPI.runtime.lastError);
        } else {
          logMessage('info', `Successfully closed tab ${tabId} after receiving success message notification`);
        }
        closingTabs.delete(tabId);
      });
    }
  }
  
  // Return true to indicate async response
  return true;
});

// Initialization

// Load settings from storage
browserAPI.storage.local.get(['autoClose'], (result) => {
  if (browserAPI.runtime.lastError) {
    logMessage('error', 'Error loading settings:', browserAPI.runtime.lastError);
  } else {
    autoCloseEnabled = result.autoClose !== undefined ? result.autoClose : true;
    logMessage('info', `Initialized with auto-close ${autoCloseEnabled ? 'enabled' : 'disabled'}`);
    
    // Check for existing tabs to close
    if (autoCloseEnabled) {
      checkExistingTabs();
    }
  }
});

// Log extension startup
logMessage('info', 'Criteria Toolkit extension initialized');
