This is a Next.js 14 (App Router) Jira helper app that exposes a small UI and backend for calling Jira Cloud and returning JSON you can copy or download.

## Features

- Home dashboard listing available functions.
- Get ticket information by key (e.g. `PROJ-123`).
- Get all tickets in a specified sprint with their comments.
- JSON results viewer with copy-to-clipboard and `.json` download.

## Prerequisites

- Node.js 18 or later.
- A Jira Cloud site with an API token.

Set the following environment variables in a `.env.local` file at the project root:

```bash
JIRA_BASE_URL="https://your-domain.atlassian.net"
JIRA_EMAIL="your-email@example.com"
JIRA_API_TOKEN="your-api-token-here"
```

## Running the app

Install dependencies (already done if you just scaffolded the project):

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open http://localhost:3000 in your browser.

## Using the tools

- On the home page, choose **Get ticket information** or **Get sprint tickets with comments**.
- Fill in the required input (issue key or sprint ID) and click **Run**.
- View the JSON in the result pane, then use **Copy JSON** or **Download .json** as needed.

## Linting

To run ESLint checks:

```bash
npm run lint
```
