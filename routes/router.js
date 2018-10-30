
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const fcm = require('./fcm');
const schedule = require('../schedule');
const _ = require('lodash');
const moment = require('moment');
const async = require('async');

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

// 강의개설(교수)(B)
router.post('/lecture', (req, res) => {
  console.log('강의개설');
  // _.pick로 파라미터 정리
  const temp = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'l_class', 'identifier', 'prof_name', 'start_time', 'end_time', 'supplement']),
        temp2 = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'l_class', 'identifier', 'supplement']),
        temp3 = _.pick(req.body, ['l_name', 'l_grade', 'l_semester', 'l_class']),
  // _.toArray로 타입을 Array로 변경. query 시 필요
        params = _.toArray(temp), params2 = _.toArray(temp2), params3 = _.toArray(temp3), supplement = req.body.supplement,
        insert_sql = 'insert into LECTURE (l_name, l_room, l_grade, l_semester, l_day, l_class, identifier, prof_name, start_time, end_time, supplement) values (?,?,?,?,?,?,?,?,?,?,?);',
        find_sql = 'select supplement from LECTURE where l_name = ? and l_grade = ? and l_semester = ? and l_class = ?;',
        select_sql = 'select l_id from LECTURE where l_name = ? and l_room = ? and l_grade = ? and l_semester = ? and l_day = ? and l_class = ? and identifier = ? and supplement = ?;';        
  let l_id;
  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var find_query = connection.query(find_sql, params3, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0 || supplement == 1) {
          var insert_query = connection.query(insert_sql, params, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                res.status(400).json({ false: '강의개설에 실패하였습니다.' });
                connection.release();
              } else {
                var select_query = connection.query(select_sql, params2, function (err, rows3) {
                  if (err) {
                    connection.release();
                    throw err;
                  } else {
                    if (rows3.length === 0) {
                      res.status(400).json({ false: '개설한 강의정보 반환을 실패하였습니다.' });
                      connection.release();
                    } else {
                      l_id = rows3[0].l_id;
                      res.status(200).json({ l_id, success: '강의개설에 성공하였습니다.' });
                      connection.release();
                    }
                  }
                });          
              }
            }
          });
        } else if (rows[0].supplement == 0) {
          res.status(400).json({ false: '이미 개설된 강의입니다.' });    // 중복 방지
          connection.release();
        } 
      }
    });    
  });
});

// 강의 정보 조회(교수)(B)
router.get('/course_info/:l_id', (req, res) => {
  console.log('강의 정보 조회');
  const l_id = req.params.l_id,
        sql = 'select * from LECTURE where l_id = ?;'

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, l_id, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '강의 정보 조회에 실패했습니다.' });
          connection.release();
        } else {
          res.status(200).json(rows[0]);   // 일련번호로 검색한 강의의 모든 정보를 반환
          connection.release();
        }
      }
    });
  });
});

// 강의 정보 수정(교수)(B)
router.put('/lecture', (req, res) => {
  console.log('강의 정보 수정');
  const temp = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'l_class', 'beacon_id', 'start_time', 'end_time', 'l_id']),
        temp2 = _.pick(req.body, ['l_name', 'start_time', 'end_time', 'l_id']),
        update_sql = 'update LECTURE set l_name=?, l_room=?, l_grade=?, l_semester=?, l_day=?, l_class=?, beacon_id=?, start_time=?, end_time=? where l_id = ?;',
        update_name_sql = 'update COURSE set l_name = ?, start_time=?, end_time=? where l_id = ?;',   // 변경한 강의명이 수강데이터에 반영되도록 함.
        params = _.toArray(temp), name = _.toArray(temp2);

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var update_query = connection.query(update_sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '강의 정보 수정을 실패하였습니다.' });
          connection.release();
        } else {
          var update_name_query = connection.query(update_name_sql, name, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                res.status(400).json({ false: '수강 정보 수정을 실패하였습니다.' });
                connection.release();
              } else {
                res.status(200).json({ success: '강의 정보 수정에 성공하였습니다.' });
                connection.release();
              }
            }
          });
        }
      }
    });    
  });
});

// 폐강 처리(교수)(B)
router.delete('/lecture', (req, res) => {
  console.log('폐강 처리');
  const l_id = req.headers.l_id,
        delete_attend_sql = 'delete from ATTENDANCE where c_id in (select c_id from COURSE where l_id = ?);',    //  입력받은 l_id를 수강하는 모든 출결데이터를 삭제
        delete_ld_sql = 'delete from LECTURE_DT where l_id = ?;',
        multi_delete_sql = 'delete c, l from COURSE c, LECTURE l where c.l_id = l.l_id and c.l_id = ?',    //  입력받은 l_id의 강의와 관련 수강데이터를 삭제
        delete_lecture_sql = 'delete from LECTURE where l_id = ?;', find_topic_sql = 'select * from COURSE where l_id = ?';

  let topic;
  let message = {
    data: { status : '1', l_id: l_id },
    topic: topic
  };
  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var find_topic_query = connection.query(find_topic_sql, l_id, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '출결데이터 삭제에 실패하였습니다.' });  // l_id(body) 오류
          connection.release();
        } else {  
          var delete_attend_query = connection.query(delete_attend_sql, l_id, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                res.status(400).json({ false: '출결데이터 삭제에 실패하였습니다.' });  // l_id(body) 오류
                connection.release();
              } else {  
                var delete_attend_query = connection.query(delete_ld_sql, l_id, function (err, rows3) {
                  if (err) {
                    connection.release();
                    throw err;
                  } else {
                    if (rows3.length === 0) {
                      res.status(400).json({ false: '강의 일자 삭제에 실패하였습니다.' });  // l_id(body) 오류
                      connection.release();
                    } else { 
                      var multi_delete_query = connection.query(multi_delete_sql, l_id, function (err, rows4) {
                        if (err) {
                          connection.release();
                          throw err;
                        } else {
                          if (rows4.length === 0) {
                            res.status(400).json({ false: '폐강 처리에 실패하였습니다.' });  // l_id(body) 오류
                            connection.release();
                          } else if (rows4.affectedRows === 0) {   // 수강 데이터가 없는 경우. 강의 데이터가 삭제되지 않음.
                            var delete_lecture_query = connection.query(delete_lecture_sql, l_id, function (err, rows5) {
                              if (err) {
                                connection.release();
                                throw err;
                              } else {
                                if (rows5.length === 0) {
                                  res.status(400).json({ false: '폐강 처리에 실패하였습니다.' });  // l_id(body) 오류
                                  connection.release();
                                } else {   
                                  res.status(200).json({ success: '폐강 처리에 성공하였습니다' });  // 아무도 수강하지 않은 강의를 폐강하는 경우.
                                  connection.release();
                                }
                              }
                            });
                          } else {  
                            res.status(200).json({ success: '폐강 처리에 성공하였습니다' });
                            for (let i=0; i<rows.length; i++) {
                              topic = rows[i].u_id;
                              message.topic = topic;
                              fcm.send(message);
                            }
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
        }
      }
    });
  });
});

// 개설 강의 조회(학생)(B) 
router.get('/checklecture/:identifier/:l_grade/:l_semester', (req, res) => {
  console.log('개설 강의 조회');
  const temp = _.pick(req.params, ['l_grade', 'l_semester']),
        temp2 = _.pick(req.params, ['identifier', 'l_grade', 'l_semester']),
        params = _.toArray(temp), confirm_params = _.toArray(temp2),   
        select_sql = 'select * from LECTURE where l_grade = ? and l_semester = ?;',
        confirm_sql = 'select l_id from LECTURE NATURAL JOIN COURSE where identifier = ? and l_grade = ? and l_semester = ?;';
  let l_id = [];

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(select_sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '개설된 강의가 없습니다.' });
          connection.release();
        } else {
          var query = connection.query(confirm_sql, confirm_params, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                for (let i=0; i<rows.length; i++) {
                  rows[i].isTaken = false;
                }                
                res.status(200).json(rows);   // 개설 강의 리스트(수강중인 과목이 하나도 없는 경우)
                connection.release();
              } else {
                // rows2의 l_id만 배열에 할당.
                for (let i = 0; i < rows2.length; i++) {
                  l_id.push(rows2[i].l_id)
                }
                for (let i=0; i<rows.length; i++) {
                  rows[i].isTaken = null;     // flag 초기화       
                  for (let j=0; j<l_id.length; j++) {                    
                    if (rows[i].l_id == l_id[j]) { // 개설 강의 리스트의 id와 수강 중인 강의 리스트의 id를 비교해서 같다면, 즉 강의 리스트 중 수강 중인 과목이라면                                   
                      rows[i].isTaken = true;   // rows[i] 과목에 수강여부 flag 부여
                      break;    // flag 부여 후 제어문에서 바로 탈출함. 이렇게 하지 않으면 rows[i].l_id == l_id[j] 다음 번 j 값과 비교하는 로직에서 false가 부여되어 버림.
                    } else {
                      rows[i].isTaken = false;
                    }
                   }                  
                }
                res.status(200).json(rows);   // 개설 강의 리스트
                connection.release();
              }
            }
          });
        }
      }
    });
  });
});

