'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const db_pool = require('./db/db_pool');
const router = require('./routes/router');

const app = express();

//===== body-parser 사용 설정 =====//
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

//===== router 사용 설정 =====//
app.use('/', router);  // router 사용설정은 bodyParser 사용설정 보다 아래에 있어야함.

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
