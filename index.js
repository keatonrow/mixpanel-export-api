var _       = require('lodash');
var crypto  = require('crypto');
var path    = require('path');
var request = require('request');
var url     = require('url');

// API spec that defines the supported methods along with a list of 
// required arguments
var spec = require('./api_specification');

//Options that can be overriden.
var defaultOptions = {
  domain   : 'mixpanel.com',
  apiRoot  : '/api/2.0',
  protocol : 'https',
  expire   : 60 //in seconds
};

//Internal system options that can't be overriden.
var systemOptions = {
  format : 'json',
};

/**
 * Constructor of the Mixpanel Export API wrapper. The key and secret values 
 * can be found in mixpanel's "account" panel in the "projects" tab.
 * 
 * @param {string} key     The mixpanel API key 
 * @param {string} secret  The mixpanel API secret
 * @param {object} options Overrides default mixpanel options. Recommended
 *                         not to override these. The default options value 
 *                         are located in the defaultOptions variable.
 *
 *                         Possible options : 
 *                           - domain   : the mixpanel website domain
 *                           - apiRoot  : the root path of the data export api
 *                           - protocol : http/https
 *                           - expire   : request expiration time in seconds
 */
function MixpanelExportAPI(key, secret, options){

  if( !key || !secret){
    throw new Error('Mixpanel export API requires a key and a secret to work.');
  }

  this.key     = key;
  this.secret  = secret;
  this.options = _.defaults(options || {}, defaultOptions);
}

/**
 * Produces a generic request to the Mixpanel data export API.
 *
 * The request function takes a variable number of arguments, that always
 * follow these rules:
 *
 *  1- First argument is the api endpoint path. Without initial slash.
 *      ie: events, segmentation/average, events/top
 *
 *  2- The N arguments that follow are the N required arguments for that api
 *     call. If there are required arguments.
 *
 *  3- The next argument after the required arguments is an "options" object.
 *     This argument is optional and can be omitted.
 *
 *  4- The last argument is the final callback. It follows a standard err,doc
 *     signature.
 *
 * Example: Calling the "funnels" endpoint for a specific funnel, specifying 
 *          the optional begin and end date for that funnel:
 *
 *          exportApiInstance.request(
 *            'funnels', 
 *            12345, 
 *            { from_date: '2014-03-01', to_date: '2014-03-15'},
 *            function(err,doc){
 *              console.log('result:', err || doc);
 *            });
 */
MixpanelExportAPI.prototype.request = function(){

  //Coerce arguments into an array
  var args = Array.prototype.slice.call(arguments);

  //First argument is always the endpoint, followed by N required arguments
  //for that endpoint (N is the length of the array in the spec object),
  //followed by an optional "options" and then a required final callback.
  var endPoint = args.shift();

  var requiredArguments = spec[endPoint];

  if(!requiredArguments){
    throw new Error('The end-point "'+ endPoint +'" is not supported by the mixpanel export api.');
  }

  var required = args.slice(0, requiredArguments.length);
  var options  = args[requiredArguments.length];
  var callback = args[requiredArguments.length + 1 ];

  if(typeof options === 'function'){
    callback = options;
    options = {};
  }

  if(!callback){
    throw new Error('A callback is required.');
  }

  if(required.length !== requiredArguments.length){
    throw new Error('A required argument for this endpoint is missing.');
  }

  //Create one big "argument" object that combines the required arguments, 
  //systems arguments and optional arguments.
  var parameters = _.defaults(
    { api_key : this.key },
    systemOptions,
    _.zipObject(requiredArguments, required),
    options,
    { expire : Math.floor(Date.now() / 1000) + this.options.expire }
  );

  parameters.sig = this.sign(parameters);

  var requestUrl = url.format({
    protocol : this.options.protocol,
    hostname : this.options.domain,
    pathname : path.join(this.options.apiRoot, endPoint),
    query    : parameters
  });
  
  request({
    method : 'GET',
    uri    : requestUrl,
    json   : true
  },
  function(err, response,body){
    callback(err, body);
  });
};

/**
 * Mixpanel request signing is done by ordering all of the query string 
 * params and values in alphabetical order. Afterwards, all of these are 
 * concatenanted together to follow this format: key1=value1key2=value2[...]
 * 
 * Once this is done, the mixpanel secret key is appended to the concatenated 
 * string resulting from the parameters, and then hashed using an md5 hash.
*/
MixpanelExportAPI.prototype.sign = function(parameters){

  function joinPairs(pair){ return pair.join('=');}

  var concatenated = _.pairs(parameters)
                      .map(joinPairs)
                      .sort()
                      .join('') + this.secret;

  var md5 = crypto.createHash('md5');
  md5.update(concatenated, 'utf8');

  return md5.digest('hex');
};


/**
 * API methods generator, loops through the spec specification on top 
 * and generates a bunch of vanity methods that can be used instead of ".request"
 * 
 * The method names are basically the endpoint Paths where the slashes have 
 * been replaced by underscores. ie:
 * 
 *   events/properties/top -> events_properties_top
 * 
 * The arguments passed to these methods are those contained in the array value,
 * along with an optional "options". The last argument is always an err/doc 
 * callback.
 * 
 * For more information on the possible options, see the mixpanel export api 
 * documentation at:
 * 
 *   https://mixpanel.com/docs/api-documentation/data-export-api
 * 
*/
_.forEach(spec, function(val, endPoint){
  var methodName = endPoint.replace(/\//g, '_');

  //Programmatically add the vanity method.
  MixpanelExportAPI.prototype[methodName] = function(){
    //Coerce arguments into an array
    var args = Array.prototype.slice.call(arguments);

    //Add endpoint first param.
    args.unshift(endPoint);
    this.request.apply(this, args);
  };
});

module.exports = MixpanelExportAPI;