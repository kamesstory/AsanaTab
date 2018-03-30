/* ---------------------------------------------------------------
 *              Main javascript file for AsanaTab
 * --------------------------------------------------------------- */

// Is this an external popup window? (vs. the one from the menu)
var is_external = false;

// Options loaded when popup opened.
var options = null;

// Info from page we were triggered from
var page_title = null;
var page_url = null;
var page_selection = null;
var favicon_url = null;

// State to track so we only log events once.
var has_edited_name = false;
var has_edited_notes = false;
var has_reassigned = false;
var has_used_page_details = false;
var is_first_add = true;

// Data from API cached for this popup.
var workspaces = null;
var users = null;
var user_id = null;

// Typeahead ui element
var typeahead = null;

// The tab that contains this extension (new tab)
var tab = null;

// Only executes such things when the document is ready to load
$(document).ready(function() {
  var me = this;

  // TODO: Find way to optimize all of this so it doesn't drain so much damn memory and performance
  // TODO: If this ends up being too intensive for loading, just add a button that allows people to display
  // at their own convenience

  // Our default error handler.
  ServerManager.onError = function(response) {
    me.showError(response.errors[0].message);
  };

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    tab = tabs[0];
    // Now load our options ...
    ServerManager.options(function(options) {
      me.options = options;
      // And ensure the user is logged in ...
      ServerManager.isLoggedIn( onCheckLogin );
    });
  });

  // Check to see if local storage already contains quick and easy to access workspaces and items

  // If so, load the workspaces from cache or local storage and sync for new changes (find way to optimize this)
  // If not, dynamically grab workspaces and to-do items and slap them onto the page

  // Add new changes to cache and local storage
  
});

// Basic test function that effectively prints arbitrary text to welcometext line
function basicTextFunction(){
  printForUser( "Congratulations! Some event has been triggered." );
}

function onCheckLogin( is_logged_in ){
  if( is_logged_in ){
    printForUser( "You are succesfully logged in to your Asana!" );
    console.log( "Successful login or login check to Asana." );

    ServerManager.logEvent({ name: "ChromeExtension-New-Tab" });

    retrieveWorkspaces( "chrome://newtab/", 'new tab - Asana', '', '' );
  }
  else {
    // The user is not even logged in. Prompt them to do so!
    printForUser( "There was an error logging into your Asana. Please make sure cookies are enabled." );
    me.showLogin(
        Options.loginUrl(options),
        Options.signupUrl(options));
  }
}

function retrieveWorkspaces( url, title, selected_text, favicon_url ){
  var me = this;

  me.page_url = url;
  me.page_title = title;
  me.page_selection = selected_text;
  me.favicon_url = favicon_url;

  ServerManager.me( function(user) { 
    me.user_id = user.id;

    // WORKSPACES being implemented here
    ServerManager.workspaces( function(workspaces){
      me.workspaces = workspaces;
      console.log( "Workplaces successfully retrieved: " + workspaces );
    });
  });
}

// Takes in a string input and outputs it in the welcome text
function printForUser( input ){
  $('#developer_updates').text( input );
}

// Create a new list item when clicking on the "Add" button
/* function newElement() {
  var li = document.createElement("li");
  var inputValue = document.getElementById("myInput").value;
  var t = document.createTextNode(inputValue);
  li.appendChild(t);
  if (inputValue === '') {
    alert("You must write something!");
  } else {
    document.getElementById("myUL").appendChild(li);
  }
  document.getElementById("myInput").value = "";

  var span = document.createElement("SPAN");
  var txt = document.createTextNode("\u00D7");
  span.className = "close";
  span.appendChild(txt);
  li.appendChild(span);

  for (i = 0; i < close.length; i++) {
    close[i].onclick = function() {
      var div = this.parentElement;
      div.style.display = "none";
    }
  }
} */