// 완료(A), 일단완료(B)  전체적으로 인증로직(기존 유저인지, 소셜 로그인 로직 처리할 수 있는지 알아보기), 에러처리 보완필요, promise 적용, 리팩토링

'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool')
const _ = require('lodash');
const moment = require('moment');

// uid랑 email받아서 email을 id처럼 사용. 
// uid를 facebook이나 google에 보내서 정상적인 사용자인지 확인

// 로그인(B)
router.post('/login', (req, res) => {
  const u_id = req.body.u_id,
    select_sql = 'select * from USER where u_id = ?;',
    stu_sql = 'select * from LECTURE where l_id in (select l_id from COURSE where u_name = ?);',
    prof_sql = 'select * from LECTURE where prof_name = ?;';
  let u_name, isExisted, user_info = [];
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
          u_name = rows[0].u_name;
          if (rows[0].u_role === 'stu') {
            // 해당 유저가 학생이라면 해당 유저가 수강하는 강의리스트를 보여준다.
            var stu_query = connection.query(stu_sql, u_name, function (err, lecture_list) {
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
            var prof_query = connection.query(prof_sql, u_name, function (err, lecture_list) {
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
  let u_role = req.body.u_role;
  // 학생일 경우, 학번과 학년을 추가적으로 받는다.
  if (u_role == 'stu') {
    /* 제어문 바깥으로 변수값을 가져가기 위해(스코프 조정을 위해) 여기서만 변수를 var로 선언한다.
       _.pick로 파라미터 정리 */
    var temp = _.pick(req.body, ['u_id', 'u_name', 'u_depart', 'identifier', 'grade', 'photo_url', 'u_role']),
      sql = 'insert into USER (u_id, u_name, u_depart, identifier, grade, photo_url, u_role) values (?,?,?,?,?,?,?);'
  } else {
    var temp = _.pick(req.body, ['u_id', 'u_name', 'u_depart', 'identifier', 'photo_url', 'u_role']),
      sql = 'insert into USER (u_id, u_name, u_depart, identifier, photo_url, u_role) values (?,?,?,?,?,?);'
  }
  // _.toArray로 타입을 Array로 변경. query 시 필요
  const params = _.toArray(temp);

  pool.getConnection(function (err, connection) {
    if (err) throw err;
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
  });
});

// 강의개설(교수)(B)
router.post('/openlecture', (req, res) => {
  // _.pick로 파라미터 정리
  const temp = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'l_class', 'prof_name', 'start_time', 'end_time', 'supplement']),
        temp2 = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'l_class', 'prof_name', 'supplement']),
        insert_sql = 'insert into LECTURE (l_name, l_room, l_grade, l_semester, l_day, l_class, prof_name, start_time, end_time, supplement) values (?,?,?,?,?,?,?,?,?,?);',
        select_sql = 'select l_id from LECTURE where l_name = ? and l_room = ? and l_grade = ? and l_semester = ? and l_day = ? and l_class = ? and prof_name = ? and supplement = ?;',
  // _.toArray로 타입을 Array로 변경. query 시 필요
        params = _.toArray(temp),
        params2 = _.toArray(temp2);
  let l_id;

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var insert_query = connection.query(insert_sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '강의개설에 실패하였습니다.' });
          connection.release();
        } else {
          var select_query = connection.query(select_sql, params2, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                res.status(400).json({ false: '개설한 강의정보 반환을 실패하였습니다.' });
                connection.release();
              } else {
                l_id = rows2[0].l_id;
                res.status(200).json({ l_id, success: '강의개설에 성공하였습니다.' });
                connection.release();
              }
            }
          });          
        }
      }
    });
  });
});

// 개설 강의 조회(학생)(B) 
router.get('/checklecture/:l_grade/:l_semester', (req, res) => {
  const temp = _.pick(req.params, ['l_grade', 'l_semester']),
    sql = 'select * from LECTURE where l_grade = ? and l_semester = ?;',
    confirm_sql = 'select l_id from LECTURE NATURAL JOIN COURSE where l_grade = ? and l_semester = ?;',
    params = _.toArray(temp);
  let l_id = [], fsdaf;

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '개설된 강의가 없습니다.' });
          connection.release();
        } else {
          var query = connection.query(confirm_sql, params, function (err, rows2) {
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
                  l_id.push(rows2[0].l_id)
                }
                for (let i=0; i<rows.length; i++) {       
                  for (let j=0; j<l_id.length; j++) {
                    if (rows[i].l_id == l_id[j]) { // 개설 강의 리스트의 id와 수강 중인 강의 리스트의 id를 비교해서 같다면, 즉 강의 리스트 중 수강 중인 과목이라면
                      // rows[i] 과목에 수강여부 flag 부여
                      rows[i].isTaken = true;
                    } else 
                      rows[i].isTaken = false;
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
  const temp = _.pick(req.body, ['u_id', 'l_id']),
    select_sql = 'select u_name, identifier, l_name, start_time, end_time from USER, LECTURE where  u_id = ? and l_id = ?;',
    insert_sql = 'insert into COURSE (u_id, l_id, u_name, identifier, l_name, start_time, end_time) values (?,?,?,?,?,?,?);'
  const params1 = _.toArray(temp);

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
          console.log(params3);
          var insert = connection.query(insert_sql, params3, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows2.length === 0) {
                res.status(400).json({ false: '수강 신청에 실패하였습니다.' });  // params3 오류
                connection.release();
              } else {
                res.status(200).json({ success: '수강 신청에 성공하였습니다.' });
                connection.release();
              }
            }
          });
        }
      }
    });
  });
});

