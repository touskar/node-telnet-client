// TODO: * add 'auto' to 'removeEcho' (cut based on IAC)
//       * reject 'will echo' on demand (perl net::telnet option_accept())
//       * use underscores for private vars
//       * fix IAC matching in 'parseData'
//         * remove 'start' state and check for it via IAC

var util = require('util');
var events = require('events');
var net = require('net');
var socket = new net.Socket();


// define a constructor (object) and inherit EventEmitter functions
function Telnet() {
  events.EventEmitter.call(this);
  if (false === (this instanceof Telnet)) return new Telnet();
}

util.inherits(Telnet, events.EventEmitter);

Telnet.prototype.connect = function(opts) {
  this.host = opts.host || '127.0.0.1';
  this.port = (typeof opts.port !== 'undefined' ? opts.port : 23);
  this.timeout = (typeof opts.timeout !== 'undefined' ? opts.timeout : 500);
  this.prompt = opts.prompt || '/ # ';
  this.irs = (typeof opts.irs !== 'undefined' ? opts.irs : '\r\n');
  this.ors = (typeof opts.ors !== 'undefined' ? opts.ors : '\n');
  this.removeEcho = (typeof opts.removeEcho !== 'undefined' ? opts.removeEcho : 1);
  this.response = '';
  this.telnetState;

  var self = this;
  console.log('MODULE: connecting to %s with %s', this.host, this.prompt);

  this.telnetSocket = net.createConnection({
    port: self.port,
    host: self.host
  }, function() {
    self.telnetState = 'start';
    self.stringData = '';
    console.log('MODULE: connected!');
    console.log('postavio start');
  });

  this.telnetSocket.on('data', function(data) {
    parseData(data, self);
  });

  this.telnetSocket.on('error', function(error) {
    if (error) throw error;
  });

  this.telnetSocket.on('end', function() {
    console.log('MODULE: socket end triggered!');
    self.emit('end');
  });

  this.telnetSocket.on('close', function() {
    console.log('MODULE: socket close triggered!');
    self.emit('close');
  });
}

Telnet.prototype.setTimeout = function(msecs, callback) {
  // reuse 'net' lib's setTimeout()
  this.telnetSocket.setTimeout(msecs, callback);
}

Telnet.prototype.exec = function(cmd, callback) {
  cmd += this.ors;
  var self = this;

  console.log('MODULE: exec - sending to %s:%s',
      this.telnetSocket.remoteAddress, this.telnetSocket.remotePort);

  this.telnetSocket.write(cmd, function() {
    if (callback) callback('MODULE: msg sent!');
    self.telnetState = 'response';
    console.log('postavio response');
  });
}

Telnet.prototype.close = function() {
  this.telnetSocket.end();
}

function parseData(chunk, telnetObj) {
  // FIXME: what happens if the server doesn't send any IAC commands?
  // logika: if IAC, then negotiate, else state getprompt
  // onda novi if za getprompt i response

  var promptIndex = '';

  if (telnetObj.telnetState === 'start' && chunk[0] === 255 &&
      chunk[1] === 253 && chunk[2] === 1 && chunk[3] === 255 &&
      chunk[4] === 253 && chunk[5] === 31) {
    console.log('PARSER: go negotiate!');

    telnetObj.telnetState = 'negotiate';
    telnetObj.stringData = '';
    console.log('postavio negotiate');

    // TODO: choose if you want to negotiate
    negotiate(telnetObj);
    return;
  }
  else if (telnetObj.telnetState === 'start')
    telnetObj.telnetState = 'getprompt'; console.log('postavio getprompt');

  if (telnetObj.telnetState === 'getprompt') {
    var stringData = chunk.toString();
    promptIndex = stringData.search(telnetObj.prompt);

    if (promptIndex != -1) {
      console.log('PARSER: PROMPT - "%s"', stringData.substring(promptIndex));

      telnetObj.telnetState = 'sendcmd';
      telnetObj.stringData = '';
      telnetObj.emit('ready');
      console.log('postavio sendcmd');
    }
    else {
      console.log('PARSER: prompt not matched, saving data');

      telnetObj.stringData += stringData;
    }
  }
  else if (telnetObj.telnetState === 'response') {
    var stringData = chunk.toString();
    telnetObj.stringData += stringData;
    promptIndex = telnetObj.stringData.search(telnetObj.prompt);

    if (promptIndex == -1) return;
    var array = telnetObj.stringData.split(telnetObj.irs);

    if (telnetObj.removeEcho > 0) {
      if (telnetObj.removeEcho === 1) array.shift();
      else array.splice(0, telnetObj.removeEcho);
    }

    // remove prompt
    array.pop();

    console.log('PARSER: RESPONSE -', array);
    telnetObj.telnetSocket.end();
  }
}

function negotiate(telnetObj) {
  telnetObj.telnetSocket.write(
    Buffer("fffc01fffc1ffffd01fffd03", "hex"),
    function() {
      console.log('NEGOTIATOR: write done');
      telnetObj.telnetState = 'getprompt';
      console.log('postavio getprompt');
    });
}


module.exports = Telnet;