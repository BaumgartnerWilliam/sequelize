'use strict';

var AbstractConnectionManager = require('../abstract/connection-manager')
  , ConnectionManager
  , Utils = require('../../utils')
  , Promise = require('../../promise')
  , sequelizeErrors = require('../../errors')
  , parserStore = require('../parserStore')('mssqlEdge')
  , _ = require('lodash');

ConnectionManager = function (dialect, sequelize) {
  AbstractConnectionManager.call(this, dialect, sequelize);

  this.sequelize = sequelize;
  this.sequelize.config.port = this.sequelize.config.port || 1433;
  try {
    this.lib = require(sequelize.config.dialectModulePath || 'edge');
  } catch (err) {
    throw new Error('Please install edge package manually');
  }
};

Utils._.extend(ConnectionManager.prototype, AbstractConnectionManager.prototype);


// Expose this as a method so that the parsing may be updated when the user has added additional, custom types
ConnectionManager.prototype.$refreshTypeParser = function (dataType) {
  parserStore.refresh(dataType);
};

ConnectionManager.prototype.$clearTypeParser = function () {
  parserStore.clear();
};

ConnectionManager.prototype.connect = function (config) {
  var self = this;
  return new Promise(function (resolve, reject) {
    //var connectionConfig = {
    //  userName: config.username,
    //  password: config.password,
    //  server: config.host,
    //  options: {
    //    port: config.port,
    //    database: config.database
    //  }
    //};

    //souce = sql request; here we do a dumb request to test connectivity
    var connectionConfig = {
      connectionString: `Data Source=${config.host};Initial Catalog=${config.database};Integrated Security=True`,
      source: "select 1"
    };

    if (config.dialectOptions) {
      // only set port if no instance name was provided
      if (config.dialectOptions.connectionString) {
        connectionConfig.connectionString = config.dialectOptions.connectionString;
      }

      //// The 'tedious' driver needs domain property to be in the main Connection config object
      //if(config.dialectOptions.domain) {
      //  connectionConfig.domain = config.dialectOptions.domain;
      //}
      //
      //Object.keys(config.dialectOptions).forEach(function(key) {
      //  connectionConfig.options[key] = config.dialectOptions[key];
      //});
    }

    var connection = self.lib.func('sql', connectionConfig);
    connection.lib = self.lib;
    connection.config = connectionConfig;
    connection(null, function(err, result) {
      if (!err) {
        connection.loggedId = true;
        resolve(connection);
        return;
      }

      if (!err.code) {
        reject(new sequelizeErrors.ConnectionError(err));
        return;
      }

      switch (err.code) {
        case 'ESOCKET':
          if (_.includes(err.message, 'connect EHOSTUNREACH')) {
            reject(new sequelizeErrors.HostNotReachableError(err));
          } else if (_.includes(err.message, 'connect ECONNREFUSED')) {
            reject(new sequelizeErrors.ConnectionRefusedError(err));
          } else {
            reject(new sequelizeErrors.ConnectionError(err));
          }
          break;
        case 'ECONNREFUSED':
          reject(new sequelizeErrors.ConnectionRefusedError(err));
          break;
        case 'ER_ACCESS_DENIED_ERROR':
          reject(new sequelizeErrors.AccessDeniedError(err));
          break;
        case 'ENOTFOUND':
          reject(new sequelizeErrors.HostNotFoundError(err));
          break;
        case 'EHOSTUNREACH':
          reject(new sequelizeErrors.HostNotReachableError(err));
          break;
        case 'EINVAL':
          reject(new sequelizeErrors.InvalidConnectionError(err));
          break;
        default:
          reject(new sequelizeErrors.ConnectionError(err));
          break;
      }
    });

  });
};

ConnectionManager.prototype.disconnect = function (connection) {
  // Dont disconnect a connection that is already disconnected
  //if (!!connection.closed) {
  //  return Promise.resolve();
  //}
  //
  //return new Promise(function (resolve, reject) {
  //  connection.on('end', resolve);
  //  connection.close();
  //});
};

ConnectionManager.prototype.validate = function (connection) {
  return connection && connection.loggedIn;
};

module.exports = ConnectionManager;
