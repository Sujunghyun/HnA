
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const fcm = require('../util/fcm');
const _ = require('lodash');

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

module.exports = router;