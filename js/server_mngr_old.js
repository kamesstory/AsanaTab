function syncAsanaData() {
  var cnct = new XMLHttpRequest();
  var response;

  // TODO: Figure out how to actually do OAuth using Asana's API correctly
  cnct.open('POST', "https://app.asana.com/-/oauth_authorize?\
    client_id=605427369365180&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=token&state=1", true);
  cnct.send();

  cnct.addEventListener("readystatechange", processRequest, false);
  function processRequest(e) {
    if( cnct.readyState == 4 ){
      if( cnct.status == 200 ){
        response = auth_success(cnct);
        continueSyncing();
      } else { // Else, Throw error user-side
        document.getElementById('welcometext').innerHTML = "Sorry, Tabs for Asana couldn't verify your Asana account.";
        document.getElementById('errormessage').innerHTML = "Error code " + cnct.status;
      }
    }
  }
}

function auth_success(cnct){
  document.getElementById('welcometext').innerHTML = "Feel free to take a look at your Asana tasks, listed below.";
  var spinner = document.getElementById('loaderspinner');
  spinner.parentElement.removeChild(spinner);
  return JSON.parse(cnct.responseText);
}

function continueSyncing(){

}