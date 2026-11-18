# Project instructions

## User's standing requirements

- Build an independent Avon shipping application based on the useful workflows and layout patterns of app.eshipz.com. Improve usability and weak functionality. Use original or appropriately licensed assets; do not copy proprietary APIs or assets.
- Target a working small-scale local application by the end of the five stages in docs/five-stage-roadmap.md. Hosting and public deployment are excluded until explicitly requested.
- Use the installed Ponytail skill throughout implementation, architecture decisions, refactoring and fixes, even when not mentioned in subsequent prompts. Prefer simple maintainable solutions without sacrificing required features, validation, accessibility or security.
- Use the installed CodeRabbit skill throughout development: review meaningful change batches and each stage's final changes, address relevant issues, and report actual review status. Do not substitute a manual review for CodeRabbit or claim a review passed if the service was unavailable. Surface authentication or service blockers explicitly.
- Each stage needs working behavior, appropriate checks and a clear completion report. Distinguish actual external integrations from simulated carrier responses.
- Current authorization: Stage 1 implementation, local setup and validation are authorized. The user has authorized committing and pushing Stage 1 to GitHub. Do not proceed to Stage 2 or host until separately authorized. The earlier planning-only restriction was superseded by the user's instruction to start Stage 1.
- Keep credentials, customer records and session tokens out of source control.

## Planning references

- docs/reference-audit.md: inspected reference features and known access gaps.
- docs/five-stage-roadmap.md: current five-stage delivery sequence; supersedes the earlier build plan's phase order and hosting suggestions.
- docs/build-plan.md: candidate technical options, subject to the current roadmap and Ponytail simplicity review.
