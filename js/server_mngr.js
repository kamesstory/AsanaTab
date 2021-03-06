/**
 * Library of functions for the "server" portion of an extension, which is
 * loaded into the background and popup pages.
 *
 * Some of these functions are asynchronous, because they may have to talk
 * to the Asana API to get results.
 */
ServerManager = {

  // Make requests to API to refresh cache at this interval.
  CACHE_REFRESH_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes

  _url_to_cached_image: {},

  /**
   * Called by the model whenever a request is made and error occurs.
   * Override to handle in a context-appropriate way. Some requests may
   * also take an `errback` parameter which will handle errors with
   * that particular request.
   *
   * @param response {dict} Response from the server.
   */
  onError: function(response) {},

  /**
   * Requests the user's preferences for the extension.
   *
   * @param callback {Function(options)} Callback on completion.
   *     options {dict} See Options for details.
   */
  options: function(callback) {
    callback(Options.loadOptions());
  },

  /**
   * Saves the user's preferences for the extension.
   *
   * @param options {dict} See Options for details.
   * @param callback {Function()} Callback on completion.
   */
  saveOptions: function(options, callback) {
    Options.saveOptions(options);
    callback();
  },

  /**
   * Determine if the user is logged in.
   *
   * @param callback {Function(is_logged_in)} Called when request complete.
   *     is_logged_in {Boolean} True iff the user is logged in to Asana.
   */
  isLoggedIn: function(callback) {
    chrome.cookies.get({
      url: AsanaBridge.baseApiUrl(),
      name: 'ticket'
    }, function(cookie) {
      callback(!!(cookie && cookie.value));
    });
  },

  /**
   * Get the URL of a task given some of its data.
   *
   * @param task {dict}
   * @param callback {Function(url)}
   */
  taskViewUrl: function(task, callback) {
    // We don't know what pot to view it in so we just use the task ID
    // and Asana will choose a suitable default.
    var options = Options.loadOptions();
    var pot_id = task.gid;
    var url = 'https://' + options.asana_host_port + '/0/' + pot_id + '/' + task.id;
    callback(url);
  },

  /**
   * Requests the set of workspaces the logged-in user is in.
   *
   * @param callback {Function(workspaces)} Callback on success.
   *     workspaces {dict[]}
   */
  workspaces: function(callback, errback, options) {
    var self = this;
    AsanaBridge.request("GET", "/workspaces", {},
        function(response) {
          // console.log( "" + response );
          self._makeCallback(response, callback, errback);
        }, options);
  },

  /**
   * Requests the set of tasks assigned to the logged-in user from a single workspace
   *
   * @param callback {Function(workspaces)} Callback on success.
   *     workspaces {dict[]}
   */
  tasks: function( workspace_id, callback, errback, options) {
    var self = this;
    var params = {
      assignee: "me",
      completed_since: "now",
      limit: 100,
      workspace: workspace_id
    }; // assignee=me&completed_since=now&limit=100&workspace=[workspace_id]
    AsanaBridge.request("GET", "/tasks", params,
        function(response) {
          // console.log( "" + response );
          self._makeCallback(response, callback, errback);
        }, options);
  },

  /**
   * Requests the set of users in a workspace.
   *
   * @param callback {Function(users)} Callback on success.
   *     users {dict[]}
   */
  users: function(workspace_id, callback, errback, options) {
    var self = this;
    AsanaBridge.request(
        "GET", "/workspaces/" + workspace_id + "/users",
        { opt_fields: "name,photo.image_60x60" },
        function(response) {
          response.forEach(function (user) {
            self._updateUser(workspace_id, user);
          });
          self._makeCallback(response, callback, errback);
        }, options);
  },

  /**
   * Requests the user record for the logged-in user.
   *
   * @param callback {Function(user)} Callback on success.
   *     user {dict[]}
   */
  me: function(callback, errback, options) {
    var self = this;
    AsanaBridge.request("GET", "/users/me", {},
        function(response) {
          self._makeCallback(response, callback, errback);
        }, options);
  },

  /**
   * Makes an Asana API request to add a task in the system.
   *
   * @param task {dict} Task fields.
   * @param callback {Function(response)} Callback on success.
   */
  createTask: function(workspace_id, task, callback, errback) {
    var self = this;
    AsanaBridge.request(
        "POST",
        "/workspaces/" + workspace_id + "/tasks",
        task,
        function(response) {
          self._makeCallback(response, callback, errback);
        });
  },

  /**
   * Makes an Asana API request to complete a task in the system.
   *
   * @param task {dict} Task fields.
   * @param callback {Function(response)} Callback on success.
   */
  modifyTask: function(task_id, task, callback, errback) {
    var self = this;
    AsanaBridge.request(
        "PUT",
        "/tasks/" + task_id + "",
        task,
        function(response) {
          self._makeCallback(response, callback, errback);
        });
  },

  /**
   * Requests user type-ahead completions for a query.
   */
  userTypeahead: function(workspace_id, query, callback, errback) {
    var self = this;

    AsanaBridge.request(
      "GET",
      "/workspaces/" + workspace_id + "/typeahead",
      {
        type: 'user',
        query: query,
        count: 10,
        opt_fields: "name,photo.image_60x60",
      },
      function(response) {
        self._makeCallback(
          response,
          function (users) {
            users.forEach(function (user) {
              self._updateUser(workspace_id, user);
            });
            callback(users);
          },
          errback);
      },
      {
        miss_cache: true, // Always skip the cache.
      });
  },

  logEvent: function(event) {
    AsanaBridge.request(
        "POST",
        "/logs",
        event,
        function(response) {});
  },

  /**
   * All the users that have been seen so far, keyed by workspace and user.
   */
  _known_users: {},

  _updateUser: function(workspace_id, user) {
    this._known_users[workspace_id] = this._known_users[workspace_id] || {}
    this._known_users[workspace_id][user.gid] = user;
    this._cacheUserPhoto(user);
  },

  // WHY THE HECK IS RESPONSE UNDEFINED MOTHER OF GOD
  _makeCallback: function(response, callback, errback) {
    // console.log( "_makeCallback method has been entered." );
    if( response === undefined ){
      // Send a message that there was an error!
      var notifOptions = {
        type: 'basic',
        iconUrl: '/assets/icon128.png',
        title: 'AsanaTabs Error',
        message: "Could not connect to Asana API."
      };
      sendNotification( 'AsanaError', notifOptions, function(){} );
    }
    if (response.errors) {
      console.log( 'ERROR on _makeCallback of server_mngr.js', response.errors, response );
      (errback || this.onError).call(null, response);
    } else {
      printForUser( "SUCCESS on _MakeCallback of server_mngr.js" );
      callback(response.data);
    }
  },

  _cacheUserPhoto: function(user) {
    var me = this;
    if (user.photo) {
      var url = user.photo.image_60x60;
      if (!(url in me._url_to_cached_image)) {
        var image = new Image();
        image.src = url;
        me._url_to_cached_image[url] = image;
      }
    }
  },

  /**
   * Start fetching all the data needed by the extension so it is available
   * whenever a popup is opened.
   */
  startPrimingCache: function() {
    var me = this;
    me._cache_refresh_interval = setInterval(function() {
      me.refreshCache();
    }, me.CACHE_REFRESH_INTERVAL_MS);
    me.refreshCache();
  },

  refreshCache: function() {
    var me = this;
    // Fetch logged-in user.
    me.me(function(user) {
      if (!user.errors) {
        // Fetch list of workspaces.
        me.workspaces(function(workspaces) {}, null, { miss_cache: true })
      }
    }, null, { miss_cache: true });
  }
};
