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
    me.showError(response.errors[0].message);
  };

  // This sets the click functionality for the opening button
  $('.openasana_button').click(function(){
    // if( debuggingLocalStorage == undefined ) console.log( "Crap!" );
    if( debuggingLocalStorage == false ){
      console.log( "NOTICE: Local Storage debugging is not enabled!");
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
    changeWelcome( "please log into your asana!" );
    $('.openasana_button').unbind( "click" );
    $('.openasana_button').show();
    $('.openasana_button').click(function(){
      window.open("https://asana.com/#login","_self")
    });
  }
}

function getCurrentWorkspacesWithOrdering( ordering, workspaces, banned ){
  // TODO: Fix the fuckup that is the fact that workspaces acesses via . and
  //    ordering and banned access via ['']
  // TODO: This is ridiculously slow and I hate it
  // TODO: What the heck is a local variable and which is a global? FIX PLEASE!
  console.log('This is the ordering for workspace_ordering:');
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
    console.log( "%c Workspace id " + workspace.id + " has name " + workspace.name + ".", 'background: #222; color: #55bada' );
    if( banned.some(e => e.id == workspace.id) ){
      workspaces.splice( workspaces.indexOf(workspace), 1 );
    }
  }

  for( let ban of banned ){
    console.log( "%c Workspace id " + ban.id + " has name " + ban.name + ".", 'background: #222; color: #da55ba' );
  }

  return workspaces;
}

function retrieveWorkspaces( url, title, selected_text, fav_url ){
  page_url = url;
  page_title = title;
  page_selection = selected_text;
  favicon_url = fav_url;

  ServerManager.me( function(user) {
    user_id = user.id;
    user_name = user.name;

    // Creates workspaces here
    ServerManager.workspaces( function(ws){
      workspaces = ws;
      // TODO: Nest all log messages underneath one debug function with input-able message.
      console.log( "Length of workspaces: " + workspaces.length );

      // TODO: Introduce workspace sorting based on user preferences
      chrome.storage.sync.get(['current_workspaces', 'workspace_ordering', 'banned_workspaces'], function(result) {
        // Just always save everything back, since there are sync problems

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
            console.log("DEBUG: Workspace", workspace.name, "with id", workspace.id, "is being saved.");
            result.workspace_ordering.push( {'id': workspace.id, 'name': workspace.name, 'index': i} );
            var test = result.workspace_ordering[result.workspace_ordering.length-1];
            console.log("DEBUG: Workspace", test['name'], "with id", test['id'], "has been saved!");
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
            console.log("DEBUG: Workspace_ordering does not have workspace", workspace.name, "with workspace id", workspace.id);
            result.workspace_ordering.push( {'id': workspace.id, 'name': workspace.name, 'index': result.workspace_ordering.length} );
          }
          // workplace.indexOf(workspace);
        }

        workspaces = getCurrentWorkspacesWithOrdering( result.workspace_ordering, workspaces, result.banned_workspaces );

        chrome.storage.sync.set({'current_workspaces': result.current_workspaces}, function(){
          chrome.storage.sync.set({'workspace_ordering': result.workspace_ordering}, function() {
            console.log("Workspace ordering and current workspaces saved in local storage!");
            // workspaces.sort( compareWorkspaces );

            displayTasks();
          });
        });
      });
    });
  });
}

function compareWorkspaces(a, b){
  return a.name.localeCompare(b.name);
}

function open_workspaces(){
  // console.log( "Workspaces are being opened on account of button click." );
  $('.openasana_button').text( 'Loading...' );
  $('.openasana_button').off();
  $('#loaderdiv').show();
  $('.workspace_container').show();
  retrieveWorkspaces( "chrome://newtab/", 'new tab - Asana', '', '' );
}

// “https://app.asana.com/api/1.0/tasks?assignee=me&completed_since=now&limit=100&workspace=[workspace_id]23”
function displayTasks(){
  tasks_for_workspace = {};

  $('.openasana_button').text( 'Scroll down to see workspaces.' );
  $('.openasana_button').prop( 'disabled', true );
  $('.openasana_button').css('cursor','default');

  for( let w of workspaces ){
    console.log( "The workspace " + w.name + " has been called for." );
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
      addNoTasksMessage( '#ws' + w.id, w.name );
    } else {
      tasks_for_workspace[ w.id ] = tasks;
      console.log( "Tasks for workspace " + w.id + " successfully retrieved: " + tasks );

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

  console.log( 'Marking task as done!' );

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
  console.log( "Unordered Lists's children are: ", unorderedlist.children.length );
  if( unorderedlist.children.length <= 1 ){
    addNoTasksMessage('#'+unorderedlist.id, unorderedlist.parentElement.firstChild.innerHTML);
  }
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
        var error_header = document.createElement("H2");
        var error_text = document.createTextNode("No workspaces have been saved to storage! Error.");
        error_header.appendChild( error_text );

        // Appends all this to the actual modal body
        $('.modal-all-workspaces-container').append(error_header);

        $('.modal').show();
      } else {
        // Creates current workspaces list
        for( let sw of result.workspace_ordering ){
          // Delete all banned_workspaces from this
          if( result.banned_workspaces.some( e => e['id'] == sw['id'] ) )
            continue;
          console.log("DEBUG: Modal generating workspace", sw.name);
          var li = document.createElement("LI");
          var checkboxContainer = document.createElement("LABEL");
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
          var workspaceName = document.createElement("A");
          workspaceName.appendChild(document.createTextNode(sw['name']));
          li.appendChild(workspaceName);
          $('#m-cur-work-list').append( li );
        }

        // Creates banned workspaces list
        for( let bw of result.banned_workspaces ){
          console.log("DEBUG: Modal generating banned workspace", bw.name);
          var li = document.createElement("LI");
          var checkboxContainer = document.createElement("LABEL");
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
          var workspaceName = document.createElement("A");
          workspaceName.appendChild(document.createTextNode(bw['name']));
          li.appendChild(workspaceName);
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
          var checkedWorkspace = child.getElementsByTagName("A")[0].innerHTML;
          child.getElementsByTagName("INPUT")[0].checked = false;
          console.log("CHECK:", checkedWorkspace, "IS CHECKED!");

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
          var checkedWorkspace = child.getElementsByTagName("A")[0].innerHTML;
          child.getElementsByTagName("INPUT")[0].checked = false;
          console.log("CHECK:", checkedWorkspace, "IS CHECKED!");

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

  $('.modal').on('shown', function () {
    $('.modal-header').focus();
  })

  // When the user clicks on <span> (x), close the modal
  $('#modal-close').click(function() {
      $('.modal').hide();
      $('#settings_button').prop("disabled", false);
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