// 강의 정보 조회(교수)(B)
router.get('/course_info/:l_id', (req, res) => {
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

// 출석부 조회(교수)(B) - 해당 강의를 듣는 학생의 리스트를 조회한다.
router.get('/rollbook/:c_id/:a_date', (req, res) => {
  const temp = _.pick(req.params, ['c_id', 'a_date']),
    c_id = req.params.c_id,
    sql = 'select u.identifier, u.u_name, u.photo_url, a.attend from USER u ' +
      'join COURSE c using (u_id) ' +
      'join ATTENDANCE a using (c_id) ' +
      'where c_id = ? and a_date = ?';
  const params = _.toArray(temp);
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '학생 리스트 조회에 실패했습니다.' });
          connection.release();
        } else {
          res.status(200).json(rows);   // 해당 강의를 듣는 학생들의 학번과 이름을 반환
          connection.release();
        }
      }
    });
  });
});

// beacon 등록/수정 기능(교수)(B)  비콘 등록 시 l_id가 같은 COURSE의 모든 beacon_id 값이 변경되어야 함.
router.put('/reg_beacon', (req, res) => {
  const temp = _.pick(req.body, ['beacon_id', 'l_id']),
    sql = 'update COURSE set beacon_id = ? where l_id = ?;';
  const params = _.toArray(temp);

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
          res.status(200).json({ success: 'beacon 등록에 성공하였습니다.' });
          connection.release();
        }
      }
    });
  });
});

// 수업 상태 변경(교수)(B)
router.put('/lecture', (req, res) => {
  const u_id = req.body.u_id,
    c_id = req.body.c_id,
    temp = _.pick(req.body, ['c_id', 'beacon_id']),
    select_sql = 'select u_id, u_role from USER where u_name in' + // u_name이 prof_name과 같은지 확인하고, 
      '(select prof_name from LECTURE where l_id in (select l_id from COURSE where c_id =? and beacon_id = ?));',  // c_id와 beacon_id가 올바른지 확인한다.          
    select_sql2 = 'select state from COURSE where c_id = ?',
    update_sql = 'update COURSE set state = ?, real_start_time = ?;';
  const select_params = _.toArray(temp);
  let state, tmpTime1 = new Date(),
    tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpTime3 = tmpTime2.toISOString(), currentTime = tmpTime3.substring(11, 19);     // 현재 시간을 ISO 형식 날짜로 표현한다.          
  let update_params = [];

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
            var select_query2 = connection.query(select_sql2, c_id, function (err, rows2) {
              if (err) {
                connection.release();
                throw err;
              } else {
                state = rows2[0].state;
                if (state === '수업 준비 중') {     // 수업 시작하는 경우에는 real_start_time을 현재시간으로 업데이트한다.
                  state = '수업 중';
                } else if (state === '수업 중') {   // 그 외의 경우에는 real_start_time에 null값을 넣는다.
                  state = '수업 종료';
                  currentTime = null;
                } else {                            // 그 외의 경우에는 real_start_time에 null값을 넣는다.
                  state = '수업 준비 중';
                  currentTime = null;
                }
                update_params.push(state, currentTime);
                console.log(update_params);
                var update_query = connection.query(update_sql, update_params, function (err, rows3) {
                  if (err) {
                    connection.release();
                    throw err;
                  } else {
                    if (rows.length === 0) {
                      res.status(400).json({ false: '수업 상태 변경을 실패하였습니다.' });
                      connection.release();
                    } else {
                      res.status(200).json({ success: '수업 상태 변경을 성공하였습니다.' });
                      connection.release();
                    }
                  }
                });
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

// 강의 상태 조회(학생)(B)
router.get('/lecturestate/:u_id/:l_id', (req, res) => {
  const temp = _.pick(req.params, ['u_id', 'l_id']),
    sql = 'select state from COURSE where  u_id = ? and l_id = ?;'
  const params = _.toArray(temp);

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '강의 상태 조회에 실패했습니다.' });
          connection.release();
        } else {
          res.status(200).json(rows[0]);   // 유저 아이디(학생)와 강의 아이디로 검색한 강의의 상태를 반환
          connection.release();
        }
      }
    });
  });
});

