# Discord issue alerts

`.github/workflows/discord-issues.yml` sends new GitHub issues to the project's
Discord channel. Each card includes the repository, issue title, author and link.
New issue comments also send a card with the comment author and a direct link
to the comment. Comments by `kylejschultz` (GitHub user ID `82205484`) are skipped;
other users and bots are included. Edits, deletions, reopened issues and pull
request comments do not send alerts. Mentions are disabled, and issue/comment
bodies are not copied to Discord.

Create an incoming Discord webhook in the intended channel and save its URL as
an Actions repository secret named `DISCORD_ISSUES_WEBHOOK_URL`. Keep the URL out
of source and logs. This secret is separate from release announcements.

The workflow must be on the repository's default branch to receive issue events.
Run **Discord issue alerts** manually from Actions to send a clearly labelled
setup test. Then verify a newly opened issue produces one card in the correct
channel. A missing secret or delivery failure fails the workflow visibly; after
checking the destination, a manual rerun may send another card.