// 수강 신청(학생)(B)
router.post('/register', (req, res) => {
  console.log('수강 신청');
  const temp = _.pick(req.body, ['u_id', 'l_id']),
        l_id = req.body.l_id,
        select_sql = 'select u_name, u.identifier, l_name, start_time, end_time from USER u, LECTURE l where  u_id = ? and l_id = ?;',
        select_sql2 = 'select c_id from COURSE where u_id = ? and l_id = ?', state_sql = 'select state from COURSE where l_id = ?;',
        insert_sql = 'insert into COURSE (u_id, l_id, u_name, identifier, l_name, start_time, end_time) values (?,?,?,?,?,?,?);',
        insert_state_sql = 'insert into COURSE (u_id, l_id, u_name, identifier, l_name, state, start_time, end_time) values (?,?,?,?,?,?,?,?);',
        params1 = _.toArray(temp);
  let c_id, state;
  // state 검색해서 수업 준비 중이라면 그냥 insert 하고 수업 준비 중이 아니면 insert 하는 state에 검색결과 값을 넣는다.  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select = connection.query(select_sql, params1, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '강의 조회에 실패하였습니다.' });  // u_id or l_id 오류
          connection.release();
        } else {
          const params2 = _.toArray(rows[0]);
          const params3 = [...params1, ...params2];
          var confirm = connection.query(select_sql2, params1, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {   // 검색결과 c_id가 없는 즉, 아직 수강신청을 하지 않은 경우 수강신청 진행
                var state_query = connection.query(state_sql, l_id, function (err, rows3) {
                  if (err) {
                    connection.release();
                    throw err;
                  } else {
                    if (rows3.length === 0 || rows3[0].state === '수업 준비 중') { // 수강신청 정상진행 되어야함.  1. 아직 수강신청안한경우
                      var insert = connection.query(insert_sql, params3, function (err, rows4) {
                        if (err) {
                          connection.release();
                          throw err;
                        } else {
                          if (rows4.length === 0) {
                            res.status(400).json({ false: '수강 신청에 실패하였습니다.' });  // params3 오류
                            connection.release();
                          } else {
                            var confirm = connection.query(select_sql2, params1, function (err, rows5) {
                              if (err) {
                                connection.release();
                                throw err;
                              } else {
                                c_id = rows5[0].c_id;
                                res.status(200).json({ c_id, success: '수강 신청에 성공하였습니다.' });
                                connection.release();
                              }
                            });                    
                          }
                        }
                      });
                    } else if (rows3[0].state != '수업 준비 중') {    // 학생이 수강신청을 한 시점에서 수업이 수업 중이거나 수업 종료이거나 휴강인 경우
                        state = rows3[0].state;
                        params3.splice(5, 0, state);
                        var insert = connection.query(insert_state_sql, params3, function (err, rows4) {
                          if (err) {
                            connection.release();
                            throw err;
                          } else {
                            if (rows4.length === 0) {
                              res.status(400).json({ false: '수강 신청에 실패하였습니다.' });  // params3 오류
                              connection.release();
                            } else {
                              var confirm = connection.query(select_sql2, params1, function (err, rows5) {
                                if (err) {
                                  connection.release();
                                  throw err;
                                } else {
                                  c_id = rows5[0].c_id;
                                  res.status(200).json({ c_id, success: '수강 신청에 성공하였습니다.' });
                                  connection.release();
                                }
                              });                    
                            }
                          }
                        });
                      }
                  }
                });                
              } else {  // 검색결과 c_id가 있는 즉, 이미 수강신청을 한 경우
                res.status(400).json({ false: '이미 수강신청한 과목입니다.' });
                connection.release();
              }              
            }
          });          
        }
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

// 출석부 조회(교수)(B) - 해당 강의를 듣는 학생의 리스트 + 현재 출결 현황을 조회한다.
router.get('/rollbook/:l_id/:a_date', (req, res) => {
  console.log('출석부 조회');
  const l_id = req.params.l_id,
        temp = _.pick(req.params, ['a_date', 'l_id']),        
        params = _.toArray(temp),
        select_stu_sql = 'select u.identifier, u.u_name, u.photo_url from USER u join COURSE c using (u_id) where l_id = ?',
        select_attned_sql = 'select identifier, attend, real_attend_time, depart from COURSE NATURAL JOIN ATTENDANCE where a_date = ? and l_id = ?;';

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_stu_query = connection.query(select_stu_sql, l_id, function (err, stu_list) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (stu_list.length === 0) {
          res.status(400).json({ false: '학생 리스트 조회에 실패했습니다.' });      // l_id 오류
          connection.release();   
        } else {
          var select_attned_query = connection.query(select_attned_sql, params, function (err, attend_list) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (attend_list.length === 0) {  // 출결데이터 없는 경우 단순한 stu_list만 보낸다.
                for (let i=0; i<stu_list.length; i++) {
                  stu_list[i].attend = '';
                  stu_list[i].real_attend_time = '';
                  stu_list[i].depart = 0;
                }
                res.status(200).json(stu_list);      // 출결데이터 없는 경우. attend 데이터에 빈 값을 할당해 전달
                connection.release();   
              } else {                 // 출결데이터 있는 경우. identifier를 비교해 stu_list에 attend_list 추가시킨 후 전달
                for (let i=0; i<stu_list.length; i++) {
                  for (let j=0; j<attend_list.length; j++) {
                    if (stu_list[i].identifier === attend_list[j].identifier) {
                      stu_list[i].attend = attend_list[j].attend;
                      stu_list[i].real_attend_time = attend_list[j].real_attend_time;
                      stu_list[i].depart = attend_list[j].depart;
                      break;
                    } else {
                      stu_list[i].attend = '결석';
                    }
                  }
                }
                res.status(200).json(stu_list);   // 해당 강의를 듣는 학생들의 학번과 이름을 반환
                connection.release();
              }
            }
          });
        }        
      }
    });
  });
});