// 출석(학생)(B)
router.post('/attendance', (req, res) => {
  const c_id = req.body.c_id,
    temp = _.pick(req.body, ['c_id', 'beacon_id']),
    tmpTime1 = new Date(),
    tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpTime3 = tmpTime2.toISOString(), currentTime = tmpTime3.substring(11, 19),      // 현재 시간을 ISO 형식 날짜로 표현한다.
    currentDate = tmpTime3.substring(0, 10),       // 오늘 날짜를 ISO 형식 날짜로 표현한다.          
    select_sql = 'select state, real_start_time, start_time, end_time from COURSE where c_id = ? and beacon_id = ?', // 올바른 강의에 출석하는지 && 비콘아이디가 일치하는지 확인 
    insert_sql = 'insert into ATTENDANCE (a_date, c_id, attend) values (?,?,?);',
    select_params = _.toArray(temp), insert_params = [currentDate, c_id];
  let attend;

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_query = connection.query(select_sql, select_params, function (err, rows) {
      const realtmp = moment(rows[0].real_start_time, 'hh:mm:ss'), realtmp2 = moment(realtmp).add({ minutes: 1, hours: 9 }),
        realtmp3 = realtmp2.toISOString(), realtime = realtmp3.substring(11, 19),     // 지각 기준시간1(교수가 실제로 강의 시작 후 1분 뒤) 계산
        starttmp = moment(rows[0].start_time, 'hh:mm:ss'), starttmp2 = moment(starttmp).add({ minutes: 1, hours: 9 }),
        starttmp3 = starttmp2.toISOString(), deadline = starttmp3.substring(11, 19);  // 지각 기준시간2(데드라인) 계산 
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '수강ID 혹은 비콘ID가 잘못되었습니다.' });
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
          var insert_query = connection.query(insert_sql, insert_params, function (err, rows2) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows.length === 0) {
                res.status(400).json({ false: '출결 처리를 실패하였습니다.' });
                connection.release();
              } else {
                res.status(200).json({ success: '출결 처리를 성공하였습니다.' });
                connection.release();
              }
            }
          });
        }
      }
    });
  });
});

// 출결 수정(교수)(B) -- 날짜 데이터 필요 (포맷은 YYYY-MM-DD)
router.put('/revise_attendance', (req, res) => {
  const attend = req.body.attend,
    a_date = req.body.a_date,
    temp = _.pick(req.body, ['u_id', 'l_id']),
    select_sql = 'select c_id from COURSE where u_id = ? and l_id = ?;',
    update_sql = 'update ATTENDANCE set attend = ? where c_id = ? and a_date = ?;';
  const params = _.toArray(temp);
  let update_params = [attend];

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var select_query = connection.query(select_sql, params, function (err, rows) {
      if (err) {
        connection.release();
        throw err;
      } else {
        if (rows.length === 0) {
          res.status(400).json({ false: '유저 아이디 혹은 강의 아이디가 잘못되었습니다.' });
          connection.release();
        } else {
          update_params.push(rows[0].c_id, a_date);
          var update_query = connection.query(update_sql, update_params, function (err, rows) {
            if (err) {
              connection.release();
              throw err;
            } else {
              if (rows.length === 0) {
                res.status(400).json({ false: '출결 수정에 실패하였습니다.' });
                connection.release();
              } else {
                res.status(200).json({ success: '출결 수정에 성공하였습니다.' });
                connection.release();
              }
            }
          });
        }
      }
    });
  });
});

// 출결 데이터(통계) 조회(교수)(B)
/* 유저 아이디(필요), 강의 아이디를 받아서 해당 유저가 교수인지 학생인지를 판단해
   1. 해당 강의 수강학생들의 주차별 출결 리스트와 출결 통계를 보여줌(교수)
   2. 해당 강의의 출결 데이터를 보여줌(학생) */
// router.get('/statistic/:u_id/:l_id', (req, res) => {
//     const  = ,
//           sql = 'select identifier, u_name from COURSE where c_id = ?;'

//     pool.getConnection(function(err, connection) {
//         if (err) throw err;
//         var query = connection.query(sql, , function(err, rows) {
//             if (err) {
//                 connection.release();
//                 throw err;   
//             } else {
//                 if (rows.length === 0) {
//                     res.status(400).json({false: '강의정보 조회에 실패했습니다.'});
//                     connection.release();
//                 } else {
//                     res.status(200).json(rows);   // 해당 강의를 듣는 학생들의 학번과 이름을 반환
//                     connection.release();
//                 }
//             }
//         });
//     });    
// });


module.exports = router;
