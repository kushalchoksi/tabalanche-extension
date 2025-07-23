/* global chrome platform */

var tabalanche = {};
(function(){

  function generateId() {
    return 'tg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function stashTabs(tabs) {
    return platform.currentWindowContext().then(function(store) {
      var stashTime = new Date();

      function stashedTab(tab) {
        return {
          url: tab.url,
          title: tab.title,
          icon: tab.favIconUrl
        };
      }

      if (tabs.length > 0) {
        var tabGroupDoc = {
          id: generateId(),
          created: stashTime.getTime(),
          tabs: tabs.map(stashedTab)
        };

        return saveTabGroup(tabGroupDoc).then(function() {
          platform.closeTabs(tabs);
          var dashboard = platform.extensionURL('dashboard.html');
          chrome.tabs.create({url: dashboard + '#' + tabGroupDoc.id});
          return tabGroupDoc;
        });
      } else {
        throw new Error('No tabs to save');
      }
    });
  }

  function saveTabGroup(tabGroup) {
    return new Promise(function(resolve, reject) {
      var data = {};
      data[tabGroup.id] = tabGroup;
      chrome.storage.local.set(data, function() {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tabGroup);
        }
      });
    });
  }

  function getAllTabGroups() {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get(null, function(items) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          var tabGroups = [];
          Object.keys(items).forEach(function(key) {
            if (key.startsWith('tg_')) {
              tabGroups.push(items[key]);
            }
          });
          // Sort by creation time, newest first (descending)
          tabGroups.sort(function(a, b) {
            return b.created - a.created;
          });
          resolve(tabGroups);
        }
      });
    });
  }

  function getSomeTabGroups(startKey, limit) {
    limit = limit || 5;
    
    return getAllTabGroups().then(function(allGroups) {
      if (!startKey) {
        // Return first batch
        return allGroups.slice(0, limit);
      }
      
      // Find the starting point based on startKey [created, _id]
      var startCreated = startKey[0];
      var startId = startKey[1];
      
      var startIndex = -1;
      for (var i = 0; i < allGroups.length; i++) {
        if (allGroups[i].created === startCreated && allGroups[i].id === startId) {
          startIndex = i;
          break;
        }
      }
      
      if (startIndex >= 0) {
        // Skip the start item and return next batch
        return allGroups.slice(startIndex + 1, startIndex + 1 + limit);
      }
      
      return [];
    });
  }

  function getTabGroup(id) {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.get([id], function(result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[id] || null);
        }
      });
    });
  }

  function removeTabGroup(id) {
    return new Promise(function(resolve, reject) {
      chrome.storage.local.remove([id], function() {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  function destroyAllTabGroups() {
    return getAllTabGroups().then(function(tabGroups) {
      var ids = tabGroups.map(function(tg) { return tg.id; });
      if (ids.length === 0) {
        return Promise.resolve();
      }
      return new Promise(function(resolve, reject) {
        chrome.storage.local.remove(ids, function() {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    });
  }

  // Public API - these match the original PouchDB-based API
  tabalanche.stashThisTab = function() {
    return platform.getWindowTabs.highlighted().then(stashTabs);
  };

  tabalanche.stashAllTabs = function() {
    return platform.getWindowTabs.all().then(stashTabs);
  };

  tabalanche.stashOtherTabs = function() {
    return platform.getWindowTabs.other().then(stashTabs);
  };

  tabalanche.stashTabsToTheRight = function() {
    return platform.getWindowTabs.right().then(stashTabs);
  };

  tabalanche.getAllTabGroups = function() {
    return getAllTabGroups();
  };

  tabalanche.getSomeTabGroups = function(startKey) {
    return getSomeTabGroups(startKey);
  };

  tabalanche.getTabGroup = function(id) {
    return getTabGroup(id);
  };

  tabalanche.removeTabGroup = function(id) {
    return removeTabGroup(id);
  };

  tabalanche.importTabGroup = function(tabGroup, opts) {
    opts = opts || {};
    
    // Ensure the tabGroup has an ID
    if (!tabGroup.id && !tabGroup._id) {
      tabGroup.id = generateId();
    } else if (tabGroup._id && !tabGroup.id) {
      // Convert PouchDB _id to our id format
      tabGroup.id = tabGroup._id;
      delete tabGroup._id;
    }
    
    // Remove PouchDB-specific fields
    delete tabGroup._rev;
    
    return saveTabGroup(tabGroup);
  };

  tabalanche.destroyAllTabGroups = function() {
    return destroyAllTabGroups();
  };

  // For compatibility with dashboard.js which expects getDB()
  tabalanche.getDB = function() {
    return Promise.resolve({
      put: function(doc) {
        return saveTabGroup(doc).then(function() {
          return { rev: 'fake-rev-' + Date.now() };
        });
      },
      remove: function(doc) {
        return removeTabGroup(doc.id || doc._id);
      },
      get: function(id) {
        return getTabGroup(id).then(function(group) {
          if (!group) {
            throw new Error('Document not found');
          }
          return group;
        });
      }
    });
  };

})();