
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const _ = require('lodash');
const async = require('async');

// 개설 강의 조회(학생)(B) 
router.get('/course/:identifier/:l_grade/:l_semester', (req, res) => {
  console.log('개설 강의 조회');
  const temp = _.pick(req.params, ['l_grade', 'l_semester']),
    temp2 = _.pick(req.params, ['identifier', 'l_grade', 'l_semester']),
    params = _.toArray(temp), confirm_params = _.toArray(temp2),
    select_sql = 'select * from LECTURE where l_grade = ? and l_semester = ?;',
    confirm_sql = 'select l_id from LECTURE NATURAL JOIN COURSE where identifier = ? and l_grade = ? and l_semester = ?;';
  let l_id = [];

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var tasks = [
      function (callback) {
        connection.query(select_sql, params, function (err, rows) {
          if (err) return callback(err);
          if (rows.length == 0) return callback(res.status(400).json({ false: '개설된 강의가 없습니다.' }));
          else if (rows) {            
            callback(null, rows);
          }
        });
      },
      function (rows, callback) {
        connection.query(confirm_sql, confirm_params, function (err, rows2) {
          if (err) return callback(err);
          if (rows2.length == 0) {
            for (let i=0; i<rows.length; i++) {
              rows[i].isTaken = false;
            }
            return callback(res.status(200).json(rows));   // 개설 강의 리스트(수강중인 과목이 하나도 없는 경우)
          } 
          else if (rows2) {
            // rows2의 l_id만 배열에 할당.
            for (let i = 0; i < rows2.length; i++) {
              l_id.push(rows2[i].l_id)
            }
            for (let i = 0; i < rows.length; i++) {
              rows[i].isTaken = null;     // flag 초기화       
              for (let j = 0; j < l_id.length; j++) {
                if (rows[i].l_id == l_id[j]) { // 개설 강의 리스트의 id와 수강 중인 강의 리스트의 id를 비교해서 같다면, 즉 강의 리스트 중 수강 중인 과목이라면                                   
                  rows[i].isTaken = true;   // rows[i] 과목에 수강여부 flag 부여
                  break;    // flag 부여 후 제어문에서 바로 탈출함. 이렇게 하지 않으면 rows[i].l_id == l_id[j] 다음 번 j 값과 비교하는 로직에서 false가 부여되어 버림.
                } else {
                  rows[i].isTaken = false;
                }
              }
            }
            callback(res.status(200).json(rows));   // 개설 강의 리스트
          }
        });
      }
    ];
    // Run task 
    async.waterfall(tasks, function (err) {
      if (err)
        console.log(err);
      else {       
        console.log('done');
        connection.release();
      }
    });
  });
});

