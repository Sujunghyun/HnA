
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool');
const async = require('async');

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
				function date(callback) {
					connection.query(date_sql, l_id, function (err, rows) {
						if (err) return callback(err);
						if (rows.length == 0) return callback(res.status(400).json({ false: '아직 수업하지 않은 강의입니다.' }));
						else if (rows) {
							for (let i = 0; i < rows.length; i++) {
								date_list.push(rows[i].l_date);
							}
							callback(null, date_list);
						}
					});
				},
				function count(date_list, callback) {
					for (let i = 0; i < date_list.length; i++) {
						count_params.push(date_list[i]);
						connection.query(count_sql, count_params, function (err, rows) {
							if (err) return callback(err);
							if (rows) count_list.push(rows[0]);         // cnt값 3개를 리스트에 넣음
							if (i == date_list.length - 1) {
								callback(null, date_list);      // 다음번 task에서 사용해야하는 값인 date_list를 callback 해줌.
							}
						});
						count_params.pop();
					}
				},
				function attend(date_list, callback) {
					for (let i = 0; i < date_list.length; i++) {
						attend_params.push(date_list[i]);
						connection.query(select_attned_sql, attend_params, function (err, rows) {
							if (err) return callback(err);
							if (rows) attend_list.push(rows);         // cnt값 3개를 리스트에 넣음
							if (i == date_list.length - 1) {
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
							for (let i = 0; i < rows.length; i++) {
								stu_temp.push(rows[i]);
							}
							for (let i = 0; i < date_list.length; i++) {
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
					for (var i = 0; i < date_list.length; i++) {
						let prof_elements = new prof_statistic(date_list[i], count_list[i].attend_cnt, count_list[i].lateness_cnt, count_list[i].absence_cnt);
						prof_stats.push(prof_elements)
					}
					// s_list
					for (let k = 0; k < stu_list.length; k++) {       // 출석 데이터를 전부 수강데이터에 적용.
						for (let i = 0; i < stu_list[0].length; i++) {
							for (let j = 0; j < attend_list[0].length; j++) {
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
					for (let i = 0; i < prof_stats.length; i++) {
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
				function lecture(callback) {
					connection.query(lecture_sql, u_id, function (err, rows) {
						if (err) return callback(err);
						if (rows.length == 0) return callback('통계 실패!!!!');
						else if (rows) {
							for (let i = 0; i < rows.length; i++) {
								lecture_list.push(rows[i]);   // 해당 학생의 수강 강의 리스트(l_id, l_name)
							}
							callback(null, lecture_list);
						}
					});
				},
				function count(lecture_list, callback) {
					for (let i = 0; i < lecture_list.length; i++) {
						count_params.push(lecture_list[i].l_id);
						connection.query(count_sql, count_params, function (err, rows) {
							if (err) return callback(err);
							if (rows) count_list.push(rows[0]);         // cnt값 3개를 리스트에 넣음
							if (i == lecture_list.length - 1) {
								callback(null, lecture_list);
							}
						});
						count_params.pop();
					}
				},
				function attend(lecture_list, callback) {
					for (let i = 0; i < lecture_list.length; i++) {
						attend_params.unshift(lecture_list[i].l_id);
						connection.query(stu_attend_sql, attend_params, function (err, rows) {
							if (err) return callback(err);
							if (rows) attend_list.push(rows);         // a_list 용 데이터
							if (i == lecture_list.length - 1) {
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
					stats_temp = (sum_cnt.attend_sum + sum_cnt.lateness_sum - (sum_cnt.lateness_sum / 3)) / total_cnt.total;
					if (isNaN(stats_temp)) {
						stats_temp = 0;
					}
					statistics = stats_temp * 100 + '%';
					// attend_list에서 시작시간 ~ 종료시간으로 포맷 만들 것
					for (let i = 0; i < attend_list.length; i++) {
						for (let j = 0; j < attend_list[i].length; j++) {
							attend_list[i][j].l_time = attend_list[i][j].start_time + ' ~ ' + attend_list[i][j].end_time;
							delete attend_list[i][j].start_time;
							delete attend_list[i][j].end_time;
						}
					}
					// l_list(강의명과 강의별 출결 카운트 및 현황)
					for (let i = 0; i < lecture_list.length; i++) {
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

// ================== class declare ================== //

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