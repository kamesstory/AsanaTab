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
var workspaces_retrieved = false;
var wrkspbutton_clicked = false;

// Data from API cached for this popup.
var workspaces = null;
var users = null;
var user_id = null;
var user_name = null;
var tasks = null;

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

  // This sets the click functionality for the opening button
  $('.openasana_button').click(function(){
    open_workspaces();
  });

  startTime();
  startDate();

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

function sendNotification( title, options, callback ){
  chrome.runtime.sendMessage({
    type: "notification",
    title: title,
    options: options || {}
  }, callback);
}

function startTime() {
  var today = new Date();
  var h = today.getHours();
  var m = today.getMinutes();
  var s = today.getSeconds();
  if( h > 12 ){
    h -= 12;
    $('#main_clock_ampm').text( "PM" );  
  }
  else if ( h == 0 ){
    h = 12;
    $('#main_clock_ampm').text( "AM" );  
  }
  m = checkTime(m);
  s = checkTime(s);

  if( h > 22 && m > 55 )
    startDate();

  $('#main_clock').text( "" + h + ":" + m + ":" + s + "" ); 
  
  var t = setTimeout(startTime, 500);
}

function startDate() {
  var today = new Date();
  var day = "";
  switch( today.getDay() ){
    case 0: day = "Sunday"; break;
    case 1: day = "Monday"; break;
    case 2: day = "Tuesday"; break;
    case 3: day = "Wednesday"; break;
    case 4: day = "Thursday"; break;
    case 5: day = "Friday"; break;
    case 6: day = "Saturday"; break;
  }
  var month = "";
  switch( today.getMonth() ){
    case 0: month = "January"; break;
    case 1: month = "February"; break;
    case 2: month = "March"; break;
    case 3: month = "April"; break;
    case 4: month = "May"; break;
    case 5: month = "June"; break;
    case 6: month = "July"; break;
    case 7: month = "August"; break;
    case 8: month = "September"; break;
    case 9: month = "October"; break;
    case 10: month = "November"; break;
    case 11: month = "December"; break;
  }
  $('#main_date').text( day + ", " + month + " " + today.getDate() + ", " + today.getFullYear() );
}

function checkTime(i) {
  if (i < 10) {
    i = "0" + i;
  }  // add zero in front of numbers < 10
  return i;
}

function onCheckLogin( is_logged_in ){
  if( is_logged_in ){
    // console.log( "Successful login or login check to Asana." );

    ServerManager.logEvent({ name: "ChromeExtension-New-Tab" });

    $('.openasana_button').show();
  }
  else {
    // The user is not even logged in. Prompt them to do so!
    changeWelcome( "there was an error logging into your asana. please make sure cookies are enabled." );
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
    // changeWelcome( "Welcome, " + user.name + "! Please feel free to browse your projects below." );
    me.user_id = user.id;
    me.user_name = user.name;

    // WORKSPACES being implemented here
    ServerManager.workspaces( function(workspaces){
      me.workspaces = workspaces;
      
      // TODO: Introduce workspace sorting based on user preferences
      me.workspaces.sort( compareWorkspaces );
      // console.log( "Workplaces successfully retrieved: " + me.workspaces.map(a => a.name) );

      displayTasks();
    });
  });
}

function compareWorkspaces(a, b){
  return a.name.localeCompare(b.name);
}

function open_workspaces(){ 
  // console.log( "Workspaces are being opened on account of button click." );
  $('.openasana_button').text( 'Loading...' );
  $('#loaderdiv').show();
  $('.workspace_container').show();
  retrieveWorkspaces( "chrome://newtab/", 'new tab - Asana', '', '' );
}

// “https://app.asana.com/api/1.0/tasks?assignee=me&completed_since=now&limit=100&workspace=[workspace_id]23”
function displayTasks(){
  var me = this;
  me.tasks = {};

  $('.openasana_button').text( 'Scroll down to see workspaces.' );
  $('.openasana_button').prop( 'disabled', true );
  $('.openasana_button').css('cursor','default');

  for( let w of me.workspaces ){
    // console.log( "The workspace " + w.name + " has been called for." );
    // Creates a <div class='workspace_container'> and 
    // <ul id='ws' class='ls'> to go along with it
    var work_div = document.createElement("div");
    work_div.className = 'workspace_container';
    work_div.id = 'wsc' + w.id;

    var header = document.createElement("H2");
    var text = document.createTextNode( w.name );
    header.className = 'ls';
    header.appendChild( text );

    var unordered_list = document.createElement("UL");
    unordered_list.id = 'ws' + w.id;
    unordered_list.className = 'ls';

    work_div.appendChild( header );
    work_div.appendChild(unordered_list);
    document.getElementById("main_container").appendChild(work_div);

    getTasksFromWorkspace( w );
  }
}

function getTasksFromWorkspace( w ){
  var me = this;

  ServerManager.tasks( w.id, function(tasks) {
    if( tasks.length == 0 ){
      $('#ws' + w.id).append( "<li class='ls'><a class='newadd' href=\"#/\">" + 
        'You currently have no tasks for ' + w.name + '!' + "</a></li>" );
    } else {
      me.tasks[ w.id ] = tasks;
      console.log( "Tasks for workspace " + w.id + " successfully retrieved: " + tasks );

      for( let t of tasks ){
        $('#ws' + w.id).append( "<li id='task" + t.id + "' class='ls'><button class=\"donetask\">" + 
          "</button><a class='n' href=\"#/\">" + t.name + "</a></li>" );
      }
      $('#ws' + w.id).append( "<li class='ls'><input type=\"text\" " + 
        "class='newadd' href=\"#/\" placeholder=\"Type here to add a new task.\"></li>" );
      $(".newadd").off().on( 'change', function(){ newTask(this); });
      $(".donetask").off().on( 'click', function(){ markTaskDone(this); });
    }
  });
}

function markTaskDone( element ){
  var taskID = element.parentElement.id;
  taskID = taskID.substring( 4, taskID.length );

  var completedtask = {
    completed: true
  };

  console.log( 'Marking task as done!' );

  // saves this element in a variable to use later
  var listitem = element.parentElement;
  var unorderedlist =element.parentElement.parentElement;

  ServerManager.modifyTask( taskID, completedtask, function(){
    var notifOptions = {
      type: 'basic',
      iconUrl: '/assets/icon128.png',
      title: 'Completed Task!',
      message: "You marked a task as complete! To undo, click this message."
    };
    sendNotification( 'markTaskDoneNotif', notifOptions, function(){});
  });

  unorderedlist.removeChild(element.parentElement);
}

function newTask( element ){
  var me = this;

  // Generates random ID that is unique
  var random_id = generateRandomID();
  // console.log( 'random id is: ' + random_id.toString() );
  var newtask = {
    name: element.value,
    assignee: { id: this.user_id, name: this.user_name }
  };
  // console.log( 'newTask: element name is ' + element.value + "." );

  var workspaceID = element.parentElement.parentElement.id;
  workspaceID = workspaceID.substring( 2, workspaceID.length );
  var workspace_name = "";
  for( let w of me.workspaces ){
    if( parseInt(w.id) == parseInt(workspaceID) )
      workspace_name = w.name;
  }
  var notifOptions = {
    type: 'basic',
    iconUrl: '/assets/icon128.png',
    title: 'New task submission!',
    message: "You have submitted a new task to " + workspace_name + "!"
  };
  sendNotification( 'testernotification', notifOptions, function(){} );
  console.log( "New task created in " + workspaceID );

  $('#ws' + workspaceID).prepend( "<li id='" + random_id.toString() + "' class='ls'><button class=\"donetask\">" + 
      "</button><a class='n' href=\"#/\">" + newtask.name + "</a></li>" );

  ServerManager.createTask( workspaceID, newtask, function(){
    // Have to get actual task id and set li's id to the task id.
    ServerManager.tasks( workspaceID, function(tasks){
      // TODO: Improve this, still have to iterate through entire task list of workspace
      // which is DEFINITELY not optimal, although it typically should be a small amount of tasks
      // HOWEVER, tasks are typically sorted by priority or date, and since this was recently created
      // there shouldn't be many tasks needed to iterate through, so it might be okay...
      for( let t of tasks ){
        if( t.name == newtask.name ) {
          document.getElementById( random_id.toString() ).id = 'task' + t.id;
          $(".donetask").off().on( 'click', function(){ markTaskDone(this); });
        }
      }
    });
  });

  // CLEARS the element so that it knows that something's been submitted.
  element.value = "";
}

function changeWelcome( disp_str ){
  $('#welcometext').text( disp_str );
}

// Takes in a string input and outputs it in the welcome text
function printForUser( input ){
  // $('#developer_updates').text( input );
}

function generateRandomID() {
  // Math.random should be unique because of its seeding algorithm.
  // Convert it to base 36 (numbers + letters), and grab the first 9 characters
  // after the decimal.
  return '_' + Math.random().toString(36).substr(2, 9);
};