// 출결상태 확인(학생)(B) - 학생이 특정 수강 과목에 대한 자신의 출결상태를 확인한다.      // 반환값을 결석으로 할지 물어볼 것.
router.get('/self_check/:c_id/:a_date', (req, res) => {
  console.log('출결상태 확인');
  const temp = _.pick(req.params, ['c_id', 'a_date']),    
        sql = 'select attend, depart from ATTENDANCE where c_id = ? and a_date = ?',
        params = _.toArray(temp);

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '출결 상태 조회에 실패했습니다.' }); 
          connection.release();
        } else {
          res.status(200).json(rows[0]);   // 해당 강의를 듣는 학생들의 학번과 이름을 반환
          connection.release();
        }
      }
    });
  });
});

// beacon 등록/수정 기능(교수)(B) 
router.put('/reg_beacon', (req, res) => {
  console.log('beacon 등록');
  const l_id = req.body.l_id, beacon_id = req.body.beacon_id, l_room = req.body.l_room,
        temp = _.pick(req.body, ['beacon_id', 'l_room', 'l_id']),
        sql = 'update LECTURE set beacon_id = ?, l_room = ? where l_id = ?;',
        find_topic_sql = 'select u_id from COURSE where l_id =?';
  const params = _.toArray(temp);
  let topic;
  let message = {
    data: { status : '0', l_id: l_id, l_room: l_room, beacon_id: beacon_id },
    topic: topic
  };  

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: 'beacon 등록에 실패하였습니다.' });
          connection.release();
        } else {               
          var query = connection.query(find_topic_sql, l_id, function (err, rows) {
            if (err) {
              connection.release();
              throw err;
            } if (rows.length == 0) {
                res.status(200).json({ success: 'beacon 등록에 성공하였습니다.' });     
                connection.release();  
              } else {
                for (let i=0; i<rows.length; i++) {
                  topic = rows[i].u_id;
                  message.topic = topic;
                  console.log(topic);
                  fcm.send(message);
                }
                res.status(200).json({ success: 'beacon 등록에 성공하였습니다.' });     
                connection.release();
              }            
          });                    
        }
      }
    });
  });
});

// 수업 상태 변경(교수)(B) - 해당 강의(l_id)를 듣는 모든 수강의 수업 상태가 변경됨. 
router.put('/lecture_state', (req, res) => {
  console.log('수업 상태 변경');
  const u_id = req.body.u_id,
        l_id = req.body.l_id,
        temp = _.pick(req.body, ['l_id', 'beacon_id']),
        select_sql = 'select u_id, u_role from USER where identifier in' +                  // u_name이 prof_name과 같은지 확인하고, 
                     '(select identifier from LECTURE where l_id = ? and beacon_id = ?);',  // identifier와 l_id, beacon_id가 올바른지 확인한다.
        select_sql2 = 'select c_id, state from COURSE where l_id = ?;',
        update_sql = 'update COURSE set state = ?, real_start_time = ? where l_id = ?;',
        call_sql = 'select * from ATTENDANCE where a_date = ? and c_id in (select c_id from COURSE where l_id = ?);',
        absent_sql = 'update ATTENDANCE set attend = ? where c_id in (select c_id from COURSE where l_id = ? and state = ? and a_date = ?);',
        ld_select_sql = 'select * from LECTURE_DT where l_id = ? and l_date = ?',
        ld_insert_sql = 'insert LECTURE_DT (l_id, l_date) values (?,?);',
        ab_insert_sql = 'insert ATTENDANCE (a_date, attend, c_id) values (?,?,?);',
        find_topic_sql = 'select u_id from COURSE where l_id =?',
        select_params = _.toArray(temp);              

  let state, tmpTime1 = new Date(),
      tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpTime3 = tmpTime2.toISOString(), 
      currentDate = tmpTime3.substring(0, 10),       // 오늘 날짜를 ISO 형식 날짜로 표현한다. 
      currentTime = tmpTime3.substring(11, 19),     // 현재 시간을 ISO 형식 날짜로 표현한다.                
      update_params = [], absent_params = [], attend_list = [], c_list = [], ab_list = [], absenteeism = [currentDate], attend, topic,
      message = {
        data: { status : 'which num', l_id: l_id },
        topic: topic
      };
  const a_roll_call  = [currentDate, l_id], ld_params = [l_id, currentDate];
  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_query = connection.query(select_sql, select_params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '잘못된 강의 혹은 강의실입니다.' });
          connection.release();
        } else {
          if (rows[0].u_id == u_id && rows[0].u_role === 'prof') { // 검색 결과로 나온 u_id가 요청을 보내온 u_id(해당 강의의 교수)와 같고, role이 prof(교수)라면,
            var select_query2 = connection.query(select_sql2, l_id, function (err, rows2) {
              if (err) {
                connection.release();
                throw err;
              } else {
                if (rows2.length === 0) {                  
                  res.status(400).json({ false: '잘못된 강의이거나 수강 중인 학생이 없는 강의입니다.' });
                  connection.release();
                } else {                  
                  state = rows2[0].state;
                  if (state === '수업 준비 중') {     // 수업 시작하는 경우에는 real_start_time을 현재시간으로 업데이트한다.
                    state = '수업 중';
                  } else if (state === '수업 중') {   // 그 외의 경우에는 real_start_time에 null값을 넣는다.
                    state = '수업 종료';
                    currentTime = null;
                  } else {                           // 그 외의 경우에는 real_start_time에 null값을 넣는다.
                    state = '수업 준비 중';
                    currentTime = null;
                  }
                  update_params.push(state, currentTime, l_id);
                  var update_query = connection.query(update_sql, update_params, function (err, rows3) {
                    if (err) {
                      connection.release();
                      throw err;
                    } else {
                      if (rows3.length === 0) {
                        res.status(400).json({ false: '수업 상태 변경을 실패하였습니다.' });
                        connection.release();
                      } else {
                        // 수업을 시작할 때 첫 1회에 한해 LECTURE_DT에 날짜를 기록.(강의 일자를 남김)
                        if (state === '수업 중') {
                          var ld_select_query = connection.query(ld_select_sql, ld_params, function (err, ld1) {   // 해당 강의의 강의 일자가 이미 db에 있는지 확인
                            if (err) {
                              connection.release();
                              throw err;
                            } else {
                              if (ld1.length === 0) {   // 해당 강의 일자가 없으면 
                                var ld_insert_query = connection.query(ld_insert_sql, ld_params, function (err, ld2) {   // 해당 강의의 강의 일자 추가
                                  if (err) {
                                    connection.release();
                                    throw err;
                                  } else {
                                    if (ld2.length === 0) {   // 강의 일자 등록을 실패하면
                                      res.status(400).json({ false: '강의 일자 등록을 실패하였습니다.' });
                                      connection.release();
                                    } else {                                                                            
                                        res.status(200).json({ success: '수업 상태 변경을 성공하였습니다.' });  // 수업 중인 경우, 강의 일자를 성공적으로 LECTURE_DT에 추가했을 경우
                                      }
                                    }                                    
                                });
                              } else {                                
                                res.status(200).json({ success: '수업 상태 변경을 성공하였습니다.' });  // 수업 중인 경우, 해당 강의일자가 이미 등록되어 있는 경우
                              }
                              ordinaryQuery(connection, find_topic_sql, l_id, function(err, rows4) {
                                if (err) throw err;                                    
                                message.data.status = '2';
                                for (let i=0; i<rows4.length; i++) {
                                  topic = rows4[i].u_id;
                                  message.topic = topic;
                                  fcm.send(message);                                
                                }
                              });
                            }
                          });
                        } else if (state === '수업 종료') {   // 수업 종료 시 아직 출석하지 않은 학생들의 출결상태를 결석으로 일괄처리                    
                          var absent_query = connection.query(call_sql, a_roll_call, function (err, absent1) {
                            if (err) {
                              connection.release();
                              throw err;
                            } else {
                              attend = '결석';
                              absenteeism.push(attend);
                              if (absent1.length === 0) {  // 당일 강의에 학생이 한 명도 오지 않았을 경우. 학생 전원을 결석처리
                                for (let i=0; i<rows2.length; i++) {
                                  absenteeism.push(rows2[i].c_id);                                  
                                  var absent_query = connection.query(ab_insert_sql, absenteeism, function (err, absent2) {
                                    if (err) {
                                      connection.release();
                                      throw err;
                                    } else {
                                      if (absent2.length === 0) {
                                        res.status(400).json({ false: '출석하지 않은 학생들의 처리를 실패하였습니다.' });
                                        connection.release();
                                      }
                                    }
                                  }); absenteeism.pop();
                                }                                                                  
                                res.status(200).json({ success: '수업 상태 변경을 성공하였습니다.' });  //  출석자가 1명도 없는 경우 - 수업 종료 시 수업 상태 종료로 변경
                              } else {    
                                // 이탈 학생 결석 처리                                
                                absent_params.push(l_id, state, currentDate);
                                for (let i = 0; i<absent1.length; i++) {
                                  if (absent1[i].depart == 1) { // 수업 종료 시 이탈 중인 학생을 결석 처리
                                    attend = '결석';
                                    absent_params.unshift(attend);
                                    var absent_query = connection.query(absent_sql, absent_params, function (err, absent2) {
                                      if (err) {
                                        connection.release();
                                        throw err;
                                      } else {
                                        if (absent2.length === 0) {
                                          res.status(400).json({ false: '이탈학생 결석 처리를 실패하였습니다.' });
                                          connection.release();
                                        }
                                      }
                                    });
                                  } absent_params.shift();
                                }
                                /* 수강 신청했지만 당일 출석하지 않은 학생 결석처리(ATTENDANCE 테이블에 해당학생의 출결을 결석으로 INSERT 처리) */
                                for (let i=0; i<rows2.length; i++) {
                                  c_list.push(rows2[i].c_id);
                                }
                                for (let i=0; i<absent1.length; i++) {
                                  attend_list.push(absent1[i].c_id);
                                }
                                ab_list = array_diff(c_list, attend_list);  // 해당 강의를 수강 중인 모든 학생 - 오늘 출석한 학생 = 오늘 결석한 학생(의 c_id)을 할당
                                // 결석처리(ATTENDANCE 테이블에 해당학생의 출결을 결석으로 INSERT 처리)                   
                                for (let i=0; i<ab_list.length; i++) {
                                  absenteeism.push(ab_list[i]);                                  
                                  var absent_query = connection.query(ab_insert_sql, absenteeism, function (err, absent2) {
                                    if (err) {
                                      connection.release();
                                      throw err;
                                    } else {
                                      if (absent2.length === 0) {
                                        res.status(400).json({ false: '출석하지 않은 학생들의 처리를 실패하였습니다.' });
                                        connection.release();
                                      }
                                    }
                                  }); absenteeism.pop();
                                }                                                                  
                                res.status(200).json({ success: '수업 상태 변경을 성공하였습니다.' });  // 수업 종료 시 수업 상태 종료로 변경 및 결석자가 없고  경우
                              }                                                      
                              ordinaryQuery(connection, find_topic_sql, l_id, function(err, rows5) {   // 강의 시작 메시지는 여기서(첫 1회)만 보냄.
                                if (err) throw err;      
                                if (rows5 == 0) {
                                  res.status(400).json({ false: '수업 종료 알림을 실패하였습니다.' });
                                } else {
                                  message.data.status = '3';
                                  for (let i=0; i<rows5.length; i++) {
                                    topic = rows5[i].u_id;
                                    message.topic = topic;
                                    fcm.send(message);
                                  }
                                }
                              });
                              // ============ 수업 종료 알림은 여기서 보냄. 대신, connection.release()도 여기서만 할 것.
                            }
                          });
                        } else {    // 수업 종료 => 수업 준비 중
                          res.status(200).json({ success: '수업 상태 변경을 성공하였습니다.' }); 
                          connection.release();
                        }                                           
                      }
                    }
                  });
                }                
              }
            });
          } else {
            res.status(400).json({ false: '강의 시작 및 종료는 해당 강의의 교수만 할 수 있습니다.' });
            connection.release();
          }
        }
      };
    });
  });
});

