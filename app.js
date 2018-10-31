'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const fcm = require('./util/fcm');
const auth = require('./routes/auth'),
      lecture = require('./routes/lecture'),
      course = require('./routes/course'),
      attendance = require('./routes/attendance'),
      statistics = require('./routes/statistics'),
      calendar = require('./routes/calendar');
// const schedule = require('./schedule');

const app = express();

//===== body-parser 사용 설정 =====//   router 사용설정은 bodyParser 사용설정 보다 아래에 있어야함.
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

//===== router 사용 설정 =====//
app.use('/', auth);
app.use('/', lecture);
app.use('/', course);
app.use('/', calendar);
app.use('/attendance', attendance);
app.use('/statistics', statistics);

//===== FCM 초기화 =====//
fcm.init();

//===== 이탈여부 감지 scheduler 실행 =====//
// schedule.sit();

//===== 404 처리 부분 =====//
app.use((req, res, next) => {
    res.status(404).json({ false: '일치하는 주소가 없습니다!'});
});

//===== 에러 처리 부분 =====//
app.use((err, req, res, next) => {  
    console.error(err.stack); // 에러 메시지 표시
    res.status(500).json({ false:'서버 에러!'}); // 500 상태 표시 후 에러 메시지 전송
});

//===== 서버 시작 =====//
const server = http.createServer(app).listen(3000, function (err) {
    console.log('server!!!');
});
