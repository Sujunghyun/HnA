-- 수정하기. 캘린더에 유저식별키 필요

CREATE TABLE USER (    -- 사용자 테이블
    U_ID VARCHAR(30),                       -- 로그인이나 회원가입 시에 연동 API에서 발급되는 토큰
    U_NAME VARCHAR(20) NOT NULL,            -- 사용자명 (입력받는 값)
    DEPARTMENT VARCHAR(30) NOT NULL,        -- 학과 (입력받는 값)
    STUDENT_ID INT NOT NULL,                -- 학번 (학생만 입력받는 값)
    GRADE TINYINT NOT NULL,                 -- 학년 (학생만 입력받는 값)
    PHOTO_URL VARCHAR(100),                 -- 사진 URL. 토큰에 포함되어있는 값.
    U_ROLE VARCHAR(10) NOT NULL,            -- 교수/학생 구분
    PRIMARY KEY (U_ID)                      -- 기본키. 토큰
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE LECTURE (    -- 강의 테이블
    L_ID SMALLINT AUTO_INCREMENT,                -- 강의 일련번호
    L_NAME VARCHAR(30) NOT NULL,                 -- 강의명 (개설 시 입력받는 값)
    L_ROOM VARCHAR(6) NOT NULL,                  -- 강의실 (개설 시 입력받는 값)
    L_GRADE TINYINT NOT NULL,                    -- 학년 (개설 시 입력받는 값)
    PROF_NAME VARCHAR(20) NOT NULL,              -- 교수이름 (개설 시 입력받는 값)
    CLASS VARCHAR(2) NOT NULL,                   -- 분반 (개설 시 입력받는 값)
    START_TIME TIME,                             -- 강의 시작시간 (개설 시 입력받는 값)
    END_TIME TIME,                               -- 강의 종료시간 (개설 시 입력받는 값)
    SUPPLEMENT TINYINT(1) NOT NULL DEFAULT 0,    -- 보강여부 DEFAULT 값은 0(보강아님)
    PRIMARY KEY (L_ID)                           -- 기본키. 강의 일련번호
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE COURSE (    -- 수강 테이블
    C_ID INT AUTO_INCREMENT,                -- 수강 일련번호 
    U_ID VARCHAR(30),                      
    U_NAME VARCHAR(20) NOT NULL,            -- 사용자명
    STUDENT_ID INT NOT NULL,                -- 학번
    L_ID SMALLINT,                         
    L_NAME VARCHAR(30) NOT NULL,            -- 강의명 (개설 시 입력받는 값)
    START_TIME TIME,                        -- 강의 시작시간 (개설 시 입력받는 값)
    END_TIME TIME,                          -- 강의 종료시간 (개설 시 입력받는 값)    
    PRIMARY KEY (C_ID),                     -- 기본키. 수강 일련번호
    FOREIGN KEY (U_ID)                      -- 외래키. 토큰
    REFERENCES USER(U_ID),
    FOREIGN KEY (L_ID)                      -- 외래키. 강의 일련번호
    REFERENCES LECTURE(L_ID)
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE ATTENDENCE (    -- 출결 테이블
    A_ID INT AUTO_INCREMENT,                 -- 출결 일련번호
    A_DATE DATE NOT NULL,                    -- 강의 날짜
    C_ID INT,                                -- 수강정보 조회 시 필요.
    ATTEND VARCHAR(20) NOT NULL,             -- 출결여부 (출석, 지각, 결석, 출결기타(병결, 조퇴, 휴강, etc...))
    DEPART TINYINT(1) NOT NULL DEFAULT 0,    -- 이탈여부 DEFAULT 값은 0(이탈안함)
    PRIMARY KEY (A_ID),                      -- 기본키. 출결 일련번호
    FOREIGN KEY (C_ID)                       -- 외래키. 수강 일련번호
    REFERENCES COURSE(C_ID)
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE BOARD (    -- 게시판 테이블
    B_ID INT AUTO_INCREMENT,               -- 게시글 일련번호.
    U_ID VARCHAR(30),  
    U_NAME VARCHAR(20) NOT NULL,           -- U_ID 받아서 해결함.
    DEPARTMENT VARCHAR(30) NOT NULL,       -- U_ID 받아서 해결함.
    TITLE VARCHAR(30) NOT NULL,            -- 제목
    CONTENTS VARCHAR(1000) NOT NULL,       -- 내용 
    COUNTS SMALLINT NOT NULL,              -- 조회수
    REG_DATE TIMESTAMP NOT NULL,           -- 작성일시로 정렬
    COMMENTS SMALLINT NOT NULL,            -- 댓글수
    PRIMARY KEY (B_ID),                    -- 기본키. 게시글 일련번호
    FOREIGN KEY (U_ID)                     -- 외래키. 토큰
    REFERENCES USER(U_ID)    
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE COMMENTS (    -- 게시판 댓글 테이블
    CM_ID INT AUTO_INCREMENT,              -- 댓글 일련번호. 댓글을 찾아서 여기에 댓글을 등록할 수 있도록함.
    B_ID INT,                              -- 게시글 일련번호. 어떤 글의 댓글인지 구분하기 위해 필요
    U_ID VARCHAR(30),  
    U_NAME VARCHAR(20) NOT NULL,           -- U_ID 받아서 해결함.
    CONTENTS VARCHAR(300) NOT NULL,        -- 댓글 내용    
    REG_DATE TIMESTAMP NOT NULL,           -- 작성일시로 정렬
    DEPTH TINYINT NOT NULL,                -- 몇 차 댓글인지(댓글, 댓글의 댓글, ...)
    PRIMARY KEY (CM_ID),                   -- 기본키. 댓글 일련번호
    FOREIGN KEY (U_ID)                     -- 외래키. 토큰
    REFERENCES USER(U_ID),
    FOREIGN KEY (B_ID)                     -- 외래키. 게시글 일련번호 
    REFERENCES BOARD(B_ID)
) ENGINE=innoDB DEFAULT CHARSET=utf8;

CREATE TABLE CALENDAR (    -- 캘린더 테이블
    U_ID VARCHAR(30),    
    DDATE DATE NOT NULL,                    -- 일정 년/월/일
    START_TIME TIME,                        -- 일정 시작시간
    END_TIME TIME,                          -- 일정 종료시간
    TITLE VARCHAR(50) NOT NULL,             -- 일정 제목
    PLACE VARCHAR(50),                      -- 일정 장소
    SCHEDULE VARCHAR(200),                  -- 일정 내용
    FOREIGN KEY (U_ID)                      -- 외래키. 토큰
    REFERENCES USER(U_ID)
) ENGINE=innoDB DEFAULT CHARSET=utf8; 