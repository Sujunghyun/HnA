
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const fcm = require('../util/fcm');
const _ = require('lodash');
const moment = require('moment');

// 강의개설(교수)(B)
router.post('/lecture', (req, res) => {
  console.log('강의개설');
  // _.pick로 파라미터 정리
  const temp = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'l_class', 'identifier', 'prof_name', 'start_time', 'end_time', 'supplement']),        
        temp2 = _.pick(req.body, ['l_name', 'l_grade', 'l_semester', 'l_class', 'l_day']),
  // _.toArray로 타입을 Array로 변경. query 시 필요
        params = _.toArray(temp), params2 = _.toArray(temp2), supplement = req.body.supplement,
        insert_sql = 'insert into LECTURE (l_name, l_room, l_grade, l_semester, l_day, l_class, identifier, prof_name, start_time, end_time, supplement) values (?,?,?,?,?,?,?,?,?,?,?);',
        find_sql = 'select supplement from LECTURE where l_name = ? and l_grade = ? and l_semester = ? and l_class = ? and l_day = ?;';      
  let l_id;
  
  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var find_query = connection.query(find_sql, params2, function (err, rows) {   // 다같아도 요일이 다르면 개설되도록 수정
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
                l_id = rows2.insertId;
                res.status(200).json({ l_id, success: '강의개설에 성공하였습니다.' });
                connection.release();                       
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
router.get('/lecture/:l_id', (req, res) => {
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
    data: { status: '1', l_id: l_id },
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
                            for (let i = 0; i < rows.length; i++) {
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
    data: { status: '0', l_id: l_id, l_room: l_room, beacon_id: beacon_id },
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
              for (let i = 0; i < rows.length; i++) {
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

// 강의 상태 조회(B)
router.get('/lecture_status/:u_id/:l_id/:u_role', (req, res) => {
	console.log('강의 상태 조회');
	const u_role = req.params.u_role, temp = _.pick(req.params, ['l_id', 'u_id']), params = _.toArray(temp);
  let sql;

  if (u_role == 'stu') {
    sql = 'select state from COURSE where l_id = ? and u_id = ?;';
  } else if (u_role == 'prof') {
    sql = 'select state from COURSE where l_id in '
    + '(select l_id from LECTURE where l_id = ? and identifier in '
    + '(select identifier from USER where u_id = ?));';
  }

  pool.getConnection(function (err, connection) {
    if (err) throw err;
    var query = connection.query(sql, params, function (err, rows) {
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
  });
});

// 강의 상태 변경(교수)(B) - 해당 강의(l_id)를 듣는 모든 수강의 수업 상태가 변경됨. 
router.put('/lecture_status', (req, res) => {
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
    ld_insert_sql = 'insert into LECTURE_DT (l_id, l_date) values (?,?);',
    ab_insert_sql = 'insert into ATTENDANCE (a_date, attend, c_id) values (?,?,?);',
    find_topic_sql = 'select u_id from COURSE where l_id =?',
    select_params = _.toArray(temp);

  let state, tmpTime1 = new Date(),
    tmpTime2 = moment(tmpTime1).add(9, 'hours'), tmpTime3 = tmpTime2.toISOString(),
    currentDate = tmpTime3.substring(0, 10),       // 오늘 날짜를 ISO 형식 날짜로 표현한다. 
    currentTime = tmpTime3.substring(11, 19),     // 현재 시간을 ISO 형식 날짜로 표현한다.                
    update_params = [], absent_params = [], attend_list = [], c_list = [], ab_list = [], absenteeism = [currentDate], attend, topic,
    message = {
      data: { status: 'which num', l_id: l_id },
      topic: topic
    };
  const a_roll_call = [currentDate, l_id], ld_params = [l_id, currentDate];

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
                              ordinaryQuery(connection, find_topic_sql, l_id, function (err, rows4) {
                                if (err) throw err;
                                message.data.status = '2';
                                for (let i = 0; i < rows4.length; i++) {
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
                                for (let i = 0; i < rows2.length; i++) {
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
                                for (let i = 0; i < absent1.length; i++) {
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
                                for (let i = 0; i < rows2.length; i++) {
                                  c_list.push(rows2[i].c_id);
                                }
                                for (let i = 0; i < absent1.length; i++) {
                                  attend_list.push(absent1[i].c_id);
                                }
                                ab_list = array_diff(c_list, attend_list);  // 해당 강의를 수강 중인 모든 학생 - 오늘 출석한 학생 = 오늘 결석한 학생(의 c_id)을 할당
                                // 결석처리(ATTENDANCE 테이블에 해당학생의 출결을 결석으로 INSERT 처리)                   
                                for (let i = 0; i < ab_list.length; i++) {
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
                              ordinaryQuery(connection, find_topic_sql, l_id, function (err, rows5) {   // 강의 시작 메시지는 여기서(첫 1회)만 보냄.
                                if (err) throw err;
                                if (rows5 == 0) {
                                  res.status(400).json({ false: '수업 종료 알림을 실패하였습니다.' });
                                } else {
                                  message.data.status = '3';
                                  for (let i = 0; i < rows5.length; i++) {
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
router.put('/lecture_cancelled', (req, res) => {
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

// ================== helper function ================== //

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
  var tmp = {}, res = [];
  for (var i = 0; i < a.length; i++) tmp[a[i]] = 1;
  for (var i = 0; i < b.length; i++) { if (tmp[b[i]]) delete tmp[b[i]]; }
  for (var k in tmp) res.push(k);
  return res;
}

module.exports = router;