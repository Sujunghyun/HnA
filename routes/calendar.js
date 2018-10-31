
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const _ = require('lodash');
const async = require('async');

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
						} else {
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
					res.status(200).json({ sc_id, success: '일정을 등록했습니다.' });
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
						} else {
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
						} else {
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
					res.status(200).json({ success: '일정을 수정했습니다.' });
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
			ordinaryQuery(connection, delete_sql, sc_id, function (err, rows) {  // 교수가 일정 등록
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
		ordinaryQuery(connection, select_sql, identifier, function (err, rows) {  // 교수가 일정 등록
			if (err) throw err;
			else {
				if (rows == 0) {
					res.status(200).json({ success: '' });
				} else {
					res.status(200).json(rows);
				}
			}
		});
	});
});

// ================== class declare ================== //

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

module.exports = router;