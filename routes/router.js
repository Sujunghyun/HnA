'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../db/db_pool')
const _ = require('lodash');

// uid랑 email받아서 email을 id처럼 사용. 
// uid를 facebook이나 google에 보내서 정상적인 사용자인지 확인
router.post('/login', (req, res) => {
    let uid = req.body.uid,
        sql = 'select * from USER where U_ID = ?';     
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

router.post('/signup', (req, res) => { 
    // _.pick로 파라미터 정리
    const temp = _.pick(req.body, ['uid', 'uname', 'department', 'student_id', 'grade', 'photo_url', 'role']),
          sql = 'insert into USER (U_ID, U_NAME, DEPARTMENT, STUDENT_ID, GRADE, PHOTO_URL, U_ROLE) values (?,?,?,?,?,?,?);'
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


module.exports = router;