// 휴강 처리(교수)(B)
router.put('/class_absence', (req, res) => {
  console.log('휴강 처리');
  const u_id = req.body.u_id, l_id = req.body.l_id,
        find_sql = 'select state from COURSE where l_id = ?;',
        select_sql = 'select u_id, u_role from USER where identifier in (select identifier from LECTURE where l_id = ?)',        
        update_sql = 'update COURSE set state = ?, real_start_time = ? where l_id = ?;';
  let state = '휴강', currentTime = null, update_params = [state, currentTime, l_id];

  pool.getConnection(function (err, connection) {    
    if (err) throw err;
    var find_query = connection.query(find_sql, l_id, function (err, state_info) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (state_info.length === 0) {
          res.status(400).json({ false: '잘못된 강의 데이터 입니다.' });
          connection.release();
        } else {  // 여기
          if (state_info[0].state === '휴강') {
            res.status(400).json({ false: '이미 휴강처리한 강의입니다.' });
            connection.release();
          } else {
            var select_query = connection.query(select_sql, l_id, function (err, rows) {
              if (err) {
                connection.release();
                throw err;
              } else {
                if (rows.length === 0) {
                  res.status(400).json({ false: '잘못된 강의 데이터 입니다.' });
                  connection.release();
                } else {
                  if (rows[0].u_id == u_id && rows[0].u_role === 'prof') { // 검색 결과로 나온 u_id가 요청을 보내온 u_id(해당 강의의 교수)와 같고, role이 prof(교수)라면,
                    var update_query = connection.query(update_sql, update_params, function (err, rows2) {
                      if (err) {
                        connection.release();
                        throw err;
                      } else {                
                        if (rows2.length === 0) {
                          res.status(400).json({ false: '휴강 처리를 실패하였습니다.' });
                          connection.release();
                        } else {                  
                          res.status(200).json({ success: '휴강 처리를 성공하였습니다.' });
                          connection.release();
                          }
                        }
                      });
                  } else {                
                    res.status(400).json({ false: '휴강 처리는 해당 강의의 교수만 할 수 있습니다.' });
                    connection.release();
                  }
                }
              }
            });
          }          
        }
      }
    });    
  });
});

// 강의 상태 조회(B)
router.get('/lecturestate/:u_id/:l_id/:u_role', (req, res) => {
  console.log('강의 상태 조회');
  const u_role = req.params.u_role,
        temp = _.pick(req.params, ['u_id', 'l_id']),
        stu_sql = 'select state from COURSE where u_id = ? and l_id = ?;',
        prof_sql = 'select state from COURSE where l_id in ' +  
                   '(select l_id from LECTURE where l_id = ? and identifier in ' +  
                   '(select identifier from USER where u_id = ?));',                  
        params = _.toArray(temp);

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    if (u_role == 'stu') {
      var query = connection.query(stu_sql, params, function (err, rows) {        
        if (err) {
          connection.release();
          throw err;
        } else {
          if (rows.length === 0) {
            res.status(200).json({ state: '수업 준비 중' });
            // res.status(400).json({ false: '강의 상태 조회에 실패했습니다.' });
            connection.release();
          } else {
            res.status(200).json(rows[0]);   // 학생에게 검색한 강의의 상태를 반환
            connection.release();
          }
        }
      });
    } else if (u_role == 'prof') {
      params.reverse();   // 쿼리에 필요한 파라미터가 역순이기 때문에 배열을 역순으로 정렬한다.
      var query = connection.query(prof_sql, params, function (err, rows) {
        if (err) {
          connection.release();
          throw err;
        } else {
          if (rows.length === 0) {
            res.status(200).json({ state: '수업 준비 중' });
            // res.status(400).json({ false: '강의 상태 조회에 실패했습니다.' });
            connection.release();
          } else {
            res.status(200).json(rows[0]);   // 교수에게 검색한 강의의 상태를 반환
            connection.release();
          }
        }
      });
    }    
  });
});

