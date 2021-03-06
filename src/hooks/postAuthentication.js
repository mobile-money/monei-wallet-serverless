const {web3} = require('../services/etherium');
const {getSecretValue} = require('../services/secrets');
const AWS = require('aws-sdk');

const cognito = new AWS.CognitoIdentityServiceProvider();
const stepFunctions = new AWS.StepFunctions();

/**
 * A hook that is triggered by cognito PostAuthentication and PostConfirmation events
 * @param event
 *
 * {
 *   "version": "1",
 *   "region": "eu-central-1",
 *   "userPoolId": "eu-central-1_mXvfcQffG",
 *   "userName": "tuliofaria",
 *   "callerContext": {
 *       "awsSdkVersion": "aws-sdk-unknown-unknown",
 *       "clientId": "5c4h3qiunud8mcs2b9nejdgt8"
 *   },
 *   "triggerSource": "PostConfirmation_ConfirmSignUp",
 *   "request": {
 *       "userAttributes": {
 *           "sub": "a7a04d03-5944-4fe0-9370-d16b35a1fbd6",
 *           "cognito:user_status": "CONFIRMED",
 *           "email_verified": "true",
 *           "cognito:email_alias": "tuliofaria@gmail.com",
 *           "phone_number_verified": "false",
 *           "phone_number": "+5535999516658",
 *           "email": "tuliofaria@gmail.com"
 *       }
 *   },
 *   "response": {}
 * }
 *
 * @returns {Promise<Object>} - auth event
 */
exports.handler = async event => {
  console.log(JSON.stringify(event, null, 2));

  // skip registration if user already has eth address
  if (event.request.userAttributes['custom:eth_address']) return event;

  // fetch encrypt password from secret manager
  const encryptPassword = await getSecretValue(process.env.ENCRYPT_PASSWORD_KEY);

  // create new eth account for a user
  const account = web3.eth.accounts.create();

  // encrypt private key and convert it to string
  const encryptedPrivateKey = web3.eth.accounts.encrypt(account.privateKey, encryptPassword);

  const params = {
    UserAttributes: [
      {
        Name: 'custom:eth_address',
        Value: account.address
      },
      {
        Name: 'custom:eth_secret_key',
        // save encryptedPrivateKey as base64 string
        Value: new Buffer(JSON.stringify(encryptedPrivateKey)).toString('base64')
      }
    ],
    UserPoolId: event.userPoolId,
    Username: event.userName
  };

  // update eth address and secret key in cognito for a new user
  await cognito.adminUpdateUserAttributes(params).promise();

  // start allow transfers state machine
  await stepFunctions
    .startExecution({
      stateMachineArn: process.env.ALLOW_TRANSFER_SM,
      input: JSON.stringify({
        address: account.address,
        encryptedPrivateKey
      })
    })
    .promise();

  return event;
};
