const pool = require('./db/db_pool');
const schedule = require('node-schedule');
const moment = require('moment');

const dept_state = '수업 중', 
      select_sql = 'SELECT c_id, real_attend_time FROM COURSE NATURAL JOIN ATTENDANCE WHERE state = ?',
      update_sql = 'update ATTENDANCE set depart = ? where c_id = ? and a_date = ?;',
      update_absenct_sql = 'update ATTENDANCE set attend = ? where a_date = ? and c_id in (select c_id from COURSE where l_id = ? and identifier = ?);',
      attend = '결석';


/* 해당 스케줄러는 5초동안 학생들에게서 출석 요청이 있었는지를 확인한다.
   만약 요청이 5초동안 없었다면 해당 학생을 이탈처리하며, 
   다시 5초 내에 요청이 온다면 출석상태로 변경한다. */
function sit() {
  schedule.scheduleJob('*/5 * * * * *', function () {
    let depart, c_id, tmpTime1 = new Date(), 
    tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpMaxTime1 = moment(tmpTime1).add({ seconds: 5, hours: 9 }), tmpMinTime1 = moment(tmpTime1).add(9, 'hours').subtract(5, 'seconds'),
    tmpTime3 = tmpTime2.toISOString(), tmpMaxTime2 = tmpMaxTime1.toISOString(), tmpMinTime2 = tmpMinTime1.toISOString(), 
    currentDate = tmpTime3.substring(0, 10), 
    currentTime = tmpTime3.substring(11, 19), maxTime = tmpMaxTime2.substring(11, 19), minTime = tmpMinTime2.substring(11, 19), params = [currentDate];
    pool.getConnection(function (err, connection) {
      if (err) throw err;
      var query = connection.query(select_sql, dept_state, function (err, rows) {  
        if (err) {
          connection.release();
          throw err;
        } else {
          if (rows.length === 0) {
            console.log('이탈 처리 실패');
            connection.release();
          } else {            
            for (let i=0; i<rows.length; i++) {
              c_id = rows[i].c_id;
              params.unshift(c_id);
              if (minTime < rows[i].real_attend_time && rows[i].real_attend_time < maxTime) {              
                depart = 0;              
                params.unshift(depart);
              } else {
                depart = 1;              
                params.unshift(depart);
              }
              console.log(params);
              
              var query = connection.query(update_sql, params, function (err, rows2) {  
                if (err) {
                  throw err;
                } else {
                  if (rows2.length === 0) {
                    console.log('이탈 처리 실패');
                  } else {   
                    console.log('이탈 처리 성공');                    
                  }
                }
              });
              params.shift();
              params.shift();
            }            
            connection.release();
          }
        }
      });
    });
  });
}

/* 해당 스케줄러는 돌아와 요청이 온 시점부터 최대 10분동안 동작한다.
   만약 10분내로 학생이 돌아온 경우 그 즉시 스케줄러를 중지하며, 
   10분이 지나도 학생이 돌아오지 않은 경우, 해당 학생을 결석처리하고 스케줄러를 중지한다.*/
function timeout(absent_sql, params) {
  let startTime = new Date(Date.now() + 1000);
  let endTime = new Date(startTime.getTime() + 600000);
  schedule.scheduleJob({ start: startTime, end: endTime, rule: '*/10 * * * *' }, function () {    // 10분마다 작동하는 스케줄러지만, 10분뒤에 종료되므로 1번쓰고 종료된다.
    pool.getConnection(function (err, connection) {
      if (err) throw err;
      var query1 = connection.query(absent_sql, params, function (err, rows) {          
        if (err) {
          connection.release();
          throw err;
        } else {
          if (rows.length === 0) {
            console.log('결석 처리 실패');
            connection.release();
          } else {
            if (rows[0].depart === 1) { // 돌아와 요청을 보낸지 10분이 지났지만 아직 해당 학생이 이탈 중인 경우
              params.unshift(attend);
              var query2 = connection.query(update_absenct_sql, params, function (err, rows2) {  
                if (err) {
                  connection.release();
                  throw err;
                } else {
                  if (rows2.length === 0) {
                    console.log('결석 처리 실패');  // 업데이트 실패
                    connection.release();
                  } else {  
                    console.log('결석 처리 성공');  // 해당 학생을 결석처리
                    connection.release();
                  }
                }
              });
              params.shift();
            } else {
              console.log('이미 돌아온 학생입니다.');   // 10분뒤에 확인했지만 이미 돌아온 학생인 경우
              connection.release();
            }
          }
        }
      });
    });
  });
}

module.exports = {
  sit: sit,
  timeout: timeout
}