// 출석(학생)(B)
router.post('/attendance', (req, res) => {
  console.log('출석');
  const c_id = req.body.c_id,
        temp = _.pick(req.body, ['c_id', 'beacon_id']),
        tmpTime1 = new Date(),
        tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpTime3 = tmpTime2.toISOString(), currentTime = tmpTime3.substring(11, 19),      // 현재 시간을 ISO 형식 날짜로 표현한다.
        currentDate = tmpTime3.substring(0, 10),       // 오늘 날짜를 ISO 형식 날짜로 표현한다.          
        select_sql = 'select state, real_start_time, start_time, end_time from COURSE where c_id = ? and l_id IN (select l_id from LECTURE where beacon_id = ?);', // 올바른 강의에 출석하는지 && 비콘아이디가 일치하는지 확인 
        ascertain_sql = 'select * from ATTENDANCE where c_id = ? and a_date = ?;',
        insert_sql = 'insert into ATTENDANCE (a_date, c_id, real_attend_time, attend) values (?,?,?,?);',
        update_dept_sql = 'update ATTENDANCE set depart = ? where c_id = ? and a_date = ?;',
        update_time_sql = 'update ATTENDANCE set real_attend_time = ? where c_id = ? and a_date = ?;',
        select_params = _.toArray(temp), ascertain_params = [c_id, currentDate], 
        insert_params = [currentDate, c_id, currentTime], update_time_params = [currentTime, c_id, currentDate];
  let attend, depart;

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_query = connection.query(select_sql, select_params, function (err, rows) {  
      if (err) {
        connection.release();
        throw err;
      } else if (rows == "") {
        res.status(400).json({ false: '수강ID 혹은 비콘ID가 잘못되었습니다.' });   // body 오류
        connection.release();
      } else if (rows[0].real_start_time === null) {
        if (rows[0].state == '휴강') {
          res.status(400).json({ false: '휴강인 수업입니다.' });    // 수업시간이 아닌 경우 중 휴강인 경우
          connection.release();
        } else {
          res.status(400).json({ false: '수업 시간이 아닙니다.' });   // 수업시간이 아닌 경우 api 요청 시의 처리
          connection.release();
        }        
      } else {
        const realtmp = moment(rows[0].real_start_time, 'hh:mm:ss'), realtmp2 = moment(realtmp).add({ minutes: 1, hours: 9 }),
            realtmp3 = realtmp2.toISOString(), realtime = realtmp3.substring(11, 19),     // 지각 기준시간1(교수가 실제로 강의 시작 후 1분 뒤) 계산
            starttmp = moment(rows[0].start_time, 'hh:mm:ss'), starttmp2 = moment(starttmp).add({ minutes: 1, hours: 9 }),
            starttmp3 = starttmp2.toISOString(), deadline = starttmp3.substring(11, 19);  // 지각 기준시간2(데드라인) 계산 
        if (rows.length === 0) {
          res.status(400).json({ false: '출석할 수 있는 수업이 없습니다.' }); 
          connection.release();
        } else {
          if (rows[0].state === '수업 준비 중') {     // 수업 준비 중 일때 출석하면 출석 대기 중.    
            attend = '출석 대기 중';
          } else if (rows[0].state === '수업 중' && rows[0].real_start_time <= rows[0].start_time) {  // 교수가 실제로 수업을 시작한 시간이 수업 시작시간보다 빠르거나 같을경우.                        
            if (currentTime <= deadline) {           // 현재 시간이 데드라인보다 이르거나 같으면 출석처리
              attend = '출석';
            } else if (currentTime > deadline) {     // 현재 시간이 데드라인보다 늦었으면 지각처리
              attend = '지각';
            }
          } else if (rows[0].state === '수업 중' && rows[0].real_start_time > rows[0].start_time) {  // 교수가 실제로 수업을 시작한 시간이 수업 시작시간보다 늦었을 경우.
            if (currentTime <= realtime) {          // 현재 시간이 교수가 수업을 실제로 시작한 시간 + 1분보다 이하면 출석처리
              attend = '출석';
            } else if (currentTime > realtime) {    // 현재 시간이 교수가 수업을 실제로 시작한 시간 + 1분을 넘었을 경우 지각처리
              attend = '지각';
            }
          } else if (rows[0].state === '수업 종료') {
            attend = '결석';
          }
          insert_params.push(attend);
          var ascertain_query = connection.query(ascertain_sql, ascertain_params, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {   //  요청 날짜 최초 출석 시, DB에 출석 데이터를 저장한다.
                var insert_query = connection.query(insert_sql, insert_params, function (err, rows3) {
                  if (err) {
                    connection.release();
                    throw err;
                  } else {
                    if (rows3.length === 0) {
                      res.status(400).json({ false: '출결 처리를 실패하였습니다.' });
                      connection.release();
                    } else {
                      res.status(200).json({ success: '출결 처리를 성공하였습니다.' });
                      connection.release();
                    }
                  }
                });
              } else {    //  요청 날짜에 이미 출석했지만 이탈 여부 판별을 위해 계속 요청하는 경우
                var update_time_query = connection.query(update_time_sql, update_time_params, function (err, rows4) {
                  // 해당 강의를 수강하는 c_id를 가진 학생들의 real_attend_time을 스케줄이 도는 5초의 시작 시간과 비교해서 
                  if (err) {
                    connection.release();
                    throw err;
                  } else {
                    depart = 0;
                    ascertain_params.unshift(depart);
                    ordinaryQuery(connection, update_dept_sql, ascertain_params, function(err, rows5) {   // 이탈 아닐 시 이탈 여부 업데이트
                      if (err) throw err;      
                      if (rows5 == 0) {
                        res.status(400).json({ false: '이탈 처리 초기화를 실패하였습니다.' });
                      } else {
                        if (err) {
                          throw err;
                        } else {
                          if (rows4.length === 0) {
                            res.status(400).json({ false: '요청 시간 업데이트를 실패하였습니다.' });
                          } else {
                            res.status(200).json({ success: '출결 처리를 성공하였습니다.' });
                          }
                        }    
                      }
                    });
                  }
                });
              }
            }
          });
        }
      }
    });
  });
});

