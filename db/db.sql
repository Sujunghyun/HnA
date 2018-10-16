-- 수정하기. 캘린더에 유저식별키 필요

CREATE TABLE USER (    -- 사용자 테이블
    u_id VARCHAR(30),                       -- 로그인이나 회원가입 시에 연동 API에서 발급되는 토큰
    u_name VARCHAR(20) NOT NULL,            -- 사용자명 (입력받는 값)
    u_depart VARCHAR(30) NOT NULL,          -- 학과 (입력받는 값)
    identifier VARCHAR(20) NOT NULL,        -- 학번/사번 (입력받는 값)
    grade TINYINT,                          -- 학년 (학생만 입력받는 값)
    photo_url VARCHAR(100),                 -- 사진 URL. 토큰에 포함되어있는 값.
    u_role VARCHAR(10) NOT NULL,            -- 교수/학생 구분
    PRIMARY KEY (u_id)                      -- 기본키. 토큰
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE LECTURE (    -- 강의 테이블
    l_id SMALLINT AUTO_INCREMENT,                -- 강의 일련번호
    l_name VARCHAR(30) NOT NULL,                 -- 강의명 (개설 시 입력받는 값)
    l_room VARCHAR(6) NOT NULL,                  -- 강의실 (개설 시 입력받는 값)
    l_grade TINYINT NOT NULL,                    -- 학년 (개설 시 입력받는 값)
    l_semester TINYINT NOT NULL,                 -- 학기 (개설 시 입력받는 값)
    l_day VARCHAR(5) NOT NULL,                   -- 강의 요일 (개설 시 입력받는 값)
    l_class VARCHAR(2) NOT NULL,                 -- 분반 (개설 시 입력받는 값)
    prof_name VARCHAR(20) NOT NULL,              -- 교수이름 (개설 시 입력받는 값)
    start_time TIME,                             -- 강의 시작시간 (개설 시 입력받는 값)
    end_time TIME,                               -- 강의 종료시간 (개설 시 입력받는 값)
    supplement TINYINT(1) DEFAULT 0,             -- 보강여부 DEFAULT 값은 0(보강아님)
    PRIMARY KEY (l_id)                           -- 기본키. 강의 일련번호
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE COURSE (    -- 수강 테이블
    c_id INT AUTO_INCREMENT,                    -- 수강 일련번호 
    u_id VARCHAR(30),                      
    u_name VARCHAR(20) NOT NULL,                -- 사용자명
    identifier VARCHAR(20) NOT NULL,            -- 학번/사번
    l_id SMALLINT,                         
    l_name VARCHAR(30) NOT NULL,                -- 강의명 (개설 시 입력받는 값)
    state VARCHAR(30) DEFAULT '수업 준비 중',    -- 강의 상태
    real_start_time TIME,                       -- 강의 상태 변경 시간(교수가 실제로 수업 시작한 시간)
    start_time TIME,                            -- 강의 시작시간 (개설 시 입력받는 값)
    end_time TIME,                              -- 강의 종료시간 (개설 시 입력받는 값)    
    beacon_id VARCHAR(50),                      -- 비콘 아이디
    PRIMARY KEY (c_id),                         -- 기본키. 수강 일련번호
    FOREIGN KEY (u_id)                          -- 외래키. 토큰
    REFERENCES USER(u_id),
    FOREIGN KEY (l_id)                          -- 외래키. 강의 일련번호
    REFERENCES LECTURE(l_id)
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE ATTENDANCE (    -- 출결 테이블 // 수강일련번호로 유저정보 조회해서 가져올 것.
    a_id INT AUTO_INCREMENT,                 -- 출결 일련번호
    a_date DATE NOT NULL,                    -- 강의 날짜
    c_id INT,                                -- 수강정보 조회 시 필요.
    attend VARCHAR(20) NOT NULL,             -- 출결여부 (출석, 지각, 결석, 출결기타(병결, 조퇴, 휴강, etc...))
    depart TINYINT(1) DEFAULT 0,             -- 이탈여부 DEFAULT 값은 0(이탈안함), TINYINT(1)은 BOOLEAN 값을 표현.
    PRIMARY KEY (a_id),                      -- 기본키. 출결 일련번호
    FOREIGN KEY (c_id)                       -- 외래키. 수강 일련번호
    REFERENCES COURSE(c_id)
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE BOARD (    -- 게시판 테이블
    b_id INT AUTO_INCREMENT,               -- 게시글 일련번호.
    u_id VARCHAR(30),  
    u_name VARCHAR(20) NOT NULL,           -- U_ID 받아서 해결함.
    u_depart VARCHAR(30) NOT NULL,         -- U_ID 받아서 해결함.
    title VARCHAR(30) NOT NULL,            -- 제목
    contents VARCHAR(1000) NOT NULL,       -- 내용 
    counts SMALLINT NOT NULL,              -- 조회수
    reg_date TIMESTAMP NOT NULL,           -- 작성일시로 정렬
    comments SMALLINT NOT NULL,            -- 댓글수
    PRIMARY KEY (b_id),                    -- 기본키. 게시글 일련번호
    FOREIGN KEY (u_id)                     -- 외래키. 토큰
    REFERENCES USER(u_id)    
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE COMMENTS (    -- 게시판 댓글 테이블
    cm_id INT AUTO_INCREMENT,              -- 댓글 일련번호. 댓글을 찾아서 여기에 댓글을 등록할 수 있도록함.
    b_id INT,                              -- 게시글 일련번호. 어떤 글의 댓글인지 구분하기 위해 필요
    u_id VARCHAR(30),  
    u_name VARCHAR(20) NOT NULL,           -- U_ID 받아서 해결함.
    contents VARCHAR(300) NOT NULL,        -- 댓글 내용    
    reg_date TIMESTAMP NOT NULL,           -- 작성일시로 정렬
    depth TINYINT NOT NULL,                -- 몇 차 댓글인지(댓글, 댓글의 댓글, ...)
    PRIMARY KEY (cm_id),                   -- 기본키. 댓글 일련번호
    FOREIGN KEY (u_id)                     -- 외래키. 토큰
    REFERENCES USER(u_id),
    FOREIGN KEY (b_id)                     -- 외래키. 게시글 일련번호 
    REFERENCES BOARD(b_id)
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE CALENDAR (    -- 캘린더 테이블
    u_id VARCHAR(30),    
    ddate DATE NOT NULL,                    -- 일정 년/월/일
    start_time TIME,                        -- 일정 시작시간
    end_time TIME,                          -- 일정 종료시간
    title VARCHAR(50) NOT NULL,             -- 일정 제목
    place VARCHAR(50),                      -- 일정 장소
    schedule VARCHAR(200),                  -- 일정 내용
    FOREIGN KEY (u_id)                      -- 외래키. 토큰
    REFERENCES USER(u_id)
) ENGINE=innoDB DEFAULT CHARSET=utf8; 