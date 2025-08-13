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
let frontendRedirectEnabled = false;
let backendRedirectEnabled = false;
let closingTabs = new Set(); // Track tabs being closed to avoid duplicates
let tabTimers = new Map(); // Track timers for each tab

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
  logMessage('info', `Monitoring tab ${tabId}. It will be closed in 5 seconds or when the success message is found.`);

  const closeTab = (reason) => {
    // Ensure we only try to close once
    if (closingTabs.has(tabId)) {
      // Clear any existing timer for this tab
      if (tabTimers.has(tabId)) {
        clearTimeout(tabTimers.get(tabId));
        tabTimers.delete(tabId);
      }

      browserAPI.tabs.remove(tabId, () => {
        if (browserAPI.runtime.lastError) {
          // It's possible the tab is already closed, so we log a warning instead of an error.
          logMessage('warn', `Could not close tab ${tabId} (${reason}): ${browserAPI.runtime.lastError.message}`);
        } else {
          logMessage('info', `Successfully closed tab ${tabId} (${reason}).`);
        }
        // Clean up state
        closingTabs.delete(tabId);
      });
    }
  };

  // Set a 5-second timer to close the tab
  const timerId = setTimeout(() => closeTab('timeout'), 5000);
  tabTimers.set(tabId, timerId); // Store the timer

  // Check for the success message immediately
  browserAPI.scripting.executeScript({
    target: { tabId: tabId },
    function: checkForSuccessMessage,
    args: [SUCCESS_MESSAGE]
  }, (results) => {
    if (browserAPI.runtime.lastError) {
      // This is expected if the tab is an error page (e.g., server not running).
      // We'll log it as a warning and let the 5-second timeout handle closing the tab.
      logMessage('warn', `Could not inject script into tab ${tabId}: ${browserAPI.runtime.lastError.message}. The tab will be closed by timeout.`);
      // We do NOT clear the timer or clean up state here. We let the timeout run.
      return;
    }

    const result = results && results[0];
    if (result && result.result === true) {
      // Success message found, close the tab immediately and cancel the timer
      clearTimeout(timerId);
      closeTab('success message');
    } else {
      // Message not found yet, set up a mutation observer.
      // The 'successMessageFound' message handler will also need to clear the timer.
      // We'll modify the message listener to handle this.
      browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        function: setupMutationObserver,
        args: [SUCCESS_MESSAGE, tabId]
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
      logMessage('info', `Found ${tabs.length} existing target tabs to monitor.`);
      tabs.forEach(tab => {
        // If the tab is still loading, wait a moment before trying to interact with it.
        // This helps prevent errors from injecting scripts into pages that aren't ready.
        if (tab.status === 'loading') {
          setTimeout(() => closeMatchingTab(tab.id, tab.url), 1000);
        } else {
          closeMatchingTab(tab.id, tab.url);
        }
      });
    }
  });
}

/**
 * Toggles the auto-close functionality
 * @param {boolean} enabled - The new state (if provided)
 * @returns {boolean} - The new state
 */
/**
 * Enables or disables the declarative net request rules for redirection.
 * @param {boolean} enabled - Whether to enable or disable the rules.
 */
async function updateRedirectRules(frontendEnabled, backendEnabled) {
  const rulesToEnable = [];
  const rulesToDisable = [];

  if (frontendEnabled) {
    rulesToEnable.push('frontend_rules');
  } else {
    rulesToDisable.push('frontend_rules');
  }

  if (backendEnabled) {
    rulesToEnable.push('backend_rules');
  } else {
    rulesToDisable.push('backend_rules');
  }

  try {
    await browserAPI.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: rulesToEnable,
      disableRulesetIds: rulesToDisable,
    });
    logMessage('info', `Redirects updated. Enabled: ${rulesToEnable.join(', ')}. Disabled: ${rulesToDisable.join(', ')}`);
  } catch (error) {
    logMessage('error', 'Failed to update redirect rulesets:', error);
  }
}

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
  // Only proceed if auto-close is enabled and it's a main frame navigation to the target URL
  if (autoCloseEnabled && details.frameId === 0 && details.url === TARGET_URL) {
    logMessage('info', `Detected navigation to target URL in tab ${details.tabId}. Auto-close is active.`);
    // Wait a moment for the page to load before checking
    setTimeout(() => {
      closeMatchingTab(details.tabId, details.url);
    }, 500);
  }
});

