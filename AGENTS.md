<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Changelog maintenance rule

When committing any **Major Feature**, **Critical Bug Fix**, or **Architectural
Change**, always append a short bullet under `## [Unreleased]` in the root
`CHANGELOG.md`, or create a new version header (`## [x.y.z] - YYYY-MM-DD`).

Use Keep a Changelog category headings so the `/changelog` timeline renders it:
`### Added` (🟢), `### Changed` (🟡), `### Fixed` (🔴), `### Security` (🔒).
