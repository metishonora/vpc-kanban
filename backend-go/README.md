# VPC Kanban Go Backend

이 프로젝트는 기존 Rust 기반 백엔드를 대체할 수 있는 Go 언어 기반 백엔드입니다. (Rust가 설치되지 않은 환경 등에서 구동)

## 특징
- 기존 Rust 코드와 완전히 동일한 API 호환성
- `../frontend` 폴더의 정적 파일 자동 서빙
- `../kanban.db` SQLite 데이터베이스 공유
- Gin 프레임워크 기반 REST API

## 빌드 및 실행 방법

1. **Go 언어 설치 필요**  
   현재 시스템에 `go` 가 설치되어 있지 않다면, [Golang 공식 홈페이지](https://go.dev/doc/install) 또는 Homebrew를 통해 설치해야 합니다.
   ```bash
   brew install go
   ```

2. **의존성 설치**
   `backend-go` 폴더 안에서 다음 명령어를 실행하여 모듈을 초기화하고 의존성을 다운로드합니다:
   ```bash
   go mod init vpc-kanban-go
   go mod tidy
   ```

3. **실행**
   ```bash
   go run main.go
   ```
   또는 빌드 후 실행:
   ```bash
   go build
   ./vpc-kanban-go
   ```

서버는 기본적으로 `http://localhost:3000` 에서 구동됩니다.
