// 완료(A), 일단완료(B)  전체적으로 인증로직, 에러처리 보완필요, promise 적용, 리팩토링

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
    let uid = req.body.uid,
        sql = 'select * from USER where u_id = ?';     
    pool.getConnection(function(err, connection) {
        if (err) throw err;        
        var query = connection.query(sql, uid, function(err, rows) {
            if (err) {
            // connection pool을 이용하는 경우, 사용이 끝나면 pool을 반환해줘야함.
                connection.release();
                throw err;
            } else {
                if (rows.length === 0) {
                    res.redirect('./signup');
                    connection.release();
                } else {
                    if (rows[0].U_ROLE === 'stu') {
                        res.status(200).json('수강과목 리스트');
                        connection.release();
                    } else {
                        res.status(200).json('개설강의 리스트');
                        connection.release();
                    }
                }
            }
        });
    });
});

// 회원가입(B)
router.post('/signup', (req, res) => { 
    let role = req.body.role;
    console.log(role);
    
    // 학생일 경우, 학번과 학년을 추가적으로 받는다.
    if (role == 'stu') {
        /* 제어문 바깥으로 변수값을 가져가기 위해(스코프 조정을 위해) 여기서만 변수를 var로 선언한다.
           _.pick로 파라미터 정리 */
        var temp = _.pick(req.body, ['uid', 'uname', 'department', 'student_id', 'grade', 'photo_url', 'role']),
        sql = 'insert into USER (u_id, u_name, department, student_id, grade, photo_url, u_role) values (?,?,?,?,?,?,?);' 
    } else {
        var temp = _.pick(req.body, ['uid', 'uname', 'department', 'photo_url', 'role']),
        sql = 'insert into USER (u_id, u_name, department, photo_url, u_role) values (?,?,?,?,?);'    
    }
    // _.toArray로 타입을 Array로 변경. query 시 필요
    const params = _.toArray(temp);
    console.log(params);
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, params, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '회원가입에 실패하였습니다.'});
                    connection.release();
                } else {
                    res.status(200).json({success: '회원가입에 성공하였습니다.'});
                    connection.release();
                }
            }
        });
    });
});

// 강의개설(교수)(B)
router.post('/openlecture', (req, res) => {
    // _.pick로 파라미터 정리
    const temp = _.pick(req.body, ['l_name', 'l_room', 'l_grade', 'l_semester', 'l_day', 'prof_name', 'class', 'start_time', 'end_time', 'supplement']),
          sql = 'insert into LECTURE (l_name, l_room, l_grade, l_semester, l_day, prof_name, class, start_time, end_time, supplement) values (?,?,?,?,?,?,?,?,?,?);'
    // _.toArray로 타입을 Array로 변경. query 시 필요
    const params = _.toArray(temp);
    console.log(params);
    
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, params, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '강의개설에 실패하였습니다.'});
                    connection.release();
                } else {
                    res.status(200).json({success: '강의개설에 성공하였습니다.'});
                    connection.release();
                }
            }
        });
    });    
});

// 개설 강의 조회(학생)(B) 
router.get('/checklecture/:l_grade/:l_semester', (req, res) => {
    const temp = _.pick(req.params, ['l_grade', 'l_semester']),
          sql = 'select * from LECTURE where l_grade = ? and l_semester = ?;'    
    const params = _.toArray(temp);
    console.log(params);
    
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, params, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '개설된 강의가 없습니다.'});
                    connection.release();
                } else {
                    res.status(200).json(rows);   // 개설 강의 리스트
                    connection.release();
                }
            }
        });
    });    
});

// 수강신청(학생)(B)
router.post('/register', (req, res) => {
    const temp = _.pick(req.body, ['u_id', 'l_id']),
          select_sql = 'select u_name, student_id, l_name, start_time, end_time from USER, LECTURE where  u_id = ? and l_id = ?;',
          insert_sql = 'insert into COURSE (u_id, l_id, u_name, student_id, l_name, start_time, end_time) values (?,?,?,?,?,?,?);'
    const params1 = _.toArray(temp);

    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var select = connection.query(select_sql, params1, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '강의 조회에 실패하였습니다.'});  // u_id or l_id 오류
                    connection.release();
                } else {                    
                    const params2 = _.toArray(rows[0]);
                    const params3 = [...params1, ...params2];
                    console.log(params3);
                    var insert = connection.query(insert_sql, params3, function(err, rows2) {
                        if (err) {
                            connection.release();
                            throw err;   
                        } else {
                            if (rows2.length === 0) {
                                res.status(400).json({false: '수강신청에 실패하였습니다.'});  // params3 오류
                                connection.release();
                            } else {
                                res.status(200).json({success: '수강신청에 성공하였습니다.'});
                                connection.release();
                            }
                        }
                    });                    
                }
            }
        });
    });    
});

