// Use browser or chrome namespace depending on the browser
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Function to close tabs with the target URL
function closeMatchingTab(tabId, url) {
    if (url === 'http://127.0.0.1:35001/') {
        setTimeout(() => {
            browserAPI.tabs.remove(tabId);
        }, 5000);
    }
}

// Listen for new navigations
browserAPI.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.url === 'http://127.0.0.1:35001/') {
        // Wait for 5 seconds before closing the tab
        closeMatchingTab(details.tabId, details.url);
    }
});