// 출결 수정(교수)(B)
router.put('/revise_attendance', (req, res) => {
  console.log('출결 수정');
  const attend = req.body.attend,
        a_date = req.body.a_date,
        temp = _.pick(req.body, ['identifier', 'l_id']),
        select_sql = 'select c_id from COURSE where identifier = ? and l_id = ?;',
        select_sql2 = 'select * from ATTENDANCE where c_id = ?;',
        update_sql = 'update ATTENDANCE set attend = ? where c_id = ? and a_date = ?;';
  const params = _.toArray(temp);
  let c_id, update_params = [attend];
  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_query = connection.query(select_sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '학번 혹은 강의 아이디가 잘못되었습니다.' });
          connection.release();
        } else {
          c_id = rows[0].c_id;
          update_params.push(rows[0].c_id, a_date);
          var select_query2 = connection.query(select_sql2, c_id, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else if (rows2 == "") {
              res.status(400).json({ false: '해당 강의에 출석하지 않은 학생입니다.' }); //  출결 데이터가 없는 학생에 대한 요청의 처리
              connection.release();
            } else {
              var update_query = connection.query(update_sql, update_params, function (err, rows3) {
                if (err) {
                  connection.release();
                  throw err;
                } else {
                  if (rows3.length === 0) {
                    res.status(400).json({ false: '출결 수정에 실패하였습니다.' });
                    connection.release();
                  } else {
                    res.status(200).json({ success: '출결 수정에 성공하였습니다.' });
                    connection.release();
                  }
                }
              });
            }
          });
        }
      }
    });
  });
});

// 돌아와(교수)(B)
router.post('/comeback', (req, res) => {
  console.log('돌아와!!!');
  const l_id = req.body.l_id,
        temp = _.pick(req.body, ['a_date', 'l_id', 'identifier']), temp2 = _.pick(req.body, ['l_id', 'identifier']),
        sql = 'select depart from ATTENDANCE where a_date = ? and c_id in (select c_id from COURSE where l_id = ? and identifier = ?);',
        find_topic_sql = 'select u_id from COURSE where l_id = ? and identifier = ?;',
        absent_sql = 'select * from ATTENDANCE where a_date = ? and c_id in (select c_id from COURSE where l_id = ? and identifier = ?);',
        params = _.toArray(temp), find_topic_params = _.toArray(temp2);

  let topic;
  let message = { data: { status : '4', l_id: l_id }, topic: topic };

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '출결 상태 조회에 실패했습니다.' }); 
          connection.release();
        } else {
          if (rows[0].depart === 1) {   // 요청한 학생이 이탈 중이라면 메시지 보냄
            ordinaryQuery(connection, find_topic_sql, find_topic_params, function(err, rows2) {   // 이탈 시 이탈 여부 업데이트
              if (err) throw err;      
              if (rows2 == 0) {
                res.status(400).json({ false: '이탈 중인 학생이 아닙니다.' });  // identifier(학생 선택) or l_id 오류
              } else {
                topic = rows2[0].u_id;
                message.topic = topic;
                fcm.send(message);
                schedule.timeout(absent_sql, params); // 10분 타이머 실행
                res.status(200).json({ success: '메시지 전송에 성공하였습니다.' });
              }
            });              
          } else {
            res.status(400).json({ false: '이탈 중인 학생이 아닙니다' });    // identifier(학생 선택) 오류
            connection.release();
          }          
        }
      }
    });
  });
});

// 강제 이탈 처리
router.post('/depart', (req, res) => {
  console.log('이탈');
  const c_id = req.body.c_id,
        update_dept_sql = 'update ATTENDANCE set depart = ? where c_id = ? and a_date = ?;', 
        // test_sql = 'select * from ATTENDANCE where c_id = ?;',
        tmpTime1 = new Date(), tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpTime3 = tmpTime2.toISOString(), currentDate = tmpTime3.substring(0, 10);  // 오늘 날짜를 ISO 형식 날짜로 표현한다.        

  let depart = 1, ascertain_params = [depart, c_id, currentDate];

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(update_dept_sql, ascertain_params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '이탈 처리에 실패했습니다.' }); // c_id 혹은 서버 / DB 오류
          connection.release();
        } else {
          res.status(200).json({ success: '이탈 처리에 성공했습니다.' });
          connection.release();
        }
      }
    });
  });
});

// 출결 통계(교수)(B)
router.get('/prof_statistic/:l_id/:u_role', (req, res) => {
  console.log('교수용 출결 통계');
  const l_id = req.params.l_id, u_role = req.params.u_role,
        date_sql = 'SELECT l_date from LECTURE_DT where l_id = ?;',
        count_sql = 'SELECT ' + 
                      'COUNT(CASE WHEN attend = ? THEN 1 END) attend_cnt, ' +    // 출석 카운트  
                      'COUNT(CASE WHEN attend = ? THEN 1 END) lateness_cnt, ' +  // 지각 카운트
                      'COUNT(CASE WHEN attend = ? THEN 1 END) absence_cnt ' +    // 결석 카운트 
                    'FROM ATTENDANCE where c_id in (select c_id from COURSE where l_id = ?) and a_date = ?;',
        select_stu_sql = 'select u.identifier, u.u_name, u.photo_url from USER u join COURSE c using (u_id) where l_id = ?;', 
        select_attned_sql = 'select identifier, attend from COURSE NATURAL JOIN ATTENDANCE where l_id = ? and a_date = ?;';          
  let date_list = [], count_list = [], attend_list = [], stu_temp = [], stu_list = [], prof_stats = [],
      count_params = ['출석', '지각', '결석', l_id], attend_params = [l_id];    

  pool.getConnection(function (err, connection) {
    if (err) throw err;    
    if (u_role == 'prof') {
      var tasks = [
        function date (callback) {
          connection.query(date_sql, l_id, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) return callback(res.status(400).json({ false: '아직 수업하지 않은 강의입니다.' }));
            else if (rows) {
              for (let i=0; i<rows.length; i++) {
                date_list.push(rows[i].l_date);
              }
            callback(null, date_list);
            }
          });
        },
        function count (date_list, callback) {
          for (let i=0; i<date_list.length; i++) {
            count_params.push(date_list[i]);
            connection.query(count_sql, count_params, function (err, rows) {
              if (err) return callback(err);
              if (rows) count_list.push(rows[0]);         // cnt값 3개를 리스트에 넣음
              if (i == date_list.length-1) {
                callback(null, date_list);      // 다음번 task에서 사용해야하는 값인 date_list를 callback 해줌.
              }              
            });
            count_params.pop();
          }
        },
        function attend (date_list, callback) {
          for (let i=0; i<date_list.length; i++) {
            attend_params.push(date_list[i]);    
            connection.query(select_attned_sql, attend_params, function (err, rows) {
              if (err) return callback(err); 
              if (rows) attend_list.push(rows);         // cnt값 3개를 리스트에 넣음
              if (i == date_list.length-1) {
                callback(null);
              }              
            });
            attend_params.pop();
          }
        }, 
        function (callback) {
          connection.query(select_stu_sql, l_id, function (err, rows) {
            if (err) return callback(err);
            else if (rows) {
              for (let i=0; i<rows.length; i++) {
                stu_temp.push(rows[i]);                
              }
              for (let i=0; i<date_list.length; i++) {
                stu_list.push(stu_temp);                
              }              
            callback(null, stu_list);
            }
          });
        }
      ];
      // Run task 
      async.waterfall(tasks, function (err) {
        if (err)
          console.log('err');
        else {
          // a_date & counts
          for (var i=0; i<date_list.length; i++) {
            let prof_elements = new prof_statistic(date_list[i], count_list[i].attend_cnt, count_list[i].lateness_cnt, count_list[i].absence_cnt);
            prof_stats.push(prof_elements)
          }
          // s_list
          for (let k=0; k<stu_list.length; k++) {       // 출석 데이터를 전부 수강데이터에 적용.
            for (let i=0; i<stu_list[0].length; i++) {
              for (let j=0; j<attend_list[0].length; j++) {
                if (stu_list[k][i].identifier === attend_list[k][j].identifier) {
                  stu_list[k][i].attend = attend_list[k][j].attend;
                  break;
                } else {
                  stu_list[k][i].attend = '결석';
                }
              }
            }
          }
          // prof_stats
          for (let i=0; i<prof_stats.length; i++) {
            prof_stats[i].s_list = stu_list[i];
          }
          console.log('done');                   
          res.status(200).json(prof_stats);
          connection.release();
        }          
      });
    } else {
      res.status(400).json({ false: '잘못된 사용자 요청입니다.' });  // body(u_role) 오류
      connection.release();
    }
  });
});