// 강의정보 조회(교수)(B)
router.get('/courseinfo/:l_id/', (req, res) => {
    const l_id = req.params.l_id,
          sql = 'select * from LECTURE where l_id = ?;'
    
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, l_id, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '강의정보 조회에 실패했습니다.'});
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
router.get('/rollbook/:c_id/', (req, res) => {
    const c_id = req.params.c_id,
          sql = 'select student_id, u_name from COURSE where c_id = ?;'
    
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, c_id, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '강의정보 조회에 실패했습니다.'});
                    connection.release();
                } else {
                    res.status(200).json(rows);   // 해당 강의를 듣는 학생들의 학번과 이름을 반환
                    connection.release();
                }
            }
        });
    });    
});

// beacon 등록/수정 기능(교수)(B)
router.put('/reg_beacon', (req, res) => {
    const beacon_id = req.body.beacon_id,
          sql = 'update COURSE set beacon_id = ?;'
    
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, beacon_id, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: 'beacon 등록에 실패하였습니다.'});
                    connection.release();
                } else {
                    res.status(200).json({success: 'beacon 등록에 성공하였습니다.'});
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

    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var select_query = connection.query(select_sql, select_params, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '잘못된 강의 혹은 강의실입니다.'});
                    connection.release();
                } else {
                    if (rows[0].u_id == u_id && rows[0].u_role === 'prof') { // 검색 결과로 나온 u_id가 요청을 보내온 u_id(해당 강의의 교수)와 같고, role이 prof(교수)라면,
                        var select_query2 = connection.query(select_sql2, c_id, function(err, rows2) {
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
                                var update_query = connection.query(update_sql, update_params, function(err, rows3) {
                                    if (err) {
                                        connection.release();
                                        throw err;   
                                    } else {
                                        if (rows.length === 0) {
                                            res.status(400).json({false: '잘못된 강의 혹은 강의실입니다.'});
                                            connection.release();
                                        } else {
                                            res.status(200).json({success: '수업 상태 변경을 성공하였습니다.'});
                                            connection.release();
                                        }
                                    }                        
                                }); 
                            }   
                        });             
                    } else {
                        res.status(400).json({false: '강의 시작 및 종료는 해당 강의의 교수만 할 수 있습니다.'});
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
    
    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var query = connection.query(sql, params, function(err, rows) {
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '강의 상태 조회에 실패했습니다.'});
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
          insert_sql = 'insert into ATTENDENCE (a_date, c_id, attend) values (?,?,?);',
          select_params = _.toArray(temp), insert_params = [currentDate, c_id];
    let attend;

    pool.getConnection(function(err, connection) {
        if (err) throw err;
        var select_query = connection.query(select_sql, select_params, function(err, rows) {
            const realtmp = moment(rows[0].real_start_time, 'hh:mm:ss'), realtmp2 = moment(realtmp).add({minutes:1, hours:9}), 
                  realtmp3 = realtmp2.toISOString(), realtime = realtmp3.substring(11, 19),     // 지각 기준시간1(교수가 실제로 강의 시작 후 1분 뒤) 계산
                  starttmp = moment(rows[0].start_time, 'hh:mm:ss'), starttmp2 = moment(starttmp).add({minutes:1, hours:9}), 
                  starttmp3 = starttmp2.toISOString(), deadline = starttmp3.substring(11, 19);  // 지각 기준시간2(데드라인) 계산 
            if (err) {
                connection.release();
                throw err;   
            } else {
                if (rows.length === 0) {
                    res.status(400).json({false: '수강ID 혹은 비콘ID가 잘못되었습니다.'});
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
                    var insert_query = connection.query(insert_sql, insert_params, function(err, rows2) {
                        res.status(200).json({success: '출결처리를 성공하였습니다.'});
                        connection.release();
                    });              
                }
            }
        });
    });
});


module.exports = router;
