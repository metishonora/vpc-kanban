# VPC Kanban Python Backend

이 프로젝트는 기존 Rust 기반 백엔드를 대체할 수 있는 Python 언어 기반 백엔드입니다. (Rust가 설치되지 않은 환경 등에서 구동)
`FastAPI` 프레임워크와 `SQLite3`를 사용합니다.

## 특징
- 기존 Rust 코드와 완전히 동일한 API 호환성 (`pydantic` 모델 검증 포함)
- `../frontend` 폴더의 정적 파일 자동 서빙
- `../kanban.db` SQLite 데이터베이스 공유

## 빌드 및 실행 방법

1. **Python 설치 필요**  
   현재 시스템에 `python3` (최소 3.8 이상 권장) 가 설치되어 있어야 합니다.

2. **의존성 설치**
   `backend-python` 폴더 안에서 다음 명령어를 실행하여 가상환경을 생성하고 의존성을 다운로드합니다:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. **실행**
   ```bash
   python3 main.py
   ```
   또는 uvicorn으로 직접 실행:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 3000
   ```

서버는 기본적으로 `http://localhost:3000` 에서 구동됩니다.
