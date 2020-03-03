var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var TelnetSocket = require('../../telnet');
var debug;
var log;


function instance(system, id, config) {
	var self = this;
	self.inputValue = 0;

	// Request id counter
	self.request_id = 0;
	self.login = false;
	// super-constructor
	instance_skel.apply(this, arguments);
	self.status(1,'Initializing');
	self.actions(); // export actions

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.init_tcp();
};

instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.init_tcp();
};

instance.prototype.incomingData = function(data) {
	var self = this;
	debug(data);

	// Match part of the copyright response from unit when a connection is made.
	if (self.login === false && data.match(/Extron Electronics/)) {
		self.status(self.STATUS_WARNING,'Logging in');
		self.socket.write("I\n"); // Matrix information request
	}

	if (self.login === false && data.match(/Password:/)) {
		self.status(self.STATUS_WARNING,'Logging in');
		self.socket.write("\r" +self.config.password+ "\r"); // Enter Password Set
	}

	// Match login sucess response from unit.
	else if (self.login === false && data.match(/Login/)) {
		self.login = true;
		self.status(self.STATUS_OK);
		debug("logged in");
	}
	// Match expected response from unit.
	else if (self.login === false && data.match(/V|SMX/)) {
		self.login = true;
		self.status(self.STATUS_OK);
		debug("logged in");
	}
	// Heatbeat to keep connection alive.
	function heartbeat() {
		self.login = false;
		self.status(self.STATUS_WARNING,'Checking Connection');
		self.socket.write("1I\n"); // should respond with Switcher description (short) eg: Inf01*SMX
		debug("Checking Connection");
	}
   	if (self.login === true) {
		clearInterval(self.heartbeat_interval);
		var beat_period = 60; // Seconds
		self.heartbeat_interval = setInterval(heartbeat, beat_period * 1000);
	}
	else {
		debug("data nologin", data);
	}
};

instance.prototype.init_tcp = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
		self.login = false;
	}

	if (self.config.host) {
		self.socket = new TelnetSocket(self.config.host, 23);

		self.socket.on('status_change', function (status, message) {
			if (status !== self.STATUS_OK) {
				self.status(status, message);
			}
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
			self.login = false;
		});

		self.socket.on('connect', function () {
			debug("Connected");
			self.login = false;
		});

		// if we get any data, display it to stdout
		self.socket.on("data", function(buffer) {
			var indata = buffer.toString("utf8");
			self.incomingData(indata);
		});

		self.socket.on("iac", function(type, info) {
			// tell remote we WONT do anything we're asked to DO
			if (type == 'DO') {
				self.socket.write(new Buffer([ 255, 252, info ]));
			}

			// tell the remote DONT do whatever they WILL offer
			if (type == 'WILL') {
				self.socket.write(new Buffer([ 255, 254, info ]));
			}
		});
	}
};
// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This will establish a telnet connection to the FOX'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'FOX IP address',
			width: 12,
			default: '192.168.254.254',
			regex: self.REGEX_IP
		},
		{
			type: 'textinput',
			id: 'password',
			label: 'Admin or User Password',
			width: 8
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;
	clearInterval (self.heartbeat_interval); //Stop Heartbeat

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);
};

instance.prototype.actions = function(system) {
	var self = this;
	var actions = {
		'route': {
			label: 'Route input to output',
			options: [{
				type: 'textinput',
				label: 'input',
				id: 'input',
				regex: self.REGEX_NUMBER
			}, {
				type: 'textinput',
				label: 'output',
				id: 'output',
				regex: self.REGEX_NUMBER
			}]
		},
		'selectInput': {
			label: 'Select input to route',
			options: [{
				type: 'textinput',
				label: 'input',
				id: 'input',
				regex: self.REGEX_NUMBER
			}]
		},
		'routeInput': {
			label: 'Route Selected input',
			options: [{
				type: 'textinput',
				label: 'output',
				id: 'output',
				regex: self.REGEX_NUMBER
			}]
		},
		'inputToAll': {
			label: 'Route input to all outputs',
			options: [{
				type: 'textinput',
				label: 'input',
				id: 'input',
				regex: self.REGEX_NUMBER
			}]
		},
		'recallGlobalP': {
			label: 'Recall global preset',
			options: [{
					type: 'textinput',
					label: 'preset',
					id: 'preset',
					regex: self.REGEX_NUMBER
			}]
		},
		'saveGlobalP': {
			label: 'Save global preset',
			options: [{
					type: 'textinput',
					label: 'preset',
					id: 'preset',
					regex: self.REGEX_NUMBER
			}]
		}

	};

	self.setActions(actions);
}

instance.prototype.action = function(action) {

	var self = this;
	var id = action.action;
	var opt = action.options;
	var cmd;
	var selectcmd;

	switch (id) {
		case 'route':
			
			cmd = opt.input +'*'+ opt.output +'!';
			selectcmd = 0;
			break;

		case 'routeInput':
			if(self.inputValue !== 0)
			{
			cmd = self.inputValue +'*'+ opt.output +'!';
			}
			selectcmd = 0;
			break;

		case 'selectInput':
			self.inputValue = opt.input;
			self.log('debug',"Input: " + opt.input);
			selectcmd = 1;
			break;

		case 'inputToAll':
			cmd = opt.input +'!';
			selectcmd = 0;
			break;

		case 'recallGlobalP':
			cmd = opt.preset +'.';
			selectcmd = 0;
			break;


		case 'saveGlobalP':
			cmd = opt.preset +',';
			selectcmd = 0;
			break;

	}

	if (selectcmd == 1) {

	} else {
	
		if (cmd !== undefined) {
	
			self.log('debug',"cmd: " + cmd );
			if (self.socket !== undefined && self.socket.connected) {
			self.socket.write(cmd+"\n");
			} else {
			debug('Socket not connected :(');
			}

		}
	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