// 출결 통계(학생)(B)
router.get('/stu_statistic/:u_id/:u_role', (req, res) => {
  console.log('학생용 출결 통계');
  const u_id = req.params.u_id, u_role = req.params.u_role,
        count_lesson_sql = 'SELECT COUNT(*) as total FROM LECTURE_DT where l_id in (select l_id from COURSE where u_id = ?);',   // 해당학생이 듣는 모든 수업횟수 카운트(학기별로 나와야 하지 않나?)
        sum_sql = 'SELECT ' + 
                    'COUNT(CASE WHEN attend = ? THEN 1 END) attend_sum, ' +    // 출석 총합
                    'COUNT(CASE WHEN attend = ? THEN 1 END) lateness_sum, ' +  // 지각 총합
                    'COUNT(CASE WHEN attend = ? THEN 1 END) absence_sum ' +    // 결석 총합
                  'FROM ATTENDANCE where c_id in (select c_id from COURSE where u_id = ?);',
        lecture_sql = 'SELECT l_id, l_name from COURSE where u_id = ?;',   // (해당 학생이 수강하는)강의 리스트 
        count_sql = 'SELECT ' + 
                      'COUNT(CASE WHEN attend = ? THEN 1 END) l_attend_cnt, ' +     // 강의별 출석 카운트  
                      'COUNT(CASE WHEN attend = ? THEN 1 END) l_lateness_cnt, ' +  // 강의별 지각 카운트
                      'COUNT(CASE WHEN attend = ? THEN 1 END) l_absence_cnt  ' +   // 강의별 결석 카운트 
                    'FROM ATTENDANCE where c_id in (select c_id from COURSE where u_id = ? and l_id = ?);',
        stu_attend_sql = 'SELECT a.a_date, c.start_time, c.end_time, a.attend FROM LECTURE_DT ld, COURSE c, ATTENDANCE a ' +
                         'WHERE ld.l_id = c.l_id and c.c_id = a.c_id and ld.l_date = a.a_date and c.l_id = ? and c.u_id = ?;';         // 특정과목에 대한 해당학생의 출결 현황 조회        
  let total_cnt, sum_cnt, stats_temp, statistics, stu_list = {}, lecture_list = [], count_list = [], attend_list = [], l_list = [],
      count_params = ['출석', '지각', '결석', u_id], attend_params = [u_id];    

  pool.getConnection(function (err, connection) {
    if (err) throw err;    
    if (u_role == 'stu') {
      var tasks = [
        function (callback) {   
          connection.query(count_lesson_sql, u_id, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) return callback('통계 실패!!!!');
            else if (rows) {
              total_cnt = rows[0];    // 수강한 모든 수업횟수 카운트값
            callback(null);
            }
          });
        },
        function (callback) {
          connection.query(sum_sql, count_params, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) return callback('통계 실패!!!!');
            else if (rows) {
              sum_cnt = rows[0];      // 해당 학생의 모든 수업에 대한 출석/지각/결석 각각 총합
            callback(null);
            }
          });
        },
        function lecture (callback) {
          connection.query(lecture_sql, u_id, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) return callback('통계 실패!!!!');
            else if (rows) {
              for (let i=0; i<rows.length; i++) {
                lecture_list.push(rows[i]);   // 해당 학생의 수강 강의 리스트(l_id, l_name)
              }
            callback(null, lecture_list);
            }
          });
        },
        function count (lecture_list, callback) {
          for (let i=0; i<lecture_list.length; i++) {
            count_params.push(lecture_list[i].l_id);
            connection.query(count_sql, count_params, function (err, rows) {
              if (err) return callback(err);          
              if (rows) count_list.push(rows[0]);         // cnt값 3개를 리스트에 넣음
              if (i == lecture_list.length-1) {
                callback(null, lecture_list); 
              }              
            });
            count_params.pop();
          }
        },   
        function attend (lecture_list, callback) {
          for (let i=0; i<lecture_list.length; i++) {
            attend_params.unshift(lecture_list[i].l_id);
            connection.query(stu_attend_sql, attend_params, function (err, rows) {
              if (err) return callback(err); 
              if (rows) attend_list.push(rows);         // a_list 용 데이터
              if (i == lecture_list.length-1) {
                callback(null);
              }              
            });
            attend_params.shift();
          }
        }
      ];
      // Run task 
      async.waterfall(tasks, function (err) {
        if (err)
          console.log(err);
        else {
          // 학생의 전체 출결 통계
          stats_temp = (sum_cnt.attend_sum + sum_cnt.lateness_sum - (sum_cnt.lateness_sum/3)) / total_cnt.total;
          if (isNaN(stats_temp)) {
            stats_temp = 0;
          }
          statistics = stats_temp*100 + '%';        
          // attend_list에서 시작시간 ~ 종료시간으로 포맷 만들 것
          for (let i=0; i<attend_list.length; i++) {
            for (let j=0; j<attend_list[i].length; j++) {
              attend_list[i][j].l_time = attend_list[i][j].start_time + ' ~ ' + attend_list[i][j].end_time;
              delete attend_list[i][j].start_time;
              delete attend_list[i][j].end_time;
            }
          }
          // l_list(강의명과 강의별 출결 카운트 및 현황)
          for (let i=0; i<lecture_list.length; i++) {
            let stu_elements = new stu_statistic(lecture_list[i].l_name, count_list[i].l_attend_cnt, count_list[i].l_lateness_cnt, count_list[i].l_absence_cnt, attend_list[i]);
            l_list.push(stu_elements);
          }
          // stu_list 포맷 작성
          stu_list.statistics = statistics;
          stu_list.attend_sum = sum_cnt.attend_sum;
          stu_list.lateness_sum = sum_cnt.lateness_sum;
          stu_list.absence_sum = sum_cnt.absence_sum;
          stu_list.l_list = l_list;
          
          console.log('done');                   
          res.status(200).json(stu_list);
          connection.release();
        }          
      });
    } else {
      res.status(400).json({ false: '잘못된 사용자 요청입니다.' });  // body(u_role) 오류
      connection.release();
    }
  });
});

// 일정 등록(교수)(B)
router.post('/schedule', (req, res) => {
  console.log('일정 등록');
  const temp = _.pick(req.body, ['u_id', 'u_depart', 'sc_day', 'start_date', 'sc_start_time', 'end_date', 'sc_end_time', 'title', 'place', 'schedule']),
        params = _.toArray(temp), u_role = req.body.u_role,
        insert_sql = 'insert into CALENDAR (u_id, u_depart, sc_day, start_date, sc_start_time, end_date, sc_end_time, title, place, schedule) values (?,?,?,?,?,?,?,?,?,?);';
  let sc_id;

  if (u_role === 'prof') {
    pool.getConnection(function (err, connection) {
      if (err) throw err;      
      var tasks = [
        function (callback) {    // 교수가 일정 등록
          connection.query(insert_sql, params, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) {
              return callback(res.status(400).json({ false: '일정 등록을 실패하였습니다.' }));  // body 오류
            } else{
              sc_id = rows.insertId;              
              return callback(null);         
            }
          });
        }
      ];
      // Run task 
      async.waterfall(tasks, function (err) {
        if (err)
          console.log('err');
        else {          
          console.log('done');                   
          res.status(200).json({sc_id, success: '일정을 등록했습니다.' });
          connection.release();
        }          
      });
    });
  } else {
    res.status(400).json({ false: '잘못된 사용자 요청입니다.' });  // body(u_role) 오류    
  }
});

