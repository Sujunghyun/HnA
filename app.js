'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const helmet = require('helmet');
const fs = require('fs');
const fcm = require('./util/fcm');
// const schedule = require('./util/schedule');
const auth = require('./routes/auth'),
      lecture = require('./routes/lecture'),
      course = require('./routes/course'),
      attendance = require('./routes/attendance'),
      statistics = require('./routes/statistics'),
      calendar = require('./routes/calendar');

const app = express();

//===== body-parser 사용 설정 =====//   router 사용설정은 bodyParser 사용설정 보다 아래에 있어야함.
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

//===== HTTP 헤더 설정 =====//      helmet을 이용한 기초적인 보안강화
// app.use(helmet());
app.use(helmet.dnsPrefetchControl());            // DNS prefetching을 방지함으로써 사용자가 방문하지 않은 페이지를 방문한 것처럼하는 일을 방지한다. (필요없을 수도 있는데 혹시나해서 추가)
app.use(helmet.frameguard({ action: 'deny' }));  // Clickjacking을 방지함으로써 사용자가 원하지 않았던 클릭을 막는다.
app.use(helmet.hidePoweredBy());     // 이 헤더(기본적으로 사용하도록 설정되어 있음)를 이용해 Express를 실행하는 앱을 발견, 특정한 대상에 대한 공격을 실행할 수 있다. 사용하지 않도록 설정
app.use(helmet.ieNoOpen());          // 이전 버전의 IE로부터의 신뢰할 수 없는 파일 다운로드를 금지한다. 
app.use(helmet.noSniff());           // X-Content-Type-Options 헤더를 nosniff로 설정해 브라우저가 MIME 유형을 숨기지 않도록 만들어 서버가 잘못된 컨텐츠 유형을 전송하거나 실행되는 것을 방지함.
app.use(helmet.referrerPolicy({ policy: 'no-referrer' }));    // referrer 정보를 관리한다. 조작될 여지가 없도록 어떤 referrer 정보도 발송되지 않도록 지정한다. 
app.use(helmet.xssFilter());         // X-XSS-Protection 헤더를 설정해 기초적인 XXS(Cross-site scripting) 공격을 막는다.

//===== apk 다운로드용 페이지 =====//
app.get('/', function(req, res){
	fs.readFile('./apkdwld.html', function(error, data){ //파일 다운로드용 테스트 페이지를 제공한다
		res.writeHead(200, {'Content-Type':'text/html'});
		res.end(data);
	});
});

//===== router 사용 설정 =====//
app.use('/', auth);
app.use('/', lecture);
app.use('/', course);
app.use('/', calendar);
app.use('/', statistics);
app.use('/attendance', attendance);

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
