# Codex automatic review smoke test

This documentation-only change provides a pull request for checking that Codex
reviews new, ready-for-review pull requests automatically in this repository.

## Verification

1. Open the test pull request as ready for review.
2. Wait for an automatic response from the Codex GitHub integration.
3. Confirm that the response refers to the latest commit on the pull request.

A Codex review or completion reaction confirms that the integration responded;
GitHub Actions checks alone do not establish that Codex reviewed the change.
Avoid manually requesting a review while testing the automatic trigger.

This file does not change application behavior. The test pull request can be
closed without merging after verification.
