/**
 * The "server" portion of the chrome extension, which listens to events
 * from other clients such as the popup or per-page content windows.
 */
ExtensionServer = {

  /**
   * Call from the background page: listen to chrome events and
   * requests from page clients, which can't make cross-domain requests.
   */
  listen: function() {
    var me = this;

    // Mark our Api Bridge as the server side (the one that actually makes
    // API requests to Asana vs. just forwarding them to the server window).
    console.log( 'ExtensionServer\'s listen function has been called.' );
    AsanaBridge.is_server = true;

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.type === "api") {
        // Request to the API. Pass it on to the bridge.
        AsanaBridge.request(
            request.method, request.path, request.params, sendResponse,
            request.options || {});
        return true;  // will call sendResponse asynchronously
      } else if( request.type === "notification" ) {
        chrome.notifications.create( request.title, request.options, function(notificationID){} );
      }
    });
  }

};
