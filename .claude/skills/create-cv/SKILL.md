---
name: create-cv
description: Create a tailored CV for a specific position. Provide position title and optionally a job description.
---

# CV Creation Workflow

Create a tailored CV for a target position using research, professional history, and hiring manager review.

## Workflow Steps

### Step 1: Match Analysis
Use the **hiring-manager-reviewer** sub-agent to:
- Compare the job description against `.claude/templates/ai-engineer-cv-temp.html` and `.claude/tomer-docs/tomer-history.md`
- Provide a match score out of 100
- List the top 5 missing keywords from the job description

### Step 2: Rewrite Resume
Use the **rewrite-resume** sub-agent to:
- Take the missing keywords from Step 1
- Rewrite the resume to naturally include those keywords
- Use Google's X-Y-Z formula for achievements: "Accomplished X, as measured by Y, by doing Z"
- Save the new CV to `new-cvs/<position-name>.html`

### Step 3: ATS Scan
Use the **application-tracking-system** sub-agent to:
- Act as an ATS filter
- Scan the updated resume
- Identify which sections a bot would struggle to read
- Provide recommendations for ATS compatibility

### Step 4: Verify Accuracy
Re-read `.claude/tomer-docs/tomer-history.md` and `.claude/templates/ai-engineer-cv-temp.html` to:
- Verify no information was fabricated
- Ensure all claims are backed by real experience
- Flag any discrepancies for review

## Input

The user will provide the job description when prompted.

## Important Rules

- **Never lie or fabricate information** - Only include real experience, skills, and achievements from the professional history
- **Ask before assuming** - If unsure about any detail, ask the user for clarification before adding it to the CV
- **Don't change "website" text to "vibki.com"** - Keep the website placeholder text as-is in the template

## Workflow Start

When this skill is invoked:
1. **Always ask the user** to paste the job description for the position
2. Wait for the user to provide the job description before starting research
3. Use the job description to better understand requirements and tailor the CV

## Usage

```
/create-cv
```

The skill will ask you to provide the position title and paste the job description.

## Output

A tailored CV saved in `new-cvs/` folder, reviewed and refined for the target position.
