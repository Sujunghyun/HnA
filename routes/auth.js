
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const _ = require('lodash');

// u_id와 token(받아야함)을 facebook이나 google에 보내서 정상적인 사용자인지 확인

// 로그인(B)
router.post('/login', (req, res) => {
  console.log('로그인');
  const u_id = req.body.u_id,
    select_sql = 'select * from USER where u_id = ?;',
    stu_sql = 'select c.c_id, l.l_id, l.l_name, l.l_room, l.l_grade, l.l_semester, l.l_day, l.l_class, prof_name, beacon_id, l.start_time, l.end_time, supplement ' +
      'from LECTURE l JOIN COURSE c where l.l_id = c.l_id and c.u_id = ?;',
    prof_sql = 'select * from LECTURE where identifier = ?;';
  let identifier, isExisted, user_info = [];

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_query = connection.query(select_sql, u_id, function (err, rows) {
      if (err) {
        // connection pool을 이용하는 경우, 사용이 끝나면 pool을 반환해줘야함.
        connection.release();
        throw err;
      } else {
        user_info = rows[0];
        if (rows.length === 0) {
          isExisted = false;
          res.status(200).json({ isExisted, user_info });
          connection.release();
        } else {
          isExisted = true;
          identifier = rows[0].identifier;
          if (rows[0].u_role === 'stu') {
            // 해당 유저가 학생이라면 해당 유저가 수강하는 강의리스트를 보여준다.(c_id를 포함한)
            var stu_query = connection.query(stu_sql, u_id, function (err, lecture_list) {
              if (err) {
                connection.release();
                throw err;
              } else {
                if (lecture_list.length === 0) {
                  res.status(200).json({ isExisted, user_info });
                  connection.release();
                } else {
                  res.status(200).json({ isExisted, user_info, lecture_list });
                  connection.release();
                }
              }
            });
          } else {
            // 해당 유저가 교수라면 해당 유저가 개설한 강의리스트를 보여준다.
            var prof_query = connection.query(prof_sql, identifier, function (err, lecture_list) {
              if (err) {
                connection.release();
                throw err;
              } else {
                if (lecture_list.length === 0) {
                  res.status(200).json({ isExisted, user_info });
                  connection.release();
                } else {
                  res.status(200).json({ isExisted, user_info, lecture_list });
                  connection.release();
                }
              }
            });
          }
        }
      }
    });
  });
});

// 회원가입(B)
router.post('/signup', (req, res) => {
  console.log('회원가입');
  const u_role = req.body.u_role;
  // 학생일 경우, 학번과 학년을 추가적으로 받는다.
  if (u_role == 'stu') {
    // 제어문 바깥으로 변수값을 가져가기 위해(스코프 조정을 위해) 여기서만 변수를 var로 선언한다. //
    var temp = _.pick(req.body, ['u_id', 'u_name', 'u_depart', 'identifier', 'grade', 'photo_url', 'u_role']),
      sql = 'insert into USER (u_id, u_name, u_depart, identifier, grade, photo_url, u_role) values (?,?,?,?,?,?,?);'
  } else {
    var temp = _.pick(req.body, ['u_id', 'u_name', 'u_depart', 'identifier', 'photo_url', 'u_role']),
      sql = 'insert into USER (u_id, u_name, u_depart, identifier, photo_url, u_role) values (?,?,?,?,?,?);'
  }
  const params = _.toArray(temp),     // _.toArray로 타입을 Array로 변경. query 시 필요
    test_temp = _.pick(req.body, ['u_id', 'identifier']),   // _.pick로 파라미터 정리
    confirm_params = _.toArray(test_temp),
    confirm_sql = 'select * from USER where u_id = ? or identifier = ?;';

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(confirm_sql, confirm_params, function (err, permission) {  // 만약 이미 USER 테이블에 해당 u_id나 identifier가 존재하면 회원가입 실패유도
      if (err) {
        connection.release();
        throw err;
      } else if (permission == "") {
        var query = connection.query(sql, params, function (err, rows) {
          if (err) {
            connection.release();
            throw err;
          } else {
            if (rows.length === 0) {
              res.status(400).json({ false: '회원가입에 실패하였습니다.' });
              connection.release();
            } else {
              res.status(200).json({ success: '회원가입에 성공하였습니다.' });
              connection.release();
            }
          }
        });
      } else {
        res.status(400).json({ false: '이미 등록된 회원입니다.' });
        connection.release();
      }
    });
  });
});

// 회원 정보 조회(B)
router.get('/user/:u_id', (req, res) => {
  console.log('회원 정보 조회');
  const u_id = req.params.u_id,
    sql = 'select * from USER where u_id = ?;'

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, u_id, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '회원 정보 조회에 실패했습니다.' });
          connection.release();
        } else {
          res.status(200).json(rows[0]);
          connection.release();
        }
      }
    });
  });
});

