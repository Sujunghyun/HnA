const admin = require('firebase-admin');
const serviceAccount = require('../fcm_config/serviceAccountKey.json');      

function init () {
  // Send a message to devices subscribed to the provided topic.
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://honestatten.firebaseio.com'
  });
}

function send (message) {
  // Send a message to devices subscribed to the provided topic.
  admin.messaging().send(message)
    .then((response) => {
    // Response is a message ID string.
    console.log('Successfully sent message:', response);
    })
    .catch((error) => {
    console.log('Error sending message:', error);
    });
}

module.exports = {
  init : init,
  send : send
}