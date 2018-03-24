document.addEventListener('DOMContentLoaded', function() {
    var link = document.getElementById('loaderspinner');
    // onClick's logic below:
    link.addEventListener('click', function() {
      // Test to see if the API works as intended
      ServerManager.isLoggedIn(printIfLoggedIn());
      // basicTextFunction();
      // syncAsanaData();
    });
});

// Basic test function that effectively prints arbitrary text to welcometext line
function basicTextFunction(){
  $('#welcometext').text( "Congratulations! Some event has been triggered." );
}

function printIfLoggedIn(){
  $('#welcometext').text( "You are succesfully logged in to your Asana!" );
}

/*
$(document).ready('DOMContentLoaded', function() {
    var link = document.getElementById('samplebutton');
    // onClick's logic below:
    link.addEventListener('click', function() {
        syncAsanaData();
    });
}); */

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