// 수강 신청(학생)(B)
router.post('/course', (req, res) => {
  console.log('수강 신청');
  const temp = _.pick(req.body, ['u_id', 'l_id']),
        l_id = req.body.l_id,
        select_sql = 'select u_name, u.identifier, l_name, start_time, end_time from USER u, LECTURE l where  u_id = ? and l_id = ?;',
        select_sql2 = 'select c_id from COURSE where u_id = ? and l_id = ?', state_sql = 'select state from COURSE where l_id = ?;',
        insert_sql = 'insert into COURSE (u_id, l_id, u_name, identifier, l_name, start_time, end_time) values (?,?,?,?,?,?,?);',
        insert_state_sql = 'insert into COURSE (u_id, l_id, u_name, identifier, l_name, state, start_time, end_time) values (?,?,?,?,?,?,?,?);',
        params1 = _.toArray(temp);
  let c_id, state, insert;
  // state 검색해서 수업 준비 중이라면 그냥 insert 하고 수업 준비 중이 아니면 insert 하는 state에 검색결과 값을 넣는다.  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var tasks = [
      function (callback) {
        connection.query(select_sql, params1, function (err, rows) {
          if (err) return callback(err);
          if (rows.length == 0) return callback(res.status(400).json({ false: '강의 조회에 실패하였습니다.' }));   // u_id or l_id 오류
          else if (rows) {     
            const params2 = _.toArray(rows[0]);            
            const params3 = [...params1, ...params2];
            callback(null, params3);
          }
        });
      },
      function (params3, callback) {
        connection.query(select_sql2, params1, function (err, rows2) {
          if (err) return callback(err);
          // 검색결과 c_id가 없는 즉, 아직 수강신청을 하지 않은 경우 수강신청 진행
          if (rows2.length == 0) callback(null, params3);
          // 검색결과 c_id가 있는 즉, 이미 수강신청을 한 경우
          else callback(res.status(400).json({ false: '이미 수강신청한 과목입니다.' }));
        });
      },
      function (params3, callback) {
        connection.query(state_sql, l_id, function (err, rows3) {
          if (err) return callback(err);
          if (rows3.length === 0 || rows3[0].state === '수업 준비 중') { // 수강신청 정상진행 되어야함.  1. 아직 수강신청안한경우
            insert = 1;
            return callback(null, insert, params3);
          }
          else if (rows3[0].state != '수업 준비 중') {    // 학생이 수강신청을 한 시점에서 수업이 수업 중이거나 수업 종료이거나 휴강인 경우
            insert = 2;
            callback(null, insert, params3);
          }
        });
      },      
      function (insert, params3, callback) {
        if (insert == 1) {
          connection.query(insert_sql, params3, function (err, rows4) {
            if (err) return callback(err);
            if (rows4.length == 0) return callback(res.status(400).json({ false: '수강 신청에 실패하였습니다.' }));    // params3 오류
            else if (rows4) {
              c_id = rows4.insertId;  
              callback(null, c_id);
            }
          });
        } else if (insert == 2) {
          state = rows3[0].state;
          params3.splice(5, 0, state);
          connection.query(insert_state_sql, params3, function (err, rows4) {
            if (err) return callback(err);
            if (rows4.length == 0) return callback(res.status(400).json({ false: '수강 신청에 실패하였습니다.' }));   // params3 오류
            else if (rows4) {
              c_id = rows4.insertId;  
              callback(null, c_id);
            }
          });
        }        
      }      
    ];
    // Run task 
    async.waterfall(tasks, function (err) {
      if (err)
        console.log('err');
      else {       
        console.log('done');               
        res.status(200).json({ c_id, success: '수강 신청에 성공하였습니다.' });
        connection.release();
      }
    });
  });
});

// 수강 취소(학생)(B)
router.delete('/course', (req, res) => {
  console.log('수강 취소');
  const c_id = req.headers.c_id,
    delete_sql = 'delete a, c from ATTENDANCE as a INNER JOIN COURSE as c ON a.c_id = c.c_id where a.c_id = ?',   // 다중 delete문 조건을 만족하는 데이터를 여러 테이블에서 한 번에 삭제한다.
    delete_course_sql = 'delete from COURSE where c_id = ?;';

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var delete_multi_query = connection.query(delete_sql, c_id, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '수강 취소에 실패하였습니다.' });  // c_id(body) 오류
          connection.release();
        } else if (rows.affectedRows === 0) {      // 출결 데이터가 없는 경우. 수강 데이터가 삭제되지 않음.
          var delete_course_query = connection.query(delete_course_sql, c_id, function (err, rows) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows.length === 0) {
                res.status(400).json({ false: '수강 취소에 실패하였습니다.' });  // c_id(body) 오류
                connection.release();
              } else {
                res.status(200).json({ success: '수강 취소에 성공하였습니다.' });  // 출결 데이터가 없어서 수강 데이터만 지웠을 경우
                connection.release();
              }
            }
          });
        } else {
          res.status(200).json({ success: '수강 취소에 성공하였습니다.' });
          connection.release();
        }
      }
    });
  });
});

module.exports = router;
