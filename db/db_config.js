module.exports = (function () {
    return {
      local: { // localhost
        host: 'localhost',
        user: 'root',
        password: '1111',
        database: 'hna',
      },
      imsi: { // imsi server
        host: '58.229.208.238',
        user: 'imsi',
        password: 'dlatl#123',
        database: 'imsi_db'
      }
    }
  })();

  // db 환경설정