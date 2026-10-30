#!/bin/bash

set -e

REPO_NAME=$(jq -r ".repository.full_name" "$GITHUB_EVENT_PATH")
PR_NUMBER=${1:-}
TARGET_BRANCH=${2:-}

onerror() {
	gh pr comment $PR_NUMBER --body "🤖 says: ‼️ cherry pick action failed.<br/>See: https://github.com/$REPO_NAME/actions/runs/$GITHUB_RUN_ID"
	exit 1
}
trap onerror ERR

if [ -z "$PR_NUMBER" ]; then
	echo "Usage: $0 <pr-number> [target-branch]"
  exit 1
fi

if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Usage: $0 <pr-number> [target-branch]"
  exit 1
fi

echo "Collecting information about PR #$PR_NUMBER of $GITHUB_REPOSITORY..."

URI=https://api.github.com

MAX_RETRIES=${MAX_RETRIES:-6}
RETRY_INTERVAL=${RETRY_INTERVAL:-10}
MERGED=""
MERGE_COMMIT=""
pr_resp=""

for ((i = 0 ; i < $MAX_RETRIES ; i++)); do
	pr_resp=$(gh api "${URI}/repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER")
	MERGED=$(echo "$pr_resp" | jq -r .merged)
	MERGE_COMMIT=$(echo "$pr_resp" | jq -r .merge_commit_sha)
	if [[ "$MERGED" == "null" ]]; then
		echo "The PR is not ready to cherry-pick, retry after $RETRY_INTERVAL seconds"
		sleep $RETRY_INTERVAL
		continue
	else
		break
	fi
done

if [[ "$MERGED" != "true" ]] ; then
	echo "PR is not merged! Can't cherry pick it."
	gh pr comment $PR_NUMBER --body "🤖 says: ‼️ PR can't be cherry-picked, please merge it first."
	exit 1
fi

echo "Target branch for PR #$PR_NUMBER is $TARGET_BRANCH"

# make sure branches are up-to-date
git fetch origin $TARGET_BRANCH
git checkout -b $TARGET_BRANCH origin/$TARGET_BRANCH

git cherry-pick $MERGE_COMMIT &> /tmp/error.log || (
		gh pr comment $PR_NUMBER --body "🤖 says: Error cherry-picking.<br/><br/>$(cat /tmp/error.log)"
		gh issue create --title "Error cherry-picking PR #$PR_NUMBER" --body "Error cherry-picking PR #$PR_NUMBER into $TARGET_BRANCH:<br/><br/>$(cat /tmp/error.log)" --assignee "cuisongliu" --label "cherry-pick"
		exit 1
)

gh pr comment $PR_NUMBER --body "🤖 says: cherry pick action finished successfully 🎉!<br/>See: https://github.com/$REPO_NAME/actions/runs/$GITHUB_RUN_ID"
