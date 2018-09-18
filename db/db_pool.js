const mysql = require('mysql');
const generic_pool = require('generic-pool');
const config = require('./db_config').local;
// const config = require('./db_config').imsi;

module.exports = function () {
  const pool = mysql.createPool({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit : 100       // 최대연결 수. default : 10
  });
  
  return {
    getConnection(callback) {    // connection pool을 생성, 리턴
      pool.getConnection(callback);
      console.log('DB POOL SUCCESS!!!');        
    },
    end(callback){
      pool.end(callback);
      console.log('DB END');        
    }
  }
}();
