# StackFlow Development Convention

Date: 2026-07-29
Status: Active

## Issue Title

Format:

```text
[emoji Type] work summary
```

Examples:

```text
[✨ Feat] 로그인 API 구현
[🔨 Fix] 홈 피드 조회 시 500 에러 수정
[🧹 Chore] 공통 예외 응답 포맷 정리
[📝 Docs] 배포 가이드 문서화
[♻️ Refactor] 인증 필터 구조 분리
```

Type guide:

| Type | Emoji | Usage |
| --- | --- | --- |
| Feat | ✨ | New feature |
| Fix | 🔨 | Bug fix |
| Chore | 🧹 | Config, build, dependency, operation |
| Docs | 📝 | Documentation |
| Refactor | ♻️ | Structure improvement without behavior change |

## Branch Name

Format:

```text
type/issue-number-work-summary
```

Examples:

```text
feat/12-login-api
fix/34-feed-500-error
chore/5-exception-format
```

Rules:

- Use lowercase letters and hyphens.
- Include the GitHub issue number.
- Do not include emojis in branch names.
- Keep the branch name terminal/automation friendly.

## Pull Request Title

Format:

```text
[emoji Type] work summary (#issue-number)
```

Examples:

```text
[✨ Feat] 로그인 API 구현 (#12)
[🔨 Fix] 홈 피드 조회 시 500 에러 수정 (#34)
```

Rules:

- Keep the PR title context aligned with the issue title.
- The PR body must include `Closes #issue-number` or `Fixes #issue-number`.

## Commit Message

Format:

```text
type: emoji work summary
```

Examples:

```text
feat: ✨ 로그인 API 구현
fix: 🔨 피드 조회 500 에러 수정
chore: 🧹 예외 응답 코드 정리
docs: 📝 README 업데이트
refactor: ♻️ 인증 로직 분리
```

Rules:

- The commit type should map to the issue type.
- Use the same emoji as the corresponding type.
- Keep the summary short and action-oriented.

## Linked Example

```text
Issue:  [✨ Feat] 로그인 API 구현
Branch: feat/12-login-api
PR:     [✨ Feat] 로그인 API 구현 (#12)
Commit: feat: ✨ 로그인 API 구현
```

## Current Project Rule

For StackFlow, use the GitHub issue number as the tracking number for branch and PR references.