// Listen for config changes from storage
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.autoClose !== undefined) {
    autoCloseEnabled = changes.autoClose.newValue;
    logMessage('info', `Auto-close setting changed to: ${autoCloseEnabled}`);
  }

  if (changes.frontendRedirectEnabled !== undefined) {
    frontendRedirectEnabled = changes.frontendRedirectEnabled.newValue;
    updateRedirectRules(frontendRedirectEnabled, backendRedirectEnabled);
    logMessage('info', `Frontend redirect setting changed to: ${frontendRedirectEnabled}`);
  }

  if (changes.backendRedirectEnabled !== undefined) {
    backendRedirectEnabled = changes.backendRedirectEnabled.newValue;
    updateRedirectRules(frontendRedirectEnabled, backendRedirectEnabled);
    logMessage('info', `Backend redirect setting changed to: ${backendRedirectEnabled}`);
  }
});

// Handle messages from popup and content scripts
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logMessage('info', 'Received message:', request);

  switch (request.command) {
    case 'setAutoClose':
      autoCloseEnabled = request.data;
      browserAPI.storage.local.set({ autoClose: autoCloseEnabled });
      logMessage('info', `Auto-close set to: ${autoCloseEnabled}`);
      sendResponse({ success: true });
      break;

    case 'getAutoCloseState':
      sendResponse({ isEnabled: autoCloseEnabled });
      break;

    case 'setFrontendRedirect':
      frontendRedirectEnabled = request.data;
      // No need to set storage here, popup.js does it
      updateRedirectRules(frontendRedirectEnabled, backendRedirectEnabled);
      sendResponse({ success: true });
      break;

    case 'setBackendRedirect':
      backendRedirectEnabled = request.data;
      // No need to set storage here, popup.js does it
      updateRedirectRules(frontendRedirectEnabled, backendRedirectEnabled);
      sendResponse({ success: true });
      break;

    case 'successMessageFound':
      const tabId = request.tabId;
      if (tabId && closingTabs.has(tabId)) {
        logMessage('info', `Success message found by observer in tab ${tabId}. Closing now.`);
        // Get the timer, clear it, and close the tab.
        if (tabTimers.has(tabId)) {
          clearTimeout(tabTimers.get(tabId));
          tabTimers.delete(tabId);
        }
        // Re-use the closeTab logic if possible, or just close directly.
        // For simplicity, we'll just close it directly here.
        browserAPI.tabs.remove(tabId, () => {
          if (browserAPI.runtime.lastError) {
            logMessage('warn', `Could not close tab ${tabId} (success message):`, browserAPI.runtime.lastError.message);
          } else {
            logMessage('info', `Successfully closed tab ${tabId} (success message).`);
          }
          closingTabs.delete(tabId);
        });
      }
      break;
  }

  if (request.action === 'successMessageFound') {
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
async function initialize() {
  try {
    const result = await browserAPI.storage.local.get(['autoClose', 'frontendRedirectEnabled', 'backendRedirectEnabled']);
    
    // Initialize auto-close state, defaulting to true
    autoCloseEnabled = result.autoClose !== undefined ? result.autoClose : true;
    logMessage('info', `Initialized with auto-close ${autoCloseEnabled ? 'enabled' : 'disabled'}`);

    // Initialize redirect states, defaulting to false
    frontendRedirectEnabled = result.frontendRedirectEnabled || false;
    backendRedirectEnabled = result.backendRedirectEnabled || false;
    logMessage('info', `Initialized with Frontend Redirect: ${frontendRedirectEnabled}, Backend Redirect: ${backendRedirectEnabled}`);

    // Apply rules based on loaded state
    await updateRedirectRules(frontendRedirectEnabled, backendRedirectEnabled);

    // Check for existing tabs to close if enabled
    if (autoCloseEnabled) {
      checkExistingTabs();
    }

    logMessage('info', 'Criteria Toolkit extension initialized successfully');
  } catch (error) {
    logMessage('error', 'Error during initialization:', error);
  }
}

initialize();
