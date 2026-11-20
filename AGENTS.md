# Project instructions

## User's standing requirements

- Build an independent Avon shipping application based on the useful workflows and layout patterns of app.eshipz.com. Improve usability and weak functionality. Use original or appropriately licensed assets; do not copy proprietary APIs or assets.
- Target a working small-scale local application by the end of the five stages in docs/five-stage-roadmap.md. Hosting and public deployment are excluded until explicitly requested.
- Use the installed Ponytail skill throughout implementation, architecture decisions, refactoring and fixes, even when not mentioned in subsequent prompts. Prefer simple maintainable solutions without sacrificing required features, validation, accessibility or security.
- Use the installed CodeRabbit skill throughout development: review meaningful change batches and each stage's final changes, address relevant issues, and report actual review status. Do not substitute a manual review for CodeRabbit or claim a review passed if the service was unavailable. Surface authentication or service blockers explicitly.
- Each stage needs working behavior, appropriate checks and a clear completion report. Distinguish actual external integrations from simulated carrier responses.
- Current authorization: Stage 5 local implementation and validation are authorized by the user's latest request. Stage 3 was committed and pushed; Stage 4 remains local. Do not connect external carriers: the user has no Blue Dart API documentation yet and explicitly requested a backend ready for later integration. Blue Dart is the first future carrier. Customer isolation remains mandatory. Hosting remains excluded; Stage 5 commit/push needs a separate request.
- Keep credentials, customer records and session tokens out of source control.

## Planning references

- docs/reference-audit.md: inspected reference features and known access gaps.
- docs/five-stage-roadmap.md: current five-stage delivery sequence; supersedes the earlier build plan's phase order and hosting suggestions.
- docs/build-plan.md: candidate technical options, subject to the current roadmap and Ponytail simplicity review.
