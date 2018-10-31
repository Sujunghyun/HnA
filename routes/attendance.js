
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const fcm = require('../util/fcm');
const schedule = require('../util/schedule');
const _ = require('lodash');
const moment = require('moment');

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
                for (let i = 0; i < stu_list.length; i++) {
                  stu_list[i].attend = '';
                  stu_list[i].real_attend_time = '';
                  stu_list[i].depart = 0;
                }
                res.status(200).json(stu_list);      // 출결데이터 없는 경우. attend 데이터에 빈 값을 할당해 전달
                connection.release();
              } else {                 // 출결데이터 있는 경우. identifier를 비교해 stu_list에 attend_list 추가시킨 후 전달
                for (let i = 0; i < stu_list.length; i++) {
                  for (let j = 0; j < attend_list.length; j++) {
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
  let message = { data: { status: '4', l_id: l_id }, topic: topic };

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
            ordinaryQuery(connection, find_topic_sql, find_topic_params, function (err, rows2) {   // 이탈 시 이탈 여부 업데이트
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
										ordinaryQuery(connection, update_dept_sql, ascertain_params, function (err, rows5) {   // 이탈 아닐 시 이탈 여부 업데이트
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
