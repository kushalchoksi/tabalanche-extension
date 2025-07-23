/* global chrome */

var platform = {};
(function(){

// Chrome compatibility - use chrome API instead of browser API
var browserAPI = (typeof chrome !== 'undefined') ? chrome : browser;

var optionDefaults = {
  ignorePinnedTabs: true,
};

// exposed for the options page
platform.optionDefaults = optionDefaults;

platform.currentWindowContext = function currentWindowContext() {
  var prefix, preLength;

  // Note: document.cookie won't work in service worker context
  // We'll need to use chrome.storage instead for Manifest V3
  function getContext() {
    // In service worker, we can't use document.cookie
    // Return a promise that resolves with stored context
    return new Promise(function(resolve) {
      browserAPI.storage.local.get([prefix], function(result) {
        var context = result[prefix] ? JSON.parse(result[prefix]) : {};
        resolve(context);
      });
    });
  }

  function setContext(ctx) {
    // In service worker, use chrome.storage instead of document.cookie
    var data = {};
    data[prefix] = JSON.stringify(ctx);
    return browserAPI.storage.local.set(data);
  }

  var iface = {get: getContext, set: setContext};
  
  return new Promise(function(resolve) {
    browserAPI.windows.getCurrent({populate: false}, function(crWindow) {
      prefix = 'wins_' + crWindow.id;
      preLength = prefix.length;
      resolve(iface);
    });
  });
};

// clear window session storage when the window is closed
browserAPI.windows.onRemoved.addListener(function (wid) {
  var key = 'wins_' + wid;
  browserAPI.storage.local.remove([key]);
});

platform.getWindowTabs = {};

function getOptions() {
  return new Promise(function(resolve) {
    browserAPI.storage.sync.get(optionDefaults, function(result) {
      resolve(result);
    });
  });
}

function queryCurrentWindowTabs (params) {
  params.currentWindow = true;
  return new Promise(function(resolve) {
    browserAPI.tabs.query(params, function(tabs) {
      resolve(tabs);
    });
  });
}

platform.getWindowTabs.all = function getAllWindowTabs() {
  var params = {};
  return getOptions().then(function (opts) {
    if (opts.ignorePinnedTabs) params.pinned = false;
    return queryCurrentWindowTabs(params);
  });
};

platform.getWindowTabs.highlighted = function getHighlightedWindowTabs() {
  return queryCurrentWindowTabs({highlighted: true});
};

platform.getWindowTabs.other = function getAllWindowTabs() {
  var params = {highlighted: false};
  return getOptions().then(function (opts) {
    if (opts.ignorePinnedTabs) params.pinned = false;
    return queryCurrentWindowTabs(params);
  });
};

platform.getWindowTabs.right = function getRightWindowTabs() {
  return queryCurrentWindowTabs({}).then(function (tabs) {
    var rightEdge = tabs.reduce(function (max, tab) {
      return tab.highlighted || tab.pinned
        ? Math.max(tab.index, max)
        : max;
    }, 0);
    return tabs.filter(function (tab) {
      return tab.index > rightEdge;
    });
  });
};

function tabIdMap(tab) {
  return tab.id;
}

platform.closeTabs = function closeTabs(tabs) {
  return new Promise(function(resolve, reject) {
    browserAPI.tabs.remove(tabs.map(tabIdMap), function() {
      if (browserAPI.runtime.lastError) {
        reject(browserAPI.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
};

platform.faviconPath = function faviconPath(url) {
  // TODO: cross-browser-compatible version of this
  // see https://bugzilla.mozilla.org/show_bug.cgi?id=1315616
  try {
    var domain = new URL(url).hostname;
    return 'https://www.google.com/s2/favicons?domain=' + domain;
  } catch (e) {
    // Fallback to a generic icon
    return '/images/default-favicon.png'; // You'll need to add this icon
  }
};

platform.extensionURL = function extensionURL(path) {
  return browserAPI.runtime.getURL(path);
};

platform.getOptionsURL = function getOptionsURL() {
  // TODO: Review newer options UI paradigm and revise this
  return 'chrome://extensions/?options=' + browserAPI.runtime.id;
};

platform.openOptionsPage = function() {
  return new Promise(function(resolve) {
    browserAPI.runtime.openOptionsPage(function() {
      resolve();
    });
  });
};

platform.openBackgroundTab = function openBackgroundTab(url) {
  return new Promise(function(resolve) {
    browserAPI.tabs.create({url: url, active: false}, function(tab) {
      resolve(tab);
    });
  });
};

})();