// 일정 조회(B)
router.get('/schedule/:identifier/:sc_id', (req, res) => {
  console.log('일정 조회');
  const identifier = req.params.identifier, sc_id = req.params.sc_id, 
        select_depart_sql1 = 'select u_depart from USER where identifier = ?;',
        select_depart_sql2 = 'select u_depart from CALENDAR where sc_id = ?;',
        select_schedule_sql = 'select sc_day, start_date, sc_start_time, end_date, sc_end_time, title, place, schedule from CALENDAR where sc_id = ?;';
  let schedule_info, u_rows = {}, cl_rows = {};

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var tasks = [
      function (callback) {      // 일정을 수정하려는 교수가 일정을 등록한 교수와 같은 학과인지 확인 
        connection.query(select_depart_sql1, identifier, function (err, rows) {
          if (err) return callback(err);
          if (rows.length == 0) {
            return callback(res.status(400).json({ false: '잘못된 사용자의 요청입니다.' }));  // body 중 identifier 오류
          } else {
            u_rows.u_depart = rows[0].u_depart;
            return callback(null);  
          }
        });
      },
      function (callback) {      // 일정을 수정하려는 교수가 일정을 등록한 교수와 같은 학과인지 확인 
        connection.query(select_depart_sql2, sc_id, function (err, rows) {
          if (err) return callback(err);
          if (rows.length == 0) {
            return callback(res.status(400).json({ false: '존재하지 않는 일정입니다.' }));  // body 중 sc_id 오류
          } else {
            cl_rows.u_depart = rows[0].u_depart;
            return callback(null);  
          }
        });
      },
      function (callback) {     // 일정 조회
        if (u_rows.u_depart == cl_rows.u_depart) {
          connection.query(select_schedule_sql, sc_id, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) {
              return callback(res.status(400).json({ false: '일정 조회에 실패했습니다.' }));  // sc_id 오류
            } else{
              schedule_info = rows[0];
              return callback(null);         
            }
          });
        } else {
          return callback(res.status(400).json({ false: '다른 학과의 일정입니다.' }));
        }        
      }
    ];
    // Run task 
    async.waterfall(tasks, function (err) {
      if (err)
        console.log(err);
      else {          
        console.log('done');                   
        res.status(200).json(schedule_info);
        connection.release();
      }          
    });
  });
});

// 일정 수정(교수)(B)
router.put('/schedule', (req, res) => {
  console.log('일정 수정');
  const temp = _.pick(req.body, ['u_id', 'u_depart', 'sc_day', 'start_date', 'sc_start_time', 'end_date', 'sc_end_time', 'title', 'place', 'schedule', 'sc_id']),
        u_role = req.body.u_role, u_id = req.body.u_id, u_depart = req.body.u_depart, params = _.toArray(temp), 
        select_sql = 'select u_depart from USER where u_id = ?;',
        update_sql = 'update CALENDAR set u_id=?, u_depart=?, sc_day=?, start_date=?, sc_start_time=?, end_date=?, sc_end_time=?, title=?, place=?, schedule=? where sc_id = ?;';

  if (u_role === 'prof') {
    pool.getConnection(function (err, connection) {
      if (err) throw err;      
      var tasks = [
        function (callback) {      // 일정을 수정하려는 교수가 일정을 등록한 교수와 같은 학과인지 확인 
          connection.query(select_sql, u_id, function (err, rows) {
            if (err) return callback(err);
            if (rows[0].u_depart == u_depart) {
              callback(null);
            } else {
              return callback(res.status(400).json({ false: '다른 학과의 일정입니다.' }));
            }
          });
        },
        function (callback) {     // 일정 수정
          connection.query(update_sql, params, function (err, rows) {
            if (err) return callback(err);
            if (rows.length == 0) {
              return callback(res.status(400).json({ false: '일정 수정에 실패했습니다.' }));  // body 오류
            } else{
              return callback(null);         
            }
          });
        }
      ];
      // Run task 
      async.waterfall(tasks, function (err) {
        if (err)
          console.log('err');
        else {          
          console.log('done');                   
          res.status(200).json({ success: '일정을 수정했습니다.'});
          connection.release();
        }          
      });
    });
  } else {
    res.status(400).json({ false: '잘못된 사용자의 요청입니다.' });  // body(u_role) 오류    
  }
});

// 일정 삭제(교수)(B)
router.delete('/schedule', (req, res) => {
  console.log('일정 삭제');
  const u_role = req.headers.u_role, sc_id = req.headers.sc_id, 
        delete_sql = 'delete from CALENDAR where sc_id = ?';   // 선택한 일정을 삭제

  if (u_role === 'prof') {
    pool.getConnection(function (err, connection) {
      if (err) throw err;
      ordinaryQuery(connection, delete_sql, sc_id, function(err, rows) {  // 교수가 일정 등록
        if (err) throw err;      
        else {        
          if (rows == 0) {
            res.status(400).json({ false: '일정 삭제를 실패했습니다.' });
          } else {
            res.status(200).json({ success: '일정을 삭제했습니다.' });
          }
        }    
      });
    });
  } else {
    res.status(400).json({ false: '잘못된 사용자의 요청입니다.' });  // body(u_role) 오류
  }
});

// 월간 일정 조회(B)
router.get('/monthly_schedule/:month/:identifier', (req, res) => {
  console.log('월간 일정 조회');
  const start_date = req.params.month, identifier = req.params.identifier, 
        select_sql = 'select sc_id, start_date, title from CALENDAR where start_date like ' + "'" + start_date + '%' + "'" + 
                     ' and u_depart in (select u_depart from USER where identifier = ?);';    
  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    ordinaryQuery(connection, select_sql, identifier, function(err, rows) {  // 교수가 일정 등록
      if (err) throw err;      
      else {        
        if (rows == 0) {
          res.status(400).json({ false: '월간 일정 조회를 실패했습니다.' });
        } else {
          res.status(200).json(rows);
        }
      }    
    });
  });
});

// ================== statistic helper function ================== //

// normal query
const ordinaryQuery = (connection, sql, params, callback) => {
  connection.query(sql, params, function (err, rows) {
    if (err) {
      callback(err, null);  
      connection.release();
      throw err;
    } else {
      if (rows.length === 0) {
        callback(null, 0);          
        connection.release();
      } else {
        callback(null, rows);
        connection.release();        
      }
    }    
  });
}

// 배열 간의 차집합 연산
const array_diff = (a, b) => {
  var tmp={}, res=[];
  for(var i=0;i<a.length;i++) tmp[a[i]]=1;
  for(var i=0;i<b.length;i++) { if(tmp[b[i]]) delete tmp[b[i]]; }
  for(var k in tmp) res.push(k);
  return res;
}

// 교수 통계 데이터 포맷용 class
class prof_statistic {
  constructor(a_date, attend_cnt, lateness_cnt, absence_cnt) {
    this.a_date = a_date;
    this.attend_cnt = attend_cnt;
    this.lateness_cnt = lateness_cnt;
    this.absence_cnt = absence_cnt;
  }
}

// 학생 통계 데이터 포맷용 class
class stu_statistic {
  constructor(l_name, l_attend_cnt, l_lateness_cnt, l_absence_cnt, a_list) {
    this.l_name = l_name;
    this.l_attend_cnt = l_attend_cnt;
    this.l_lateness_cnt = l_lateness_cnt;
    this.l_absence_cnt = l_absence_cnt;
    this.a_list = a_list;
  }
}

module.exports = router;