// 회원 정보 수정(B)
router.put('/user', (req, res) => {
  console.log('회원 정보 수정');
  const u_role = req.body.u_role, u_id = req.body.u_id;
  if (u_role === 'stu') {
    var temp = _.pick(req.body, ['u_name', 'u_depart', 'grade', 'photo_url', 'u_id']),
      update_sql = 'update USER set u_name=?, u_depart=?, grade=?, photo_url=? where u_id = ?;',
      // 학생의 경우 변경한 유저명이 수강데이터에 반영됨.
      update_name_sql = 'update COURSE c set u_name = (select u_name from USER u where c.u_id = u.u_id ) where u_id = ?;'
  } else if (u_role === 'prof') {
    var temp = _.pick(req.body, ['u_name', 'u_depart', 'photo_url', 'u_id']),
      update_sql = 'update USER set u_name=?, u_depart=?, photo_url=? where u_id = ?;',
      // 교수인 경우 변경한 유저명이 강의데이터에 반영됨.
      update_name_sql = 'update LECTURE l set prof_name = (select u_name from USER u where l.identifier = u.identifier)' +
        'where l.identifier in (select identifier from USER where u_id = ?);'
  }
  const params = _.toArray(temp);

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var update_query = connection.query(update_sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '유저 정보 수정을 실패하였습니다.' });
          connection.release();
        } else {
          var update_name_query = connection.query(update_name_sql, u_id, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                res.status(400).json({ false: '강의/수강란의 유저명 수정을 실패하였습니다.' });
                connection.release();
              } else {
                res.status(200).json({ success: '유저 정보 수정을 성공하였습니다.' });
                connection.release();
              }
            }
          });
        }
      }
    });
  });
});

// 회원 탈퇴(B)
router.delete('/user', (req, res) => {
  console.log('회원 탈퇴');
  const u_id = req.headers.u_id,
    u_role = req.headers.u_role;
  if (u_role === 'prof') {
    // 교수용 출석 및 수강 데이터 삭제 쿼리
    var delete_attend_sql = 'delete a, c from ATTENDANCE as a INNER JOIN COURSE as c ON a.c_id = c.c_id where a.c_id ' +
      'in (select * from (select c_id from COURSE where l_id ' +
      'in (select l_id from LECTURE where identifier ' +
      'in (select identifier from USER where u_id = ?))) temp);',
      // 교수용 강의 일자 데이터 삭제 쿼리                  
      delete_lecDate_sql = 'delete from LECTURE_DT where l_id ' +
        'in (select l_id from LECTURE where identifier ' +
        'in (select identifier from USER where u_id = ?));',
      // 교수용 강의 및 유저 데이터 삭제 쿼리
      delete_user_sql = 'delete l, u from LECTURE as l INNER JOIN USER as u ON l.identifier = u.identifier where ' +
        'l.identifier in (select * from (select identifier from USER where u_id = ?) temp);';
  } else if (u_role === 'stu') {
    // 학생용 출석 데이터 삭제 쿼리        
    var delete_attend_sql = 'delete from ATTENDANCE where c_id in (select c_id from COURSE where u_id = ?);',
      // 학생용 수강 및 유저 데이터 삭제 쿼리
      delete_user_sql = 'delete c, u from COURSE as c INNER JOIN USER as u ON c.identifier = u.identifier where c.u_id = ?';
  }

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    if (u_role === 'prof') {
      var delete_attend_query = connection.query(delete_attend_sql, u_id, function (err, rows) {
        if (err) {
          connection.release();
          throw err;
        } else {
          if (rows.length === 0) {
            res.status(400).json({ false: '출결데이터 삭제에 실패하였습니다.' });  // u_id(body) 오류
            connection.release();
          } else {
            var delete_lecDate_query = connection.query(delete_lecDate_sql, u_id, function (err, rows2) {
              if (err) {
                connection.release();
                throw err;
              } else {
                if (rows2.length === 0) {
                  res.status(400).json({ false: '강의 일자 삭제에 실패하였습니다.' });  // u_id(body) 오류
                  connection.release();
                } else {
                  var delete_user_query = connection.query(delete_user_sql, u_id, function (err, rows3) {
                    if (err) {
                      connection.release();
                      throw err;
                    } else {
                      if (rows3.length === 0) {
                        res.status(400).json({ false: '회원 탈퇴에 실패하였습니다.' });  // u_id(body) 오류
                        connection.release();
                      } else {
                        res.status(200).json({ success: '회원 탈퇴에 성공하였습니다' });
                        connection.release();
                      }
                    }
                  });
                }
              }
            });
          }
        }
      });
    } else if (u_role === 'stu') {
      var delete_attend_query = connection.query(delete_attend_sql, u_id, function (err, rows) {
        if (err) {
          connection.release();
          throw err;
        } else {
          if (rows.length === 0) {
            res.status(400).json({ false: '출결데이터 삭제에 실패하였습니다.' });  // u_id(body) 오류
            connection.release();
          } else {
            var delete_user_query = connection.query(delete_user_sql, u_id, function (err, rows2) {
              if (err) {
                connection.release();
                throw err;
              } else {
                if (rows2.length === 0) {
                  res.status(400).json({ false: '회원 탈퇴에 실패하였습니다.' });  // u_id(body) 오류
                  connection.release();
                } else {
                  res.status(200).json({ success: '회원 탈퇴에 성공하였습니다' });
                  connection.release();
                }
              }
            });
          }
        }
      });
    }
  });
});

// apk file download api   - 파일 서버에 apk 경로 만들어서 업로드 해놓을 것.
router.get('/download', function (req, res, next) {
  let file = __dirname + '/../apk/HA.apk';
  res.download(file); 
});

module.exports = router;