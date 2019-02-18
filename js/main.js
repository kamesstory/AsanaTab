/* ---------------------------------------------------------------
 *              Main javascript file for AsanaTab
 * --------------------------------------------------------------- */

// Set to true if we are debugging local storage
const debuggingLocalStorage = false;

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
var stored_user = null;
var user_id = null;
var user_name = null;
var tasks_for_workspace = null;

// Typeahead ui element
var typeahead = null;

// The tab that contains this extension (new tab)
var tab = null;

//                                                               //
// -------------------------- MAIN JS -------------------------- //
//                                                               //

// Only executes such things when the document is ready to load
$(document).ready(function() {
  var me = this;

  // Our default error handler.
  ServerManager.onError = function(response) {
    // me.showError(response.errors[0].message);
    onCheckLogin( false, "error", false );
  };

  // This sets the click functionality for the opening button
  $('.openasana_button').click(function(){
    if( debuggingLocalStorage == false ){
      open_workspaces();
    } else {
      debugger // DEBUG:
      chrome.storage.sync.clear(function(){
        open_workspaces();
        console.log( "DEBUG: All local storage has been cleared!");
      });
    }
  });

  startTime();
  startDate();
  enableSettingsModal();
  enableFeedbackButton();

  chrome.tabs.query({
    active: true,
    currentWindow: true
  }, function(tabs) {
    tab = tabs[0];
    // Now load our options ...
    console.time("ServerManager.options");
    ServerManager.options(function(options) {
      console.timeEnd("ServerManager.options");
      me.options = options;

      // And also load the user for now.
      chrome.storage.sync.get('user', (result) => {
        stored_user = result.user;
        if( stored_user == null || stored_user == undefined ){
          onCheckLogin(false, "undergoing set up...", true);
        }
        // And ensure the user is logged in ...
        ServerManager.isLoggedIn( onCheckLogin );

        console.time("ServerManager.me");
        ServerManager.me( function(user) {
          console.timeEnd("ServerManager.me");
          user_id = user.id;
          user_name = user.name;
          chrome.storage.sync.set({'user': {'id': user.id, 'name': user.name}});
          if( stored_user == null ){
            // TODO: Automatically reload here.
            location.reload();
          }
        });
      });
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

function onCheckLogin( is_logged_in, message=null, unclickable=false ){
  $('.openasana_button').prop( 'disabled', unclickable );
  if( unclickable )
    $('.openasana_button').css('cursor','default');
  else
    $('.openasana_button').css('cursor','pointer');
  if( is_logged_in )
    ServerManager.logEvent({ name: "ChromeExtension-New-Tab" });
  else {
    $('.openasana_button').unbind( "click" );

    // If message is default:
    // The user is not even logged in. Prompt them to do so!
    if( message == null ){
      changeWelcome( "please log into your asana!" );
      $('.openasana_button').click(function(){
        window.open("https://asana.com/#login","_self")
      });
    } else if( message == "error" ){
      changeWelcome( "error: click here to reload." );
      $('.openasana_button').click(function(){
        $('.openasana_button').prop( 'disabled', unclickable );
        changeWelcome( "clearing local storage..." );
        chrome.storage.sync.clear(function(){
          location.reload();
        });
      });
    } else {
      changeWelcome( message );
    }
  }
  $('.openasana_button').show();
}

function getCurrentWorkspacesWithOrdering( ordering, workspaces, banned ){
  // TODO: Fix the fuckup that is the fact that workspaces acesses via . and
  //    ordering and banned access via ['']
  // TODO: This is ridiculously slow and I hate it
  // TODO: What the heck is a local variable and which is a global? FIX PLEASE!
  console.log('Workspace_ordering:');
  for( let wo of ordering ){
    console.log( "%c Workspace id " + wo['id'] + " with name " + wo['name'] + " has index " + wo['index'] + ".", 'background: #222; color: #bada55');
    for( let i = 0; i < workspaces.length; i++ ){
      workspace = workspaces[i];
      if( workspace.id == wo['id'] ){
        // switch the location of the two
        destination_index = wo['index'];
        current_workspace = workspaces[destination_index];
        workspaces[destination_index] = workspace;
        workspaces[i] = current_workspace;
      }
    }
  }

  // TODO: Get ban to work correctly!
  for( let i = workspaces.length-1; i >= 0; i-- ){
    let workspace = workspaces[i];
    if( banned.some(e => e.id == workspace.id) ){
      workspaces.splice( workspaces.indexOf(workspace), 1 );
    }
  }

  return workspaces;
}

function retrieveWorkspaces( url, title, selected_text, fav_url ){
  page_url = url;
  page_title = title;
  page_selection = selected_text;
  favicon_url = fav_url;

  if( stored_user != null && stored_user != undefined ){
    if( user_id == null )
      user_id = stored_user.id;
    if( user_name == null )
      user_name = stored_user.name;
  } else {
    onCheckLogin( false, "error", false );
  }

  // Creates workspaces here
  console.time("ServerManager.workspaces");
  $('.openasana_button').text( 'Loading workspaces...' );
  ServerManager.workspaces( function(ws){
    console.timeEnd("ServerManager.workspaces");
    workspaces = ws;
    // TODO: Nest all log messages underneath one debug function with input-able message.

    // TODO: Introduce workspace sorting based on user preferences
    console.time("ServerManager.workspaces' storage sync get");
    chrome.storage.sync.get(['current_workspaces', 'workspace_ordering', 'banned_workspaces'], function(result) {
      // Just always save everything back, since there are sync problems
      console.timeEnd("ServerManager.workspaces' storage sync get");

      // Do requisite checks for empty storage
      var workspace;
      if( result.current_workspaces == undefined || result.current_workspaces.length == 0 ){
        result.current_workspaces = workspaces;
        console.log( "DEBUG: Current Workspaces is currently not saved in storage!");
      }
      if( result.banned_workspaces == undefined ){
        result.banned_workspaces = [];
        console.log( "DEBUG: Banned Workspaces is currently not saved in storage!");
        chrome.storage.sync.set({'banned_workspaces': []});
      } else if( result.banned_workspaces.length == 0 ){
        console.log( "DEBUG: Banned Workspaces currently has no banned workspaces!");
      }
      if( result.workspace_ordering == undefined || result.workspace_ordering.length == 0 ){
        console.log( "DEBUG: Workspace Ordering is currently not saved in storage!");
        workspaces.sort( compareWorkspaces );
        result.workspace_ordering = [];
        // Save workspace_ordering as tuple with {id, name}.
        for( let i = 0; i < workspaces.length; i++ ){
          workspace = workspaces[i];
          result.workspace_ordering.push( {'id': workspace.id, 'name': workspace.name, 'index': i} );
          var test = result.workspace_ordering[result.workspace_ordering.length-1];
        }
      }

      for( let i = 0; i < workspaces.length; i++ ){
        // TODO: Need to find a way to update names of workspaces that have updated names!
        workspace = workspaces[i];
        // If there are workspaces not in current workspaces, add it
        if( result.current_workspaces.some(e => e['id'] == workspace.id) == false ) {
          result.current_workspaces.push( {'id': workspace.id, 'name': workspace.name} );
        }
        // If there are workspaces not in current workspaces, add it to end of workspace_ordering
        if( result.workspace_ordering.some(e => e['id'] == workspace.id) == false ) {
          result.workspace_ordering.push( {'id': workspace.id, 'name': workspace.name, 'index': result.workspace_ordering.length} );
        }
        // workplace.indexOf(workspace);
      }

      workspaces = getCurrentWorkspacesWithOrdering( result.workspace_ordering, workspaces, result.banned_workspaces );

      console.time("ServerManager.workspaces' storage sync set");
      chrome.storage.sync.set({'current_workspaces': result.current_workspaces}, function(){
        chrome.storage.sync.set({'workspace_ordering': result.workspace_ordering}, function(){
          console.timeEnd("ServerManager.workspaces' storage sync set");
          console.log("Workspace ordering and current workspaces saved in local storage!");
          // workspaces.sort( compareWorkspaces );

          displayTasks();
        });
      });
    });
  });
}

function compareWorkspaces(a, b){
  return a.name.localeCompare(b.name);
}

function open_workspaces(){
  $('.openasana_button').text( 'Loading...' );
  $('.openasana_button').off();
  $('.openasana_button').prop( 'disabled', true );
  $('.openasana_button').css('cursor','default');
  $('#loaderdiv').show();
  $('.workspace_container').show();
  retrieveWorkspaces( "chrome://newtab/", 'new tab - Asana', '', '' );
}

// “https://app.asana.com/api/1.0/tasks?assignee=me&completed_since=now&limit=100&workspace=[workspace_id]23”
function displayTasks(){
  tasks_for_workspace = {};

  $('.openasana_button').text( 'Loading tasks...' );

  // TODO: Try mapping functionality!
  for( let w of workspaces ){
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

  var workspace_time_message = "ServerManager.tasks for workspace" + w.name;
  console.time(workspace_time_message);
  ServerManager.tasks( w.id, function(tasks) {
    console.timeEnd(workspace_time_message);
    $('.openasana_button').text( 'Scroll down to see workspaces.' );

    if( tasks.length == 0 ){
      addNoTasksMessage( '#ws' + w.id, w.name );
    } else {
      tasks_for_workspace[ w.id ] = tasks;
      // TODO: Fix Due Dates. These should be working as soon as possible!
      // var date_due;
      for( let t of tasks ){
        // date_due = t.due_on;
        // $('#ws' + w.id).append( "<li id='task" + t.id + "' class='ls'><button class=\"donetask\"></button>" +
        //     "<a class='n' href=\"#/\">" + t.name + "</a><a class='duedate'>Due " + date_due + "</a></li>" );
        $('#ws' + w.id).append( "<li id='task" + t.id + "' class='ls'><button class=\"donetask\"></button>" +
            "<a class='n' href=\"#/\">" + t.name + "</a></li>" );
      }
      // $('#ws' + w.id).append( "<li class='ls'>" +
      //   "<input type=\"text\" class='newadd' href=\"#/\" placeholder=\"Type here to add a new task.\">" +
      //   "<div><a class='in' href=\"#/\">Date Due:</a><input class='dateinput' type='date'></div></li>" );
      $(".donetask").off().on( 'click', function(){ markTaskDone(this); });
    }
    $('#ws' + w.id).append( "<li class='ls'>" +
      "<input type=\"text\" class='newadd' href=\"#/\" placeholder=\"Type here to add a new task.\">");
    $(".newadd").off().on( 'change', function(){ newTask(this); });
  });
}

function addNoTasksMessage( workspace_id, workspace_name ){
  $(workspace_id).prepend( "<li class='ls' id='notasks'><a class='notasks' href=\"#/\">" +
    'Congratulations! You are finished with all tasks for ' + workspace_name + '!' + "</a></li>" );
}

function markTaskDone( element ){
  var taskID = element.parentElement.id;
  taskID = taskID.substring( 4, taskID.length );

  var completedtask = {
    completed: true
  };

  // saves this element in a variable to use later
  var listitem = element.parentElement;
  var unorderedlist = element.parentElement.parentElement;

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
  if( unorderedlist.children.length <= 1 ){
    addNoTasksMessage('#'+unorderedlist.id, unorderedlist.parentElement.firstChild.innerHTML);
  }
}

function newTask( element ){
  var me = this;

  // Generates random ID that is unique
  var random_id = generateRandomID();
  var newtask = {
    name: element.value,
    assignee: { id: this.user_id, name: this.user_name }
  };

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

  // var date_due;
  // $('#ws' + workspaceID).prepend( "<li id='" + random_id.toString() +
  //     "' class='ls'><button class=\"donetask\"></button>" +
  //     "<a class='n' href=\"#/\">" + newtask.name + "</a><a class='duedate'>Due " + date_due + "</a></li>" );

  // Before adding new task, you must FIRST destroy any "no tasks available" sign that exists.
  if( $('#ws' + workspaceID).children().length == 2 ){
    if( $('#ws' + workspaceID + ' li').first().attr('id') == 'notasks' ){
      $('#ws' + workspaceID + ' li').first().remove();
    }
  }

  $('#ws' + workspaceID).prepend( "<li id='" + random_id.toString() +
      "' class='ls'><button class=\"donetask\" disabled=true></button>" +
      "<a class='n' href=\"#/\">" + newtask.name + "</a></li>" );
  // Should grey out and inactivate the button so that it cannot be clicked.
  // TODO: Add faded grey color.
  // TODO: Isolate to only this specific button instance
  // $('#ws' + workspaceID + "." + random_id.toString() ).off();

  ServerManager.createTask( workspaceID, newtask, function(){
    // Have to get actual task id and set li's id to the task id.
    ServerManager.tasks( workspaceID, function(tasks){
      // NOTE: This is the callback after the API request is returned
      // TODO: Improve this, still have to iterate through entire task list of workspace
      // which is DEFINITELY not optimal, although it typically should be a small amount of tasks
      // HOWEVER, tasks are typically sorted by priority or date, and since this was recently created
      // there shouldn't be many tasks needed to iterate through, so it might be okay...
      for( let t of tasks ){
        if( t.name == newtask.name ) {
          // TODO: Resets IDs, probably not best architecture for such a thing!!!
          // Probably shoudl have parent div house the actual ID. Better architecture.
          var taskID = 'task' + t.id;
          document.getElementById( random_id.toString() ).id = taskID;
          // TODO: Isolate to only specific button instance, not all .donetask buttons
          $("li#"+taskID+" button.donetask").prop("disabled", false);
          $("li#"+taskID+" button.donetask").off().on( 'click', function(){ markTaskDone(this); });
        }
      }
    });
  });

  // CLEARS the element so that it knows that something's been submitted.
  element.value = "";
}

function enableSettingsModal(){
  // When the user clicks on the button, open the modal
  $('#settings_button').click(function() {
    // Could generate content here?
    $('#settings_button').prop("disabled", true);
    $('#m-cur-work-list').empty();
    $('#m-ban-work-list').empty();

    chrome.storage.sync.get(['current_workspaces', 'workspace_ordering', 'banned_workspaces'], function(result) {
      if( result.current_workspaces == undefined || result.workspace_ordering == undefined ){
        var li = document.createElement("LI");
        li.setAttribute("class", 'modal-list-item');
        li.appendChild(document.createTextNode("No workspaces have been saved to storage! Error."));

        var li2 = document.createElement("LI");
        li2.setAttribute("class", 'modal-list-item');
        li2.appendChild(document.createTextNode("No workspaces have been saved to storage! Error."));

        // Appends all this to the actual modal body
        $('#m-cur-work-list').append(li);
        $('#m-ban-work-list').append(li2);

        $('.modal').show();
      } else {
        // Creates current workspaces list
        for( let sw of result.workspace_ordering ){
          // Delete all banned_workspaces from this
          if( result.banned_workspaces.some( e => e['id'] == sw['id'] ) )
            continue;
          var li = document.createElement("LI");
          var checkboxContainer = document.createElement("LABEL");
          checkboxContainer.appendChild(document.createTextNode(sw['name']));
          checkboxContainer.setAttribute("class", 'modal-ws-checkbox');
          var checkbox = document.createElement("INPUT");
          checkbox.setAttribute("type", 'checkbox');
          var checkmark = document.createElement("SPAN");
          checkmark.setAttribute("class", "checkmark");
          li.setAttribute("id", 'm-c-ws' + sw['id']);
          li.setAttribute("class", 'modal-list-item');
          checkboxContainer.appendChild(checkbox);
          checkboxContainer.appendChild(checkmark);
          li.appendChild(checkboxContainer);
          $('#m-cur-work-list').append( li );
        }

        // Creates banned workspaces list
        for( let bw of result.banned_workspaces ){
          var li = document.createElement("LI");
          var checkboxContainer = document.createElement("LABEL");
          checkboxContainer.appendChild(document.createTextNode(bw['name']));
          checkboxContainer.setAttribute("class", 'modal-ws-checkbox');
          var checkbox = document.createElement("INPUT");
          checkbox.setAttribute("type", 'checkbox');
          var checkmark = document.createElement("SPAN");
          checkmark.setAttribute("class", "checkmark");
          li.setAttribute("id", 'm-b-ws' + bw['id']);
          li.setAttribute("class", 'modal-list-item');
          checkboxContainer.appendChild(checkbox);
          checkboxContainer.appendChild(checkmark);
          li.appendChild(checkboxContainer);
          $('#m-ban-work-list').append( li );
        }

        // NOW, we can show the modal!
        $('.modal').show();
      }
    });
  });

  // Inside LI are checkboxContainer
  // Inside checkboxContainer is checkbox (input) which is checked or not
  // If checked, then take the li's ID - prefix 'm-b-ws' and add to banned
  // Delete that li item.
  $('#bub-ban').click(function() {
    chrome.storage.sync.get('banned_workspaces', function(result) {
      var children = $('#m-cur-work-list').children("LI");
      var ws_to_ban = [];
      // Inside UL are LI
      for( let child of children ){
        if( child.getElementsByTagName("INPUT")[0].checked ){
          var label = child.getElementsByTagName("LABEL")[0];
          var checkedWorkspace = label.innerText;
          child.getElementsByTagName("INPUT")[0].checked = false;

          result.banned_workspaces.push({'name': checkedWorkspace, 'id': child.id.substring(6, child.id.length)});

          document.getElementById('m-cur-work-list').removeChild(child);
          $('#m-ban-work-list').append( child );
        }
      }
      // Add the ids and names to the banned_workspaces list!
      chrome.storage.sync.set({'banned_workspaces': result.banned_workspaces}, function(result){
        // TODO: Deactivate all modal inputs and buttons until storage syncs properly.
        console.log("DEBUG: Banned workspaces added to the storage!");
      });
    });
  });

  $('#bub-unban').click(function() {
    chrome.storage.sync.get('banned_workspaces', function(result) {
      var children = $('#m-ban-work-list').children("LI");
      var ws_to_unban = [];
      // Inside UL are LI
      for( let child of children ){
        if( child.getElementsByTagName("INPUT")[0].checked ){
          var label = child.getElementsByTagName("LABEL")[0];
          var checkedWorkspace = label.innerText;
          child.getElementsByTagName("INPUT")[0].checked = false;

          // Unban this thing!
          var index = result.banned_workspaces.findIndex(ws => ws.id == child.id.substring(6, child.id.length));
          result.banned_workspaces.splice(index, 1);

          document.getElementById('m-ban-work-list').removeChild(child);
          $('#m-cur-work-list').append( child );
        }
      }
      // Delete the ids and names from the banned_workspaces list!
      chrome.storage.sync.set({'banned_workspaces': result.banned_workspaces}, function(result){
        // TODO: Deactivate all modal inputs and buttons until storage syncs properly.
        console.log("DEBUG: Selected items deleted from the storage!");
      });
    });
  });

  $('#modal-clear-local-storage').click( function() {
    chrome.storage.sync.clear(function(){
      console.log( "All local storage has been cleared!");
      $('#label-for-cls').text("All local storage has been cleared!");
    });
  });

  $('.modal').on('shown', function () {
    $('.modal-header').focus();
  });

  // When the user clicks on <span> (x), close the modal
  $('#modal-close').click(function() {
      $('.modal').hide();
      $('#settings_button').prop("disabled", false);
  });
}

function enableFeedbackButton() {
  $('#feedback_button').click( () => {
    var email = "jason.haofeng.wang@gmail.com";
    var mailto_link = 'mailto:' + email + "?&subject=" + escape("Feedback about AsanaTabs");
    window = window.open( mailto_link, 'emailWindow' );
    if (window && window.open && !window.closed)
      window.close();
  });
}

function changeWelcome( disp_str ){
  $('.openasana_button').text( disp_str );
}

// Takes in a string input and outputs it in the welcome text
function printForUser( input ){
  // $('#developer_updates').text( input );
}

// TODO: Get rid of this absolute shit. Use some hashing function or something.
function generateRandomID() {
  // Math.random should be unique because of its seeding algorithm.
  // Convert it to base 36 (numbers + letters), and grab the first 9 characters
  // after the decimal.
  return '_' + Math.random().toString(36).substr(2, 9